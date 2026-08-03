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
create table delivery_prices (
  id uuid primary key default gen_random_uuid(),
  wilaya text not null unique,
  home_delivery_price numeric not null,
  stopdesk_price numeric not null,
  created_at timestamp with time zone default now()
);
alter table delivery_prices enable row level security;
create policy "Public can view delivery prices" on delivery_prices for select using (true);

-- Orders: every checkout lands here. `address` is kept (nullable) for
-- backward compatibility with any orders placed before wilaya/delivery
-- method existed — new orders leave it null and use wilaya instead.
create table orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null,
  customer_name text not null,
  phone text not null,
  address text,
  wilaya text not null,
  delivery_method text not null,
  delivery_price numeric not null default 0,
  subtotal numeric not null default 0,
  items text not null,           -- human-readable line-item summary
  total numeric not null,        -- subtotal + delivery_price
  status text default 'pending',
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
