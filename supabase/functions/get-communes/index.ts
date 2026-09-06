// supabase/functions/get-communes/index.ts
//
// Server-side only. Deploy with: supabase functions deploy get-communes
// Uses the same secrets as create-shipment:
//   supabase secrets set ECOTRACK_TOKEN=your_anderson_api_token
//   supabase secrets set ECOTRACK_BASE_URL=https://your-anderson-dashboard-domain
//
// Why a proxy instead of calling Anderson straight from the browser:
// Anderson's tenant hosts do not send CORS headers, so browsers block
// direct calls — and the communes endpoint may require the account's
// api_token, which must never ship to the browser (see create-shipment).
// This function injects the token server-side and returns just the
// commune list for one wilaya: { success, communes: [{ name,
// postalCode, hasStopDesk }] }, sorted with stopdesk communes first.
// Commune names are public reference data, safe to expose.

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (!ECOTRACK_TOKEN || !ECOTRACK_BASE_URL) {
    return jsonResponse({ success: false, error: 'Courier is not configured on the server yet.' });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ success: false, error: 'Invalid request body.' }, 400);
  }

  const wilayaCode = Number(body.wilayaCode);
  if (!wilayaCode || wilayaCode < 1 || wilayaCode > 58) {
    return jsonResponse({ success: false, error: 'Invalid wilaya.' }, 400);
  }

  try {
    const url =
      `${ECOTRACK_BASE_URL}/api/v1/get/communes` +
      `?wilaya_id=${wilayaCode}&api_token=${encodeURIComponent(ECOTRACK_TOKEN)}`;
    const res = await fetch(url);
    const data = await res.json().catch(() => null);

    if (!res.ok || !data || typeof data !== 'object') {
      console.error('Anderson communes error:', res.status, data);
      return jsonResponse({ success: false, error: 'Could not load communes.' });
    }

    const communes = (Object.values(data) as Record<string, unknown>[])
      .filter((c) => c && typeof c === 'object' && typeof c.nom === 'string')
      .map((c) => ({
        name: String(c.nom),
        postalCode: c.code_postal != null ? String(c.code_postal) : null,
        hasStopDesk: Number(c.has_stop_desk) === 1,
      }));
    communes.sort(
      (a, b) => Number(b.hasStopDesk) - Number(a.hasStopDesk) || a.name.localeCompare(b.name, 'fr')
    );

    return jsonResponse({ success: true, communes });
  } catch (err) {
    console.error('get-communes error:', err);
    return jsonResponse({ success: false, error: 'Unexpected server error.' }, 500);
  }
});
