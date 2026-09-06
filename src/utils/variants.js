// Variants (AliExpress-style): several product rows can share one
// `variant_group` id (e.g. three colours of the same charm), each with
// its own `variant_name` ("Red"), price, stock and photos. Listings show
// one card per group; the product page lets the customer pick a variant.

/** Siblings of a product inside its variant group (itself included), in catalog order. Empty when standalone. */
export function getVariants(products, product) {
  if (!product?.variant_group) return [];
  const siblings = (products || []).filter(
    (p) => p.variant_group && p.variant_group === product.variant_group
  );
  return siblings.length > 1 ? siblings : [];
}

/** Collapse grouped rows to their first (representative) row for listings. */
export function dedupeVariants(products) {
  const seen = new Set();
  const out = [];
  for (const p of products || []) {
    if (p.variant_group) {
      if (seen.has(p.variant_group)) continue;
      seen.add(p.variant_group);
    }
    out.push(p);
  }
  return out;
}

/** Short label for a variant pill — falls back to the product name. */
export function variantLabel(product) {
  return product.variant_name || product.name;
}

/** Full display name, used in cart / order summaries so you can tell variants apart. */
export function displayName(product) {
  return product.variant_name ? `${product.name} (${product.variant_name})` : product.name;
}
