# MNX Shop

An accessories storefront built with React and Vite: browsable catalog, search, cart, and a checkout flow that confirms orders over WhatsApp. Backed by Supabase when configured, with a built-in sample catalog so the site is fully testable without any setup.

## Features

- Product catalog with categories, featured rows and stock badges
- Search and product detail pages
- Cart with quantity controls and delivery-price estimation
- Checkout that compiles the order and sends it via WhatsApp
- Admin-friendly catalog management through the Supabase table editor (no code needed)

## Tech stack

- React 18 with Vite
- React Router
- Supabase (products, orders, delivery pricing)
- Vanilla CSS (component-scoped styles, no UI framework)

## Getting started

```bash
npm install
npm run dev
```

The site runs on the built-in sample catalog from `src/services/defaultProducts.js`, so everything is clickable before any backend is connected.

### Environment variables

Copy the values into a `.env` file at the project root:

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon public key |
| `VITE_WHATSAPP_NUMBER` | Order-confirmation WhatsApp number, digits only |
| `VITE_CURRENCY` | Currency symbol, e.g. `$` |
| `VITE_INSTAGRAM_URL` | Instagram profile link for the footer |
| `VITE_TIKTOK_URL` | TikTok profile link for the footer |

Only `VITE_`-prefixed variables are exposed to the browser.

### Database setup

The repo ships three SQL seed files to run once in the Supabase SQL editor:

- `SEED_PRODUCTS.sql` — fresh product schema and sample catalog
- `SEED_PRODUCTS_BULK.sql` — alternate bulk-load version
- `SEED_DELIVERY_PRICES.sql` — delivery price bands per wilaya

See `SUPABASE_SETUP.md` for the full walkthrough, including upgrades from an earlier schema.

## Production build

```bash
npm run build
npm run preview
```

## Deployment

The project deploys cleanly on Vercel (framework preset: Vite, output `dist`). Set the same `VITE_` variables in the Vercel dashboard. A full deployment and update guide lives in `USAGE.md`.
