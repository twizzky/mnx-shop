// supabase/functions/admin-orders/index.ts
//
// Server-side only. Deploy with: supabase functions deploy admin-orders
// Uses the same ADMIN_PIN secret as admin-images.
//
// Why an Edge Function: the orders table has select-only RLS for the
// public role (customers can insert orders, but nobody can read them
// from the browser). This function holds the service-role key server-side
// and is the only path allowed to read/update orders.
//
// Requests:
//   GET  /functions/v1/admin-orders           -> list ALL orders (newest first)
//   PATCH ?id=<uuid>&status=<new>&actor=<name>  -> update order status
//
// PIN in x-admin-pin header (or `pin` query field as fallback).
// anon key in Authorization: Bearer <anon key> (gateway requires a JWT).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ADMIN_PIN = Deno.env.get('ADMIN_PIN');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const ALLOWED_STATUSES = new Set([
  'pending',
  'confirmed',
  'shipped',
  'delayed',
  'no answer',
  'cancelled',
]);

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

async function pinFromReq(req: Request): Promise<string> {
  return (
    req.headers.get('x-admin-pin') ||
    new URL(req.url).searchParams.get('pin') ||
    ''
  ).trim();
}

async function audit(
  supabaseAdmin: ReturnType<typeof createClient>,
  actor: string,
  action: string,
  productIds: string[],
  detail: string
) {
  try {
    const { error } = await supabaseAdmin.from('admin_audit_log').insert({
      actor: actor.trim() || 'unattributed',
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

  const presented = await pinFromReq(req);
  if (!presented || !pinMatches(presented, ADMIN_PIN)) {
    return jsonResponse({ success: false, error: 'Incorrect PIN.' }, 401);
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // ---------- list orders ----------
    if (req.method === 'GET') {
      const { data, error } = await supabaseAdmin
        .from('orders')
        .select('*, order_items(*, products(*))')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('list orders failed:', error.message);
        return jsonResponse({ success: false, error: 'Could not load orders.' }, 500);
      }
      return jsonResponse({ success: true, orders: data || [] });
    }

    // ---------- update status ----------
    if (req.method === 'PATCH') {
      const url = new URL(req.url);
      const id = url.searchParams.get('id') || '';
      const status = url.searchParams.get('status') || '';
      const actor = url.searchParams.get('actor') || '';

      if (!id || !status) {
        return jsonResponse({ success: false, error: 'Missing id or status.' }, 400);
      }
      if (!ALLOWED_STATUSES.has(status)) {
        return jsonResponse({ success: false, error: 'Invalid status.' }, 400);
      }

      // Capture current row for audit before updating.
      const { data: before, error: beforeError } = await supabaseAdmin
        .from('orders')
        .select('id, order_number, customer_name, status')
        .eq('id', id)
        .single();

      if (beforeError || !before) {
        return jsonResponse({ success: false, error: 'Order not found.' }, 404);
      }

      const { error } = await supabaseAdmin
        .from('orders')
        .update({ status })
        .eq('id', id);

      if (error) {
        console.error('update order failed:', error.message);
        return jsonResponse({ success: false, error: 'Could not update order status.' }, 500);
      }

      await audit(
        supabaseAdmin,
        actor,
        'update',
        [id],
        'Order ' + before.order_number + ' status: ' + before.status + ' -> ' + status
      );
      return jsonResponse({ success: true, id, status });
    }

    return jsonResponse({ success: false, error: 'Unknown method.' }, 405);
  } catch (err) {
    console.error('admin-orders error:', err);
    return jsonResponse({ success: false, error: 'Unexpected server error.' }, 500);
  }
});