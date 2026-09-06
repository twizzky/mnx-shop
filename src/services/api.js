import { supabase } from './supabase';
import { DEFAULT_PRODUCTS } from './defaultProducts';
import { CATEGORIES } from '../utils/constants';

/**
 * Only products in a currently-active category are ever shown. This
 * guards against a Supabase table that still has old rows (e.g. Phones,
 * iPods, Consoles) from before those categories were discontinued —
 * they simply won't render anywhere on the site.
 */
function filterActiveCategories(products) {
  return products.filter((p) => CATEGORIES.includes(p.cat));
}

const FULL_PRODUCT_COLUMNS =
  'id, cat, name, price, description, stock, seed, tag, featured, image_url, image_urls, variant_group, variant_name';
// Fallback when the products table predates variants (see SUPABASE_SETUP.md §2).
const BASE_PRODUCT_COLUMNS =
  'id, cat, name, price, description, stock, seed, tag, featured, image_url, image_urls';

function mapProductRow(r, withVariants) {
  return {
    id: r.id,
    cat: r.cat,
    name: r.name,
    price: Number(r.price),
    desc: r.description,
    stock: r.stock,
    seed: r.seed,
    tag: r.tag,
    featured: r.featured,
    image_url: r.image_url,
    image_urls: r.image_urls,
    variant_group: withVariants ? r.variant_group || null : null,
    variant_name: withVariants ? r.variant_name || null : null,
  };
}

/** True when a products select failed only because variant_* columns don't exist yet. */
function isMissingVariantColumnError(error) {
  const msg = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  return error?.code === '42703' || error?.code === 'PGRST204' || msg.includes('variant_group');
}

/**
 * Loads the product catalog from Supabase. Falls back to the local
 * DEFAULT_PRODUCTS list if Supabase isn't configured yet, or if the
 * request fails for any reason — so the storefront never breaks.
 */
export async function fetchProducts() {
  if (!supabase) return filterActiveCategories(DEFAULT_PRODUCTS);

  try {
    let rows;
    let withVariants = true;
    try {
      const { data, error } = await supabase
        .from('products')
        .select(FULL_PRODUCT_COLUMNS)
        .order('created_at', { ascending: true });
      if (error) throw error;
      rows = data;
    } catch (err) {
      // Table predates the variant_group/variant_name columns — retry
      // without them instead of falling back to demo products.
      if (!isMissingVariantColumnError(err)) throw err;
      console.warn('products table missing variant columns, loading without them:', err.message);
      const { data, error } = await supabase
        .from('products')
        .select(BASE_PRODUCT_COLUMNS)
        .order('created_at', { ascending: true });
      if (error) throw error;
      rows = data;
      withVariants = false;
    }
    if (!rows || !rows.length) return filterActiveCategories(DEFAULT_PRODUCTS);

    const mapped = rows.map((r) => mapProductRow(r, withVariants));
    return filterActiveCategories(mapped);
  } catch (err) {
    console.error('Could not load products from Supabase, using defaults:', err);
    return filterActiveCategories(DEFAULT_PRODUCTS);
  }
}

/**
 * Submits an order to Supabase: one row in `orders` plus one row per
 * cart line in `order_items`. Returns { success, error, orderId }.
 * If Supabase isn't configured, resolves successfully so the
 * checkout flow can still be previewed locally.
 */
export async function submitOrder({
  orderNumber,
  name,
  phone,
  wilaya,
  commune,
  address,
  stopdeskLocation,
  notes,
  deliveryMethod,
  deliveryPrice,
  subtotal,
  total,
  itemLines,
  lineItems,
}) {
  if (!supabase) {
    return { success: true, error: null, orderId: null };
  }

  const baseRow = {
    order_number: orderNumber,
    customer_name: name,
    phone,
    wilaya,
    commune,
    address: address || null,
    delivery_method: deliveryMethod,
    delivery_price: deliveryPrice,
    subtotal,
    total,
    items: itemLines, // human-readable summary, quick to scan in Table Editor
    status: 'pending',
  };
  const fullRow = {
    ...baseRow,
    stopdesk_location: stopdeskLocation || null,
    notes: notes || null,
  };

  let orderRow = null;
  let orderError = null;

  ({ data: orderRow, error: orderError } = await supabase.from('orders').insert([fullRow]).select().single());

  if (orderError && isMissingColumnError(orderError)) {
    // The orders table hasn't been migrated yet (no stopdesk_location /
    // notes columns) — retry with the original shape so checkout keeps
    // working, folding the extra details into the items summary.
    console.warn('orders table missing new columns, retrying without them:', orderError.message);
    const fallbackRow = {
      ...baseRow,
      items: appendExtraDetails(itemLines, stopdeskLocation, notes),
    };
    ({ data: orderRow, error: orderError } = await supabase.from('orders').insert([fallbackRow]).select().single());
  }

  if (orderError) {
    console.error(orderError);
    return { success: false, error: orderError, orderId: null };
  }

  // Structured line items, one row per product — used for reporting/
  // analytics later. If this fails, the order itself has already
  // succeeded (and the text summary above still has the full picture),
  // so we log rather than fail the whole checkout over it.
  const orderItemsPayload = lineItems.map(({ product, qty }) => ({
    order_id: orderRow.id,
    product_id: product.id,
    quantity: qty,
    price: product.price,
  }));

  const { error: itemsError } = await supabase.from('order_items').insert(orderItemsPayload);
  if (itemsError) {
    console.error('Order saved, but failed to save order_items:', itemsError);
  }

  return { success: true, error: null, orderId: orderRow.id };
}

/**
 * True when a Supabase insert failed because the `orders` table doesn't
 * have the newer `stopdesk_location` / `notes` columns yet (Postgres
 * 42703 undefined_column, or a PostgREST schema-cache complaint).
 */
function isMissingColumnError(error) {
  const msg = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  return (
    error?.code === '42703' ||
    error?.code === 'PGRST204' ||
    msg.includes('stopdesk_location') ||
    (msg.includes('notes') && msg.includes('column')) ||
    msg.includes('schema cache')
  );
}

function appendExtraDetails(itemLines, stopdeskLocation, notes) {
  let out = itemLines || '';
  if (stopdeskLocation) out += `\nStopdesk: ${stopdeskLocation}`;
  if (notes) out += `\nNotes: ${notes}`;
  return out;
}
