const CURRENCY = import.meta.env.VITE_CURRENCY || '$';
// Word-style currency codes (DA, USD, EUR...) read better as a suffix
// with no decimals ("8,500 DA"); symbol currencies ($, €, £) read
// better as a prefix with cents ("$8.50"). Detected automatically so
// this keeps working whatever VITE_CURRENCY is set to.
const IS_WORD_CURRENCY = /^[A-Za-z]+$/.test(CURRENCY);

/** Formats a number as a price string using the configured currency. */
export function fmt(amount) {
  const decimals = IS_WORD_CURRENCY ? 0 : 2;
  const value = Number(amount).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return IS_WORD_CURRENCY ? `${value} ${CURRENCY}` : `${CURRENCY}${value}`;
}

/** Builds a placeholder product image URL for a given seed/width. */
export function imgUrl(seed, width = 600) {
  return `https://picsum.photos/seed/${seed}/${width}/${width}`;
}

/**
 * Returns the list of real image URLs for a product (uploaded to Supabase
 * Storage or hosted anywhere else), falling back to placeholder images
 * generated from the product's `seed` if no real images are set yet.
 *
 * Checked in order:
 *   1. product.image_urls — a JSON array of URLs (product gallery)
 *   2. product.image_url  — a single URL (main product photo only)
 *   3. placeholder images generated from product.seed
 */
export function productImages(product, width = 800) {
  if (Array.isArray(product.image_urls) && product.image_urls.length) {
    return product.image_urls;
  }
  if (product.image_url) {
    return [product.image_url];
  }
  return [imgUrl(product.seed, width), imgUrl(`${product.seed}-b`, width), imgUrl(`${product.seed}-c`, width)];
}
