// supabase/functions/admin-offers/index.ts
//
// Server-side only. Deploy with: supabase functions deploy admin-offers
// Configure the one secret it needs:
//   supabase secrets set ADMIN_PIN=choose-a-long-random-pin
// (the same ADMIN_PIN used by admin-images — both admin functions share it).
//
// Why an Edge Function: writing offers needs the service-role key (offers
// are write-locked to the public via RLS — see the migration), and the PIN
// must never ship to the browser. This function holds the PIN as a Supabase
// secret and is the only path allowed to create/update/delete offers.
//
// Requests:
//   GET  /functions/v1/admin-offers          -> list ALL offers (incl. inactive)
//   POST action=create  ...                 -> create offer
//   POST action=update  id=<uuid> ...       -> update offer
//   POST action=delete  id=<uuid>           -> delete offer
// PIN in x-admin-pin header (or `pin` form field as fallback).
// anon key in Authorization: Bearer <anon key> (gateway requires a JWT).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ADMIN_PIN = Deno.env.get('ADMIN_PIN');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-pin',
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function pinMatches(candidate: string, expected: string): boolean {
  const a = new TextEncoder().encode(candidate);
  const b = new TextEncoder().encode(expected);
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

async function pinFromReq(req: Request, form?: FormData): Promise<string> {
  return (req.headers.get('x-admin-pin') ||
    String(form ? form.get('pin') : '')).trim();
}

async function audit(
  supabaseAdmin: ReturnType<typeof createClient>,
  form: FormData,
  action: string,
  productIds: string[],
  detail: string
) {
  try {
    const { error } = await supabaseAdmin.from('admin_audit_log').insert({
      actor: (String(form.get('actor') || '').trim() || 'unattributed').slice(0, 60),
      action,
      product_ids: productIds,
      detail: detail.slice(0, 200),
    });
    if (error) console.error('audit write failed:', error.message);
  } catch (err) {
    console.error('audit write threw:', err);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (!ADMIN_PIN) {
    return jsonResponse({ success: false, error: 'Admin PIN is not set on the server yet.' }, 500);
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ success: false, error: 'Server credentials are missing.' }, 500);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonResponse({ success: false, error: 'Invalid request body.' }, 400);
  }

  const presented = await pinFromReq(req, form);
  if (!presented || !pinMatches(presented, ADMIN_PIN)) {
    return jsonResponse({ success: false, error: 'Incorrect PIN.' }, 401);
  }

  const action = String(form.get('action') || '');
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // ---------- list (admin reads everything, incl. inactive) ----------
    if (req.method === 'GET' || action === 'list' || action === 'recent') {
      const limit = action === 'recent' ? 50 : 1000;
      const { data, error } = await supabaseAdmin
        .from('offers')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        return jsonResponse({ success: false, error: 'Could not load offers.' }, 500);
      }
      if (action === 'recent') {
        // recent = audit-log view: read the audit table for offer-related writes
        const { data: entries, error: auditError } = await supabaseAdmin
          .from('admin_audit_log')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50);
        if (auditError) {
          const missing = /does not exist/i.test(auditError.message);
          return jsonResponse({
            success: true,
            entries: [],
            auditUnavailable: true,
            error: missing ? 'Run ADMIN_AUDIT_LOG.sql in the SQL Editor.' : auditError.message,
          });
        }
        return jsonResponse({ success: true, entries: entries || [] });
      }
      return jsonResponse({ success: true, offers: data || [] });
    }

    // ---------- create ----------
    if (action === 'create') {
      const productId = String(form.get('productId') || '').trim();
      const title = String(form.get('title') || '').trim();
      const subtitle = String(form.get('subtitle') || '').trim() || null;
      const kind = String(form.get('kind') || '').trim();
      const active = String(form.get('active') || 'true') === 'true';
      const startsAt = String(form.get('startsAt') || '') || null;
      const endsAt = String(form.get('endsAt') || '') || null;

      let config: Record<string, unknown> = {};
      try {
        config = JSON.parse(String(form.get('config') || '{}'));
      } catch {
        return jsonResponse({ success: false, error: 'Invalid config.' }, 400);
      }

      if (!productId || !title || !kind) {
        return jsonResponse({ success: false, error: 'Missing required fields.' }, 400);
      }

      const insertPayload: Record<string, unknown> = {
        product_id: productId,
        title,
        subtitle,
        kind,
        config,
        active,
      };
      if (startsAt) insertPayload['starts_at'] = startsAt;
      if (endsAt) insertPayload['ends_at'] = endsAt;

      const { data, error } = await supabaseAdmin
        .from('offers')
        .insert(insertPayload)
        .select()
        .single();

      if (error) {
        console.error('create failed:', error.message);
        return jsonResponse({ success: false, error: 'Could not create offer.' }, 500);
      }
      await audit(supabaseAdmin, form, 'create', [data.id], `Created offer "${title}"`);
      return jsonResponse({ success: true, offer: data });
    }

    // ---------- update ----------
    if (action === 'update') {
      const id = String(form.get('id') || '').trim();
      if (!id) {
        return jsonResponse({ success: false, error: 'Missing offer id.' }, 400);
      }

      const updates: Record<string, unknown> = {};
      for (const field of [
        'title',
        'subtitle',
        'kind',
        'config',
        'active',
        'starts_at',
        'ends_at',
      ]) {
        const raw = form.get(field);
        if (raw === null || raw === undefined) continue;
        const val = String(raw).trim();
        if (val === '') continue;
        if (field === 'config') {
          try {
            updates[field] = JSON.parse(val);
          } catch {
            return jsonResponse({ success: false, error: 'Invalid config.' }, 400);
          }
        } else if (field === 'active') {
          updates[field] = val === 'true';
        } else {
          updates[field] = val;
        }
      }

      if (Object.keys(updates).length === 0) {
        return jsonResponse({ success: false, error: 'Nothing to update.' }, 400);
      }

      const { data, error } = await supabaseAdmin
        .from('offers')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('update failed:', error.message);
        return jsonResponse({ success: false, error: 'Could not update offer.' }, 500);
      }
      await audit(
        supabaseAdmin,
        form,
        'update',
        [data.product_id],
        `Updated offer "${data.title}"`
      );
      return jsonResponse({ success: true, offer: data });
    }

    // ---------- delete ----------
    if (action === 'delete') {
      const id = String(form.get('id') || '').trim();
      if (!id) {
        return jsonResponse({ success: false, error: 'Missing offer id.' }, 400);
      }

      // Capture product id + title before deleting, for the audit log.
      const { data: before, error: beforeError } = await supabaseAdmin
        .from('offers')
        .select('id, product_id, title')
        .eq('id', id)
        .single();

      if (beforeError || !before) {
        return jsonResponse({ success: false, error: 'Offer not found.' }, 404);
      }

      const { error } = await supabaseAdmin.from('offers').delete().eq('id', id);
      if (error) {
        console.error('delete failed:', error.message);
        return jsonResponse({ success: false, error: 'Could not delete offer.' }, 500);
      }
      await audit(
        supabaseAdmin,
        form,
        'delete',
        [before.product_id],
        `Deleted offer "${before.title}"`
      );
      return jsonResponse({ success: true, id });
    }

    return jsonResponse({ success: false, error: 'Unknown action.' }, 400);
  } catch (err) {
    console.error('admin-offers error:', err);
    return jsonResponse({ success: false, error: 'Unexpected server error.' }, 500);
  }
});