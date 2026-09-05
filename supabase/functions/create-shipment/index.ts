// supabase/functions/create-shipment/index.ts
//
// Server-side only. Deploy with: supabase functions deploy create-shipment
// Configure secrets with:
//   supabase secrets set ECOTRACK_TOKEN=your_courier_token
//   supabase secrets set ECOTRACK_BASE_URL=https://your-courier.ecotrack.dz
//
// Why this exists as an Edge Function instead of a client-side call:
// Ecotrack's bearer token is a real secret that can create shipments
// (and cost money / create fraudulent parcels) on your courier account.
// It must never reach the browser. This function holds it as a
// Supabase secret, accepts an order's details from the client, calls
// the shipping gateway on the server side, and writes the resulting
// tracking number back onto the order using the service-role key
// (which also never reaches the browser).
//
// Ecotrack is a white-label platform used by 80+ Algerian couriers
// (DHD, Conexlog, MSM Go, and others), each with their own base URL
// and token — there's no single public "Ecotrack API" to call. This
// function talks to your specific courier through freeship.dzbuild.com,
// a free, documented, no-signup gateway that normalizes Ecotrack (and
// several other Algerian couriers) behind one stable request shape.
// If your courier ever hands you their raw Ecotrack endpoint docs
// directly, you can point SHIPPING_GATEWAY_URL at your own equivalent
// and adjust the request body below to match.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const ECOTRACK_TOKEN = Deno.env.get('ECOTRACK_TOKEN');
const ECOTRACK_BASE_URL = Deno.env.get('ECOTRACK_BASE_URL');
const SHIPPING_GATEWAY_URL = Deno.env.get('SHIPPING_GATEWAY_URL') || 'https://freeship.dzbuild.com';

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (!ECOTRACK_TOKEN || !ECOTRACK_BASE_URL) {
    // Not configured yet — fail softly. The order itself was already
    // saved before this function is ever called (see Checkout.jsx),
    // so this just means no automatic shipment was created.
    return jsonResponse({ success: false, error: 'Ecotrack is not configured on the server yet.' });
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
  };

  if (!orderId || !fullName || !phone || !wilaya || !commune) {
    return jsonResponse({ success: false, error: 'Missing required shipment fields.' }, 400);
  }

  try {
    // Ecotrack caps the item description at 255 characters.
    const productList = (productSummary || '').slice(0, 255);

    // Request shape follows freeship.dzbuild.com's documented examples
    // as of when this was written. Gateways evolve — if a real test
    // order comes back with an error here, check their current docs
    // at https://freeship.dzbuild.com and adjust the body below to match.
    const gatewayRes = await fetch(`${SHIPPING_GATEWAY_URL}/v1/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        courier: 'ecotrack',
        credentials: { token: ECOTRACK_TOKEN },
        options: { baseUrl: ECOTRACK_BASE_URL },
        order: {
          reference: orderNumber,
          recipient: {
            fullName,
            phone,
            wilayaCode,
            communeName: commune,
            address: address || undefined,
          },
          deliveryType: stopDesk ? 'stopdesk' : 'home',
          productList,
          codAmount: amount,
        },
      }),
    });

    const gatewayData = await gatewayRes.json().catch(() => null);

    if (!gatewayRes.ok || !gatewayData?.trackingNumber) {
      console.error('Shipping gateway error:', gatewayRes.status, gatewayData);
      return jsonResponse({
        success: false,
        error: gatewayData?.error || 'The shipping gateway rejected the request.',
      });
    }

    const trackingNumber: string = gatewayData.trackingNumber;

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
