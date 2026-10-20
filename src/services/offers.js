import { supabase } from './supabase';

/**
 * Client-side offer logic.
 *
 * Offers live in the `offers` table (public RLS: only active, in-window
 * rows are visible). Writes go through the admin-offers Edge Function
 * behind the shared ADMIN_PIN — see supabase/functions/admin-offers.
 */

/** Currently-active offers for the storefront. Already RLS-filtered. */
export async function fetchActiveOffers() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('offers')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('fetchActiveOffers error:', error);
    return [];
  }
  return data || [];
}

const OFFERS_FUNCTION = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-offers`;

function adminHeaders(pin) {
  return {
    apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    'x-admin-pin': pin,
  };
}

async function callAdminOffers(action, extraFields, pin) {
  const form = new FormData();
  form.append('action', action);
  form.append('pin', pin);
  for (const [key, val] of Object.entries(extraFields || {})) {
    form.append(key, typeof val === 'object' ? JSON.stringify(val) : String(val));
  }
  let res;
  try {
    res = await fetch(OFFERS_FUNCTION, {
      method: 'POST',
      headers: adminHeaders(pin),
      body: form,
    });
  } catch {
    throw new Error('Could not reach the offer server.');
  }
  let payload = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  if (!res.ok) {
    if (res.status === 401) throw new Error('Incorrect PIN.');
    if (res.status === 404) {
      throw new Error('The admin-offers function is not deployed yet.');
    }
    throw new Error(payload?.error || `Failed (HTTP ${res.status}).`);
  }
  return payload;
}

/** Admin: every offer, including inactive / scheduled ones. */
export async function fetchAllOffers(pin) {
  const data = await callAdminOffers('list', {}, pin);
  return data.offers || [];
}

/** Admin: recent offer-related changes from the audit log. */
export async function fetchAdminActivity({ pin }) {
  const data = await callAdminOffers('recent', {}, pin);
  return { entries: data.entries || [], unavailable: !!data.auditUnavailable };
}

export async function createOffer({
  productId,
  title,
  subtitle,
  kind,
  config,
  active,
  startsAt,
  endsAt,
  pin,
}) {
  return callAdminOffers('create', {
    productId,
    title,
    subtitle: subtitle || '',
    kind,
    config: JSON.stringify(config),
    active: String(!!active),
    startsAt: startsAt || '',
    endsAt: endsAt || '',
  }, pin);
}

export async function updateOffer({ id, updates, pin }) {
  return callAdminOffers('update', { id, ...updates }, pin);
}

export async function deleteOffer({ id, pin }) {
  return callAdminOffers('delete', { id }, pin);
}

/** Finds the currently-active offer for a product, if any. */
export function findActiveOffer(product, offers = []) {
  const now = new Date();
  return offers.find((o) => {
    if (!o.active || o.product_id !== product.id) return false;
    const starts = o.starts_at ? new Date(o.starts_at).getTime() : null;
    const ends = o.ends_at ? new Date(o.ends_at).getTime() : null;
    if (starts != null && now.getTime() < starts) return false;
    if (ends != null && now.getTime() >= ends) return false;
    return true;
  });
}

/**
 * Applies an offer to `qty` units at `unitPrice`.
 * Returns { total, savings, breakdown }.
 */
export function applyOffer(qty, unitPrice, offer) {
  if (!offer || qty < 1) {
    return { total: unitPrice * qty, savings: 0, breakdown: null };
  }
  const regular = unitPrice * qty;
  let total = regular;
  let breakdown = null;

  if (offer.kind === 'x_for_price') {
    const n = Number(offer.config?.quantity) || 1;
    const p = Number(offer.config?.price) || 0;
    if (n > 0 && qty >= n) {
      const groups = Math.floor(qty / n);
      const rem = qty % n;
      total = groups * p + rem * unitPrice;
      breakdown = `${n} for $${Number(p).toFixed(2)}${
        qty > n ? ` + ${rem} × $${unitPrice.toFixed(2)}` : ''
      }`;
    }
  } else if (offer.kind === 'bogo') {
    const buy = Number(offer.config?.buy) || 1;
    const get = Number(offer.config?.get) || 1;
    const groupSize = buy + get;
    if (groupSize > 0 && qty >= groupSize) {
      const groups = Math.floor(qty / groupSize);
      const rem = qty % groupSize;
      const paid = groups * buy + rem;
      total = paid * unitPrice;
      breakdown = `Buy ${buy} Get ${get} Free`;
    }
  } else if (offer.kind === 'percent_off_second') {
    const percent = Number(offer.config?.percent) || 0;
    if (percent > 0 && percent < 100 && qty >= 2) {
      const pairs = Math.floor(qty / 2);
      const singles = qty % 2;
      total = pairs * (unitPrice + unitPrice * (1 - percent / 100)) + singles * unitPrice;
      breakdown = `Every 2nd item ${percent}% off`;
    }
  }

  const savings = Math.max(0, regular - total);
  return { total, savings, breakdown };
}
