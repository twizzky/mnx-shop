import { supabase } from './supabase';

const ORDERS_FUNCTION = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-orders`;

function adminHeaders(pin) {
  return {
    apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    'x-admin-pin': pin,
  };
}

async function callAdminOrders(method, queryOrBody, pin) {
  const url = new URL(ORDERS_FUNCTION);
  if (queryOrBody) {
    for (const [key, val] of Object.entries(queryOrBody)) {
      url.searchParams.append(key, String(val));
    }
  }
  let res;
  try {
    res = await fetch(url.toString(), { method, headers: adminHeaders(pin) });
  } catch {
    throw new Error('Could not reach the order server.');
  }
  let payload = null;
  try { payload = await res.json(); } catch { payload = null; }
  if (!res.ok) {
    if (res.status === 401) throw new Error('Incorrect PIN.');
    throw new Error(payload?.error || `Failed (HTTP ${res.status}).`);
  }
  return payload;
}

export async function fetchAllOrders(pin) {
  const data = await callAdminOrders('GET', {}, pin);
  return data.orders || [];
}

export async function updateOrderStatus({ id, status, actor, pin }) {
  return callAdminOrders('PATCH', { id, status, actor }, pin);
}

export const ORDER_STATUS_LABELS = {
  pending: 'Pending', confirmed: 'Confirmed', shipped: 'Shipped',
  delayed: 'Delayed', 'no answer': 'No Answer', cancelled: 'Cancelled',
};

export const ORDER_STATUS_COLORS = {
  pending: 'bg-gray-100 text-gray-700 border-gray-300',
  confirmed: 'bg-blue-50 text-blue-700 border-blue-200',
  shipped: 'bg-green-50 text-green-700 border-green-200',
  delayed: 'bg-orange-50 text-orange-700 border-orange-200',
  'no answer': 'bg-red-50 text-red-700 border-red-200',
  cancelled: 'bg-gray-50 text-gray-600 border-gray-200',
};

export function formatPhone(phone) {
  if (!phone) return '-';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `0${digits}`;
  return phone;
}

export function summarizeItems(order) {
  const items = order.order_items || [];
  if (!items.length) return order.items || '-';
  return items.map((i) => {
    const name = i.products?.name || 'Product';
    return `${i.quantity}\u00d7 ${name}`;
  }).join(', ');
}