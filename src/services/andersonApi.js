import { supabase } from './supabase';

// Commune lists barely change — cache per wilaya code for the session so
// switching delivery method back and forth never refetches.
const communesCache = new Map();

/**
 * Loads Anderson's commune list for one wilaya via the server-side
 * `get-communes` Edge Function (which injects the api_token — it never
 * reaches the browser). Returns { success, communes, error } where each
 * commune is { name, postalCode, hasStopDesk }, stopdesk ones first.
 */
export async function fetchCommunes(wilayaCode) {
  if (!wilayaCode) {
    return { success: false, communes: [], error: 'Missing wilaya.' };
  }
  if (communesCache.has(wilayaCode)) {
    return { success: true, communes: communesCache.get(wilayaCode), error: null };
  }
  if (!supabase) {
    return { success: false, communes: [], error: 'Supabase is not configured.' };
  }

  try {
    const { data, error } = await supabase.functions.invoke('get-communes', {
      body: { wilayaCode },
    });

    if (error) throw error;
    if (!data?.success) {
      return { success: false, communes: [], error: data?.error || 'Could not load communes.' };
    }

    communesCache.set(wilayaCode, data.communes);
    return { success: true, communes: data.communes, error: null };
  } catch (err) {
    console.error('fetchCommunes failed:', err);
    return { success: false, communes: [], error: err.message || 'Could not load communes.' };
  }
}

/**
 * Asks the server-side `create-shipment` Edge Function to create a real
 * shipment with Anderson (direct Ecotrack API call, no gateway), and to
 * save the resulting tracking number onto the order.
 *
 * IMPORTANT: this never talks to Anderson directly from the browser.
 * The api_token is a secret credential — if it lived in frontend code
 * (even a VITE_ env var), it would ship inside the JavaScript bundle sent
 * to every visitor and anyone could extract it to create shipments on
 * your courier account. The Edge Function holds that token as a
 * server-side secret instead (see SUPABASE_SETUP.md §5).
 *
 * Best-effort (see Checkout.jsx): if it fails, the order itself is
 * already safely saved in Supabase.
 *
 * Returns { success, trackingNumber, error }.
 */
export async function createShipment({
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
}) {
  if (!supabase) {
    return { success: false, trackingNumber: null, error: 'Supabase is not configured.' };
  }

  try {
    const { data, error } = await supabase.functions.invoke('create-shipment', {
      body: {
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
      },
    });

    if (error) throw error;
    if (!data?.success) {
      return { success: false, trackingNumber: null, error: data?.error || 'Shipment creation failed.' };
    }

    return { success: true, trackingNumber: data.trackingNumber, error: null };
  } catch (err) {
    console.error('createShipment failed:', err);
    return { success: false, trackingNumber: null, error: err.message || 'Shipment creation failed.' };
  }
}
