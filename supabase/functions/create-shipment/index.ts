// supabase/functions/create-shipment/index.ts
//
// Server-side only. Deploy with: supabase functions deploy create-shipment
// Configure secrets with:
//   supabase secrets set ECOTRACK_TOKEN=your_anderson_api_token
//   supabase secrets set ECOTRACK_BASE_URL=https://your-anderson-dashboard-domain
// (no trailing slash — the exact domain of your Anderson Ecotrack login
// page, which is where your api_token is valid).
//
// Why this exists as an Edge Function instead of a client-side call:
// Anderson's api_token is a real secret that can create shipments
// (and cost money / create fraudulent parcels) on your courier account.
// It must never reach the browser. This function holds it as a
// Supabase secret, accepts an order's details from the client, calls
// Anderson's Ecotrack API (POST {base}/api/v1/create/order) on the
// server side, and writes the resulting tracking number back onto the
// order using the service-role key (which also never reaches the browser).
//
// Anderson's API replies { "success": true, "tracking": "..." } on success,
// HTTP 422 with { message, errors } on validation failure, or
// { "success": false, "error", "message" } for business errors
// (e.g. no delivery for the selected wilaya).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const ECOTRACK_TOKEN = Deno.env.get('ECOTRACK_TOKEN');
const ECOTRACK_BASE_URL = (Deno.env.get('ECOTRACK_BASE_URL') || '').replace(/\/+$/, '');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

/**
 * Anderson expects a 9–10 digit local mobile number. Accepts the shapes
 * customers actually type (+213 5xx, 00213 5xx, 0xxxxxxxxxx, xxxxxxxxx)
 * and returns the normalized 0xxxxxxxxxx form, or null if unusable.
 */
function normalizePhone(raw: string): string | null {
  const digits = (raw || '').replace(/\D/g, '');
  let local = digits;
  if (/^00213[567]\d{8}$/.test(digits)) {
    local = '0' + digits.slice(5);
  } else if (/^213[567]\d{8}$/.test(digits)) {
    local = '0' + digits.slice(3);
  } else if (/^[567]\d{8}$/.test(digits)) {
    local = '0' + digits;
  }
  return /^\d{9,10}$/.test(local) ? local : null;
}

/**
 * Turns Anderson's failure shapes into one readable message:
 * - 422 validation: { message, errors: { field: [...] } }
 * - business error: { success: false, error, message }
 */
function describeAndersonError(data: Record<string, unknown> | null): string {
  if (!data) return 'The courier did not answer.';
  const errors = data.errors as Record<string, string[]> | undefined;
  if (errors && typeof errors === 'object') {
    const flat = Object.values(errors).flat().filter(Boolean).join(' ');
    if (flat) return flat;
  }
  const message = data.message;
  if (typeof message === 'string' && message) return message;
  return 'The courier rejected the request.';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (!ECOTRACK_TOKEN || !ECOTRACK_BASE_URL) {
    // Not configured yet — fail softly. The order itself was already
    // saved before this function is ever called (see Checkout.jsx),
    // so this just means no automatic shipment was created.
    return jsonResponse({ success: false, error: 'Courier is not configured on the server yet.' });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ success: false, error: 'Invalid request body.' }, 400);
  }

  const {
    orderId,
    orderNumber,
    fullName,
    phone,
    wilaya,
    wilayaCode,
    commune,
    address,
    stopDesk,
    amount,
    productSummary,
    notes,
  } = body as {
    orderId?: string;
    orderNumber?: string;
    fullName?: string;
    phone?: string;
    wilaya?: string;
    wilayaCode?: number;
    commune?: string;
    address?: string;
    stopDesk?: boolean;
    amount?: number;
    productSummary?: string;
    notes?: string;
  };

  if (!orderId || !fullName || !phone || !wilaya || !wilayaCode || !commune || amount == null) {
    return jsonResponse({ success: false, error: 'Missing required shipment fields.' }, 400);
  }

  // Anderson wants a 9–10 digit local number, but customers type
  // +213 ..., 00213 ..., or 9 digits without the trunk 0 — normalize.
  const telephone = normalizePhone(phone);
  if (!telephone) {
    return jsonResponse({ success: false, error: 'Invalid phone number.' }, 400);
  }

  // adresse is required by Anderson even for stopdesk — the client sends
  // the chosen stopdesk label in that case (see Checkout.jsx).
  const adresse = (address || '').trim();
  if (!adresse) {
    return jsonResponse({ success: false, error: 'Missing delivery address.' }, 400);
  }

  try {
    // Anderson caps free-text fields at 255 characters.
    const productList = (productSummary || '').slice(0, 255);
    const remarque = (notes || '').slice(0, 255);

    // Parameter shape follows Anderson's ECOTRACK API docs for
    // "Ajouter une commande": POST with query params, type=1 (Livraison),
    // stop_desk 0 = home, 1 = stopdesk.
    const params = new URLSearchParams({
      api_token: ECOTRACK_TOKEN,
      reference: orderNumber || orderId,
      nom_client: fullName,
      telephone,
      adresse,
      commune,
      code_wilaya: String(wilayaCode),
      montant: String(Math.round(Number(amount))),
      type: '1',
      stop_desk: stopDesk ? '1' : '0',
      produit: productList,
    });
    if (remarque) params.set('remarque', remarque);

    const andersonRes = await fetch(`${ECOTRACK_BASE_URL}/api/v1/create/order?${params.toString()}`, {
      method: 'POST',
    });

    const andersonData = await andersonRes.json().catch(() => null);

    if (!andersonData?.success || !andersonData?.tracking) {
      console.error('Anderson API error:', andersonRes.status, andersonData);
      return jsonResponse({
        success: false,
        error: describeAndersonError(andersonData),
      });
    }

    const trackingNumber: string = andersonData.tracking;

    // Service-role client bypasses RLS — this is the one place allowed
    // to write tracking_number, since customers never have update
    // access to orders (see the RLS policies in SUPABASE_SETUP.md).
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { error: updateError } = await supabaseAdmin
        .from('orders')
        .update({ tracking_number: trackingNumber })
        .eq('id', orderId);

      if (updateError) {
        // The shipment itself was created successfully with the courier —
        // only the database write failed. Log it, but still report
        // success to the client since the parcel is real and moving.
        console.error('Shipment created, but failed to save tracking number:', updateError);
      }
    }

    return jsonResponse({ success: true, trackingNumber });
  } catch (err) {
    console.error('create-shipment error:', err);
    return jsonResponse({ success: false, error: 'Unexpected server error.' }, 500);
  }
});
