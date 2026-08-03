export const CATEGORIES = ['Keychains', 'Accessories'];

// Each method's `priceField` maps directly to a column in the
// delivery_prices table, so a price lookup is just: row[priceField].
export const DELIVERY_METHODS = [
  { value: 'homedelivery', label: 'Doorstep Delivery', priceField: 'home_delivery_price' },
  { value: 'stopdesk', label: 'Stopdesk Delivery', priceField: 'stopdesk_price' },
];

export const WHATSAPP_NUMBER = import.meta.env.VITE_WHATSAPP_NUMBER || '';

export const SOCIAL_LINKS = {
  instagram: import.meta.env.VITE_INSTAGRAM_URL || 'https://instagram.com',
  tiktok: import.meta.env.VITE_TIKTOK_URL || 'https://tiktok.com',
  whatsapp: `https://wa.me/${WHATSAPP_NUMBER}`,
};

/** Builds a wa.me link with a pre-filled, URL-encoded message. */
export function buildWhatsAppLink(message) {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}
