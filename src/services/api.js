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

/**
 * Loads the product catalog from Supabase. Falls back to the local
 * DEFAULT_PRODUCTS list if Supabase isn't configured yet, or if the
 * request fails for any reason — so the storefront never breaks.
 */
export async function fetchProducts() {
  if (!supabase) return filterActiveCategories(DEFAULT_PRODUCTS);

  try {
    const { data, error } = await supabase
      .from('products')
      .select('id, cat, name, price, description, stock, seed, tag, featured, image_url, image_urls')
      .order('created_at', { ascending: true });

    if (error) throw error;
    if (!data || !data.length) return filterActiveCategories(DEFAULT_PRODUCTS);

    const mapped = data.map((r) => ({
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
    }));
    return filterActiveCategories(mapped);
  } catch (err) {
    console.error('Could not load products from Supabase, using defaults:', err);
    return filterActiveCategories(DEFAULT_PRODUCTS);
  }
}

/**
 * Submits an order to Supabase: one row in `orders` plus one row per
 * cart line in `order_items`. Returns { success, error }.
 * If Supabase isn't configured, resolves successfully so the
 * checkout flow can still be previewed locally.
 */
export async function submitOrder({
  orderNumber,
  name,
  phone,
  wilaya,
  deliveryMethod,
  deliveryPrice,
  subtotal,
  total,
  itemLines,
  lineItems,
}) {
  if (!supabase) {
    return { success: true, error: null };
  }

  const { data: orderRow, error: orderError } = await supabase
    .from('orders')
    .insert([
      {
        order_number: orderNumber,
        customer_name: name,
        phone,
        wilaya,
        delivery_method: deliveryMethod,
        delivery_price: deliveryPrice,
        subtotal,
        total,
        items: itemLines, // human-readable summary, quick to scan in Table Editor
        status: 'pending',
      },
    ])
    .select()
    .single();

  if (orderError) {
    console.error(orderError);
    return { success: false, error: orderError };
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

  return { success: true, error: null };
}
