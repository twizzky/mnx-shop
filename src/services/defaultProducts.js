// Used only until Supabase is connected — once src/services/supabase.js
// has real credentials, products are loaded live from your "products"
// table instead (see services/api.js -> fetchProducts).
export const DEFAULT_PRODUCTS = [
  {
    id: 'kc-01', cat: 'Keychains', name: 'Straw Hat Crew Charm', price: 8, featured: true, seed: 'kc1',
    desc: 'Metal alloy keychain featuring a fan-favorite crew emblem, finished in matte black with a sturdy split ring.',
    stock: 14, tag: 'New',
  },
  {
    id: 'kc-02', cat: 'Keychains', name: 'Chainsaw Charm Pack', price: 9, featured: false, seed: 'kc2',
    desc: 'Double-sided acrylic charm with a glossy UV print, includes a lobster clasp for bags and lanyards.',
    stock: 9, tag: 'Bestseller',
  },
  {
    id: 'kc-03', cat: 'Keychains', name: 'Kunai Blade Keychain', price: 7, featured: false, seed: 'kc3',
    desc: 'Stainless steel kunai-style keychain with a weighted feel and a reinforced keyring loop.',
    stock: 0,
  },
  {
    id: 'ac-01', cat: 'Accessories', name: 'Enamel Pin Set', price: 10, featured: false, seed: 'ac1',
    desc: 'Set of three hard-enamel pins with a double locking clasp on the back.',
    stock: 16, tag: 'New',
  },
  {
    id: 'ac-02', cat: 'Accessories', name: 'Sticker Pack Vol. 2', price: 6, featured: false, seed: 'ac2',
    desc: 'A pack of eight weatherproof vinyl stickers, fade-resistant for bottles and laptops.',
    stock: 25,
  },
  {
    id: 'ac-03', cat: 'Accessories', name: 'Bag Charm Bundle', price: 12, featured: true, seed: 'ac3',
    desc: 'Bundle of three clip-on bag charms — mix and match with any of our keychains.',
    stock: 3, tag: 'Bestseller',
  },
];
