# Supabase Setup

Run this once, in your Supabase project's **SQL Editor**. If you're setting up a brand-new project, use §1. If you already have an earlier version of this schema, use §2 instead — it only adds/changes what's missing.

---

## 1. Fresh setup

```sql
-- Products: your live catalog. Editable straight from the Table Editor — no code needed.
create table products (
  id text primary key,
  cat text not null,
  name text not null,
  price numeric not null,
  description text,
  stock integer default 0,
  seed text,
  tag text,
  featured boolean default false,
  image_url text,        -- single main product photo (optional)
  image_urls text[],     -- gallery of photo URLs for the product page (optional)
  created_at timestamp with time zone default now()
);
alter table products enable row level security;
create policy "Public can view products" on products for select using (true);

-- Delivery prices: one row per wilaya, feeding the wilaya dropdown at
-- checkout and the /delivery-prices page. Editable from Table Editor.
-- wilaya_code is the official 1-58 wilaya code, required by the
-- Ecotrack shipment-creation integration (see §5).
create table delivery_prices (
  id uuid primary key default gen_random_uuid(),
  wilaya text not null unique,
  wilaya_code integer,
  home_delivery_price numeric not null,
  stopdesk_price numeric not null,
  created_at timestamp with time zone default now()
);
alter table delivery_prices enable row level security;
create policy "Public can view delivery prices" on delivery_prices for select using (true);

-- Orders: every checkout lands here. `address` is kept (nullable) —
-- required for doorstep delivery, left blank for stopdesk. `commune`
-- and `tracking_number` support the Ecotrack shipment integration (§5);
-- tracking_number is only ever written by the server-side Edge
-- Function, never by the customer's browser.
create table orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null,
  customer_name text not null,
  phone text not null,
  address text,
  wilaya text not null,
  commune text,
  delivery_method text not null,
  delivery_price numeric not null default 0,
  subtotal numeric not null default 0,
  items text not null,           -- human-readable line-item summary
  total numeric not null,        -- subtotal + delivery_price
  status text default 'pending',
  tracking_number text,
  created_at timestamp with time zone default now()
);
alter table orders enable row level security;
create policy "Anyone can place an order" on orders for insert with check (true);

-- Order items: one row per product in an order — structured data for
-- reporting, alongside the human-readable summary in orders.items.
create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id text references products(id),
  quantity integer not null,
  price numeric not null,        -- unit price at time of order
  created_at timestamp with time zone default now()
);
alter table order_items enable row level security;
create policy "Anyone can add order items" on order_items for insert with check (true);
```

Then populate the tables:
- **`SEED_PRODUCTS.sql`** — the starter product catalog (see §3)
- **`SEED_DELIVERY_PRICES.sql`** — all 58 wilayas with example pricing (see §4) — required for the checkout wilaya dropdown and the Delivery Prices page to show anything

Want a fuller product catalog to test with? Also run **`SEED_PRODUCTS_BULK.sql`** — adds ~30 more sample products, same safe-to-rerun upsert pattern.

Then set up photo storage:

```sql
-- Run in the SQL Editor, or do this via Storage → New bucket in the dashboard instead.
insert into storage.buckets (id, name, public) values ('product-images', 'product-images', true);
```

(See `USAGE.md` §4 for how to upload photos and attach them to products.)

---

## 2. Migrating an existing project

Run whichever of these apply to what you already have.

**If you don't have `delivery_prices` or `order_items` yet:**

```sql
create table if not exists delivery_prices (
  id uuid primary key default gen_random_uuid(),
  wilaya text not null unique,
  wilaya_code integer,
  home_delivery_price numeric not null,
  stopdesk_price numeric not null,
  created_at timestamp with time zone default now()
);
alter table delivery_prices enable row level security;
create policy "Public can view delivery prices" on delivery_prices for select using (true);

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id text references products(id),
  quantity integer not null,
  price numeric not null,
  created_at timestamp with time zone default now()
);
alter table order_items enable row level security;
create policy "Anyone can add order items" on order_items for insert with check (true);
```

**If you already have `delivery_prices` but without `wilaya_code`, or `orders` without `commune`/`tracking_number` (needed for the Ecotrack shipment integration in §5):**

```sql
alter table delivery_prices add column if not exists wilaya_code integer;
alter table orders add column if not exists commune text;
alter table orders add column if not exists tracking_number text;
```


**If your `orders` table predates wilaya/delivery-method checkout:**

```sql
alter table orders alter column address drop not null;
alter table orders add column if not exists wilaya text;
alter table orders add column if not exists delivery_method text;
alter table orders add column if not exists delivery_price numeric default 0;
alter table orders add column if not exists subtotal numeric default 0;

-- New orders default to 'pending' instead of the old 'new' — update
-- any existing rows still marked 'new' if you'd like them to match:
update orders set status = 'pending' where status = 'new';
```

**If your `products` table already exists without photo support:**

```sql
alter table products add column if not exists image_url text;
alter table products add column if not exists image_urls text[];
```

**If your `products` table still has the old `availability boolean` column instead of `stock integer`:**

```sql
alter table products add column if not exists stock integer default 0;
update products set stock = case when availability then 10 else 0 end;
alter table products drop column if exists availability;
```

