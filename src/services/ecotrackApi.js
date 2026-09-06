import { supabase } from './supabase';

/**
 * Asks the server-side `create-shipment` Edge Function to create a real
 * shipment with the configured Ecotrack-powered courier, and to save
 * the resulting tracking number onto the order.
 *
 * IMPORTANT: this never talks to Ecotrack directly from the browser.
 * The Ecotrack bearer token is a secret credential — if it lived in
 * frontend code (even an env var prefixed VITE_), it would ship inside
 * the JavaScript bundle sent to every visitor's browser and anyone
 * could extract it from dev tools to create fraudulent shipments on
 * your courier account. The Edge Function holds that token as a
 * server-side secret instead (see SUPABASE_SETUP.md §5).
 *
 * This call is treated as best-effort by the caller (Checkout.jsx):
 * if it fails, the order itself is already safely saved in Supabase —
 * you can always create the shipment manually from your courier's own
 * dashboard using the order details.
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
  address,
  stopDesk,
  amount,
  productSummary,
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
        address,
        stopDesk,
        amount,
        productSummary,
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
