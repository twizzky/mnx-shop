import { supabase } from './supabase';

/**
 * Loads every wilaya's delivery pricing from Supabase. Returns an empty
 * array if Supabase isn't configured yet, or if the request fails —
 * callers (DeliveryContext) treat that as "no pricing set up yet"
 * rather than crashing the app.
 */
export async function fetchDeliveryPrices() {
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from('delivery_prices')
      .select('id, wilaya, home_delivery_price, stopdesk_price')
      .order('wilaya', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Could not load delivery prices from Supabase:', err);
    return [];
  }
}