Adjust the `10` above to whatever a reasonable default stock count is for your existing products — update the real numbers afterward in Table Editor.

---

## 3. Repopulating / resetting the product catalog later

Run **`SEED_PRODUCTS.sql`** again any time you want to:
- Restore the sample catalog after testing
- Purge any leftover rows from the discontinued `Consoles` / `Phones` / `iPods` categories
- Pick up a schema change (it adds `stock`, `image_url`, `image_urls` if they're missing)

It's written to be safe to re-run — it upserts by `id` rather than duplicating rows, and never overwrites `image_url` / `image_urls` on products you've already photographed.

---

## 4. Delivery pricing

Run **`SEED_DELIVERY_PRICES.sql`** to populate all 58 wilayas with example doorstep/stopdesk prices. These are placeholder numbers meant to get you running end-to-end — replace them with your real courier's rates via **Table Editor → delivery_prices** (or by re-running a modified copy of the script). It's also safe to re-run as-is: it upserts by `wilaya`, so it won't duplicate rows.

Without this table populated, the checkout page's wilaya dropdown and the `/delivery-prices` page will both show empty states rather than breaking.

---

## 5. Anderson live shipment creation (optional)

When someone checks out, the order is always saved to `orders` and `order_items` in Supabase regardless of anything in this section — that part needs no setup. This section adds an extra, optional step: automatically creating a real shipment with Anderson the moment an order is placed, so it gets a real tracking number without you touching their dashboard.

### 5.1 Why this needs a server, not just an env var

Anderson runs on the Ecotrack platform, and its `api_token` is a real secret: anyone who has it can create shipments (and charge you for them) on your courier account.

Because of that, it **cannot** live in `.env` as a `VITE_*` variable — Vite bundles anything prefixed `VITE_` straight into the JavaScript sent to every visitor, so it would be visible to anyone who opens their browser's dev tools. Instead, it's stored as a **Supabase Edge Function secret**, which only runs server-side and is never sent to the browser.

### 5.2 What you need from Anderson

- **API token (`api_token`)** — generated from your Anderson Ecotrack account. Ask your account manager to enable API access if you don't see it.
- **Base URL** — the exact domain of your Anderson Ecotrack login page (no trailing slash), e.g. `https://<your-tenant-domain>`. The token is only valid on its own tenant, so copy it from the dashboard you actually log into.

### 5.3 Deploy the Edge Functions

Two functions live in `supabase/functions/` in this project: `create-shipment` (creates the parcel) and `get-communes` (feeds the checkout commune dropdown from Anderson's own commune list). From the project root, with the [Supabase CLI](https://supabase.com/docs/guides/cli) installed and logged in:

```bash
supabase link --project-ref YOUR_PROJECT_REF   # one-time, links this folder to your Supabase project
supabase functions deploy create-shipment
supabase functions deploy get-communes
```

### 5.4 Set the secrets

```bash
supabase secrets set ECOTRACK_TOKEN=your_anderson_api_token
supabase secrets set ECOTRACK_BASE_URL=https://your-anderson-dashboard-domain
```

The functions also need `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to write the tracking number back onto the order (bypassing the customer-facing RLS policies, which correctly don't allow that write). Supabase auto-provides these to every Edge Function in most projects — check **Edge Functions → create-shipment → Secrets** in the dashboard after deploying; if either is missing, copy `SUPABASE_SERVICE_ROLE_KEY` from **Project Settings → API** and set it the same way as above.

### 5.5 How it actually ships a parcel

The `create-shipment` function calls Anderson's Ecotrack API directly — `POST {base}/api/v1/create/order` with your `api_token` plus the order details (`reference`, `nom_client`, `telephone`, `adresse`, `commune`, `code_wilaya`, `montant`, `type=1`, `stop_desk=0/1`, `produit`, `remarque`). No third-party gateway sits in the middle: your credentials only ever travel between Supabase's servers and Anderson.

Two details worth knowing:

- **Commune comes from Anderson's own list.** They reject unknown commune names, so checkout loads the commune dropdown live from `GET {base}/api/v1/get/communes` (via the `get-communes` function) instead of free text. In stopdesk mode it shows desk communes first, and picking one of your configured stopdesks pre-selects its matching commune automatically. If the list can't load, checkout falls back to a text field rather than blocking the order.
- **Phone numbers are normalized server-side** to the 9–10 digit form Anderson expects (`+213 5xx xxx xxx` → `05xx xxx xxx`, etc.).

A successful call returns `{ "success": true, "tracking": "..." }`, and that tracking code is saved onto the order and shown on the confirmation screen.

### 5.6 Testing it

Place a real test order through checkout. First check the commune dropdown populates after picking a wilaya — if it doesn't, your base URL or token is off (check the `get-communes` logs). If everything's configured, the confirmation screen shows a **Courier Tracking** number a moment after the order confirms (it arrives slightly after the main confirmation, since it's a separate background call). Check **Table Editor → orders → tracking_number** either way — it's saved there once shipment creation succeeds.

If it's not configured yet, or Anderson's system is briefly unavailable, checkout still works normally — the order save is never blocked by this step. You can always create the shipment manually from your Anderson dashboard using the order's details in Supabase.
