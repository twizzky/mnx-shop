# MNX Accessories — Usage Manual

A working guide to running the site, deploying it, managing your product catalog and photos, and handling the orders that come in.

---

## 1. Running it locally

```bash
npm install
npm run dev
```

Open the URL it prints (usually `http://localhost:5173`). Until you connect Supabase (see below), the site runs on a small built-in sample catalog from `src/services/defaultProducts.js`, so everything is clickable and testable from the start.

---

## 2. Deploying on Vercel

### 2.1 Push the project to GitHub

Vercel deploys from a Git repository, so the project needs to live in one first.

```bash
cd mnx-shop
git init
git add .
git commit -m "Initial commit"
```

Create an empty repository on [github.com/new](https://github.com/new), then:

```bash
git remote add origin https://github.com/YOUR_USERNAME/mnx-shop.git
git branch -M main
git push -u origin main
```

`.gitignore` already excludes `node_modules` and `dist`, so you won't accidentally commit those.

### 2.2 Import into Vercel

1. Go to [vercel.com](https://vercel.com) and sign in (GitHub login is easiest).
2. Click **Add New → Project**.
3. Select the `mnx-shop` repo you just pushed.
4. Vercel auto-detects Vite — the defaults it fills in are correct:
   - **Framework Preset:** Vite
   - **Build Command:** `npm run build` (auto-filled)
   - **Output Directory:** `dist` (auto-filled)
   - **Install Command:** `npm install` (auto-filled)

Don't click Deploy yet — do the next step first, or you'll deploy a site with placeholder Supabase credentials.

### 2.3 Add environment variables

Still on the import screen, expand **Environment Variables** and add each key from your `.env` file, with real values this time:

| Key | Value |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon public key |
| `VITE_WHATSAPP_NUMBER` | Your WhatsApp number, digits only |
| `VITE_CURRENCY` | e.g. `$` |
| `VITE_INSTAGRAM_URL` | Your Instagram profile URL |
| `VITE_TIKTOK_URL` | Your TikTok profile URL |

Vite only exposes variables prefixed `VITE_` to the browser bundle, and only at build time — so these must be set in Vercel's dashboard (not just your local `.env`, which never gets deployed).

### 2.4 Deploy

Click **Deploy**. First build takes ~30–60 seconds. You'll get a live URL like `mnx-shop.vercel.app`.

### 2.5 Custom domain (optional)

Project → **Settings → Domains** → add your domain (e.g. `mnxaccessories.com`) → follow the DNS instructions Vercel gives you (usually one CNAME or A record at your domain registrar).

### 2.6 Updating the live site later

You never "replace files" on Vercel directly — there's no file browser for your deployment. Instead, you push a new version and it rebuilds automatically. Which workflow applies depends on how you deployed originally.

#### If you deployed manually (Vercel CLI, no GitHub — this is you)

Vercel's CLI is what "manual" deploys use under the hood. To ship a change:

```bash
# one-time setup, if you don't have it yet
npm i -g vercel
vercel login
```

Then, from inside the `mnx-shop` project folder:

```bash
# first time only, if this folder isn't already linked —
# it'll ask you to select your existing "mnx-shop" project on Vercel
# rather than creating a new one
vercel link
```

From then on, whenever you want to push changes:

```bash
# edit your files locally, then:
vercel --prod
```

This uploads the current folder and builds it as a new production deployment — it fully replaces what was live before. Running plain `vercel` (without `--prod`) instead creates a preview deployment with its own throwaway URL, handy for checking a change before it goes live.

A couple of things specific to this path:
- **Environment variables** you set in the dashboard (Settings → Environment Variables) stay attached to the project and don't need to be re-entered each deploy — but since they're baked in at build time, if you change one, you still need to run `vercel --prod` again for it to take effect.
- **Rolling back:** dashboard → **Deployments** tab → find the last good one → ⋯ → **Promote to Production**. Works the same whether you deployed via CLI or Git.

#### If your project is connected to GitHub instead

```bash
git add .
git commit -m "describe what changed"
git push
```
Vercel detects the push to `main` and redeploys automatically within ~30–60 seconds — no CLI needed. You can also edit a file directly on github.com (pencil icon → commit) for the same effect. Pushing to any other branch, or opening a pull request, builds a separate preview deployment instead of touching production.

---

## 3. Adding products

> First-time setup? Run the SQL in `SUPABASE_SETUP.md` once before following the steps below.

Once Supabase is connected (`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` filled in), your catalog lives entirely in the `products` table — no code edits, no redeploy needed. Changes show up the next time someone loads the site.

### 3.1 Add a product

Supabase dashboard → **Table Editor → products → Insert row**. Fill in:

| Column | Required? | Notes |
|---|---|---|
| `id` | Yes | Unique slug, e.g. `kc-04`. Letters, numbers, hyphens. |
| `cat` | Yes | Must exactly match one of: `Keychains`, `Accessories` |
| `name` | Yes | Product name shown to customers |
| `price` | Yes | Plain number, e.g. `9.5` |
| `description` | No | Shown on the product detail page |
| `stock` | Yes | A real number (see §5 — customers never see this number, only a status) |
| `tag` | No | Small badge on the card, e.g. `New`, `Bestseller` — leave blank for none |
| `featured` | No | `true` to show it on the Home page's Featured Drops |
| `seed` | No | Only used as a placeholder-image fallback (see below) — safe to leave as anything once you add real photos |
| `image_url` | No | A single main product photo URL |
| `image_urls` | No | An array of photo URLs for the full gallery on the product page |

Leave `image_url`/`image_urls` empty and the site will show auto-generated placeholder photos instead — handy for testing new products before your real photos are ready.

### 3.2 Edit or remove a product

Same Table Editor — click any cell to edit it directly, or select a row and delete it. Toggling `stock` to `0` immediately shows "Out of Stock" and disables Add to Cart on the live site.

### 3.3 Bulk-adding many products

For more than a handful, it's faster to write SQL once. Table Editor → **SQL Editor**:

```sql
insert into products (id, cat, name, price, description, stock, seed, tag, featured, image_url) values
('kc-04', 'Keychains', 'New Charm', 9, 'A short description.', 12, 'kc4', 'New', false, null),
('ac-04', 'Accessories', 'Another Item', 14, 'Another description.', 6, 'ac4', null, false, null);
```

Want to reset back to the default sample catalog instead (e.g. after testing), or just refresh it after a schema update? Run **`SEED_PRODUCTS.sql`** — it's safe to run repeatedly and won't duplicate rows or overwrite photos you've already attached.

Want a much fuller catalog for testing (more products per category)? Run **`SEED_PRODUCTS_BULK.sql`** too — it adds ~30 more sample products the same safe, re-runnable way.

---

## 4. Adding product images

### 4.1 Upload photos to Supabase Storage (recommended)

Supabase gives you free file hosting with public URLs, which is the easiest way to get real photos onto the live site.

1. Supabase dashboard → **Storage** → **New bucket**. Name it `product-images`, and toggle **Public bucket** on (so the photos load without authentication).
2. Open the bucket → **Upload files** → drag in your product photos.
3. Click any uploaded file → **Copy URL**. That's your public image URL, something like:
   `https://xxxxx.supabase.co/storage/v1/object/public/product-images/keychain-1.jpg`

### 4.2 Attach photos to a product

Back in **Table Editor → products**, open the row for that product:

- **Single photo:** paste the URL into `image_url`.
- **Multiple photos (gallery):** click into `image_urls` and enter a JSON array of URLs:
  ```json
  ["https://xxxxx.supabase.co/storage/v1/object/public/product-images/keychain-1.jpg", "https://xxxxx.supabase.co/storage/v1/object/public/product-images/keychain-2.jpg"]
  ```
  The product detail page will show these as swappable thumbnails; the first one doubles as the grid thumbnail.

If both `image_url` and `image_urls` are set, `image_urls` takes priority on the detail page (full gallery), while `image_url` alone is enough for the grid/card thumbnail.

### 4.3 Using photos hosted elsewhere

Any public, direct image URL works — Instagram CDN links, Google Drive (set to "anyone with the link"), Cloudinary, imgur, etc. Supabase Storage is just the most convenient since it's already part of your setup.

### 4.4 If you skip this entirely

Products without `image_url`/`image_urls` fall back to auto-generated placeholder photos (built from the `seed` field), so the site never breaks or shows blank images — it just won't look finished until real photos are added.

---

## 5. How orders are handled

### 5.1 The flow

1. A customer adds items to their cart (held in memory in their browser — nothing is saved until checkout).
2. At Checkout, they fill in name, phone, pick their **wilaya**, enter their **commune**, and choose **Doorstep** or **Stopdesk** delivery — doorstep additionally asks for a street address. The moment wilaya and delivery method are both selected, the order summary updates instantly to show Subtotal, Delivery, and Total — the delivery price comes straight from the `delivery_prices` table, never hardcoded.
3. The site writes one row to `orders`, plus one row per cart item to `order_items`, and waits for confirmation before showing the success screen — if the write fails (bad connection, etc.), the customer sees an error and can retry instead of silently losing the order.
4. On success, the cart clears and a confirmation screen shows an order reference (e.g. `MNX-4821`), plus an optional **"Message Us on WhatsApp"** button the customer can tap if they want to reach out directly. WhatsApp is never opened automatically — it's their choice.
5. If Ecotrack shipment creation is configured (§7 below), a real courier shipment is created in the background right after, and a **Courier Tracking** number appears on the confirmation screen a moment later. This step is optional and never blocks the order itself.

### 5.2 Where you see orders

Supabase dashboard → **Table Editor → orders**. Each row has:

| Column | What it is |
|---|---|
| `order_number` | The reference shown to the customer, e.g. `MNX-4821` |
| `customer_name`, `phone` | What they entered at checkout |
| `wilaya`, `commune`, `delivery_method`, `delivery_price` | Their delivery selection and its price at the time of order |
| `address` | Street address — populated for doorstep orders, blank for stopdesk |
| `subtotal` | Product total before delivery |
| `total` | `subtotal + delivery_price` |
| `items` | Plain-text list of what they ordered, with line totals — quick to scan without joining tables |
| `status` | Defaults to `pending` — update this yourself as you process the order |
| `tracking_number` | Set automatically once a courier shipment is created (§7) — blank otherwise |
| `created_at` | Timestamp, automatic |

For a structured, per-product breakdown of any order (useful for totals/reporting later), check **Table Editor → order_items** and filter by `order_id`.

### 5.3 A simple order-tracking workflow

Since `status` is just a plain text field you control, a lightweight system works well without building a full admin panel:

- `pending` — just came in, not yet actioned
- `confirmed` — you've reached out and confirmed details
- `shipped` — on its way
- `done` — delivered

Update the cell directly in Table Editor. You can also sort/filter the table by `status` or `created_at` to see what needs attention.

### 5.4 Getting notified of new orders

By default, nothing pings you — you'd need to check the table. Two easy ways to fix that, both optional and outside what's currently built:

- **Email on every order:** Supabase **Database Webhooks** (Database → Webhooks) can call an email service (e.g. Resend, SendGrid) automatically whenever a row is inserted into `orders`. This needs a small Edge Function to actually send the email — ask if you'd like this built.
- **Manual checking:** bookmark the `orders` table view and check it periodically, or check daily as part of a routine.

### 5.5 Security note

Customers can only ever *insert* into `orders` and `order_items` — the Row Level Security policies from setup don't allow them to read, edit, or delete any order (including their own, once submitted, or anyone else's). Only you, logged into the Supabase dashboard, can view or change order data.

---

## 6. Product search

The nav bar's search icon (magnifying glass) opens `/search` — a dedicated page with a prominent search input and a live-filtered results grid. No setup needed: it searches whatever's already in your `products` table (name, category, and description) as the customer types, entirely client-side against the catalog already loaded for the rest of the site. Clicking a result opens that product's normal detail page.

---

## 7. Delivery pricing

### 7.1 What it's for

Two things read from the `delivery_prices` table:
- The **wilaya dropdown at checkout**, and the automatic delivery-price lookup once a wilaya + method are chosen
- The public **`/delivery-prices` page** (linked from the footer), which lists every wilaya's doorstep and stopdesk price in a table

### 7.2 First-time setup

Run **`SEED_DELIVERY_PRICES.sql`** once — it populates all 58 wilayas with placeholder pricing so checkout works immediately. See `SUPABASE_SETUP.md` §4.

### 7.3 Updating prices

Supabase dashboard → **Table Editor → delivery_prices** → edit `home_delivery_price` or `stopdesk_price` directly on any row. Changes appear on the site the next time someone loads the page — no code changes, no redeploy.

### 7.4 Adding or removing a wilaya

Add or delete rows the same way, directly in Table Editor. The `wilaya` column is what's shown in the checkout dropdown, so keep the spelling consistent if you're editing an existing one (it's also what gets stored on each order).

---

## 8. Automatic courier shipment creation (Ecotrack)

Optional, and off by default. When set up, placing an order also creates a real shipment with your courier automatically, giving it a tracking number without you touching their dashboard.

**This isn't a `.env` setting** — a courier API token is a real secret, and anything in `.env` prefixed `VITE_` ends up inside the JavaScript sent to every visitor's browser. Instead, it's configured as a **Supabase Edge Function secret**, which only ever runs on Supabase's servers.

Full setup — getting your token from your courier, deploying the function, and setting the secrets — is in **`SUPABASE_SETUP.md` §5**.

Once it's set up: every order still saves to `orders`/`order_items` exactly as before, and shipment creation happens as a best-effort extra step right after. If it's not configured, or the courier's system is briefly down, checkout works exactly as it does today — nothing about the core order flow depends on this being set up.
