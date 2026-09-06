-- ============================================================
-- MNX Accessories — Seed / Repopulate Products
-- ============================================================
-- Run this in Supabase → SQL Editor.
--
-- Safe to run more than once:
--  - Adds any missing columns first (harmless if they already exist)
--  - Removes any leftover rows from discontinued categories
--  - Inserts the current sample catalog, or updates it in place if
--    those rows already exist (matched by id) — real product photos
--    you've already attached via image_url/image_urls are preserved,
--    never overwritten by this script.
--
-- If you haven't created the products/orders tables at all yet,
-- run SUPABASE_SETUP.md §1 first — this script only populates data,
-- it doesn't create the tables themselves.
-- ============================================================

-- 1. Make sure the schema is current (no-ops if already applied)
alter table products add column if not exists stock integer default 0;
alter table products add column if not exists image_url text;
alter table products add column if not exists image_urls text[];
alter table products add column if not exists variant_group text;
alter table products add column if not exists variant_name text;

-- 2. Drop any products left over from discontinued categories
delete from products where cat in ('Consoles', 'Phones', 'iPods');

-- 3. Insert the current catalog, updating in place if a row with the
--    same id already exists (re-running this script won't duplicate
--    rows or wipe out photos you've since added).
insert into products (id, cat, name, price, description, stock, seed, tag, featured) values
('kc-01', 'Keychains', 'Straw Hat Crew Charm', 8, 'Metal alloy keychain featuring a fan-favorite crew emblem, finished in matte black with a sturdy split ring.', 14, 'kc1', 'New', true),
('kc-02', 'Keychains', 'Chainsaw Charm Pack', 9, 'Double-sided acrylic charm with a glossy UV print, includes a lobster clasp for bags and lanyards.', 9, 'kc2', 'Bestseller', false),
('kc-03', 'Keychains', 'Kunai Blade Keychain', 7, 'Stainless steel kunai-style keychain with a weighted feel and a reinforced keyring loop.', 0, 'kc3', null, false),
('ac-01', 'Accessories', 'Enamel Pin Set', 10, 'Set of three hard-enamel pins with a double locking clasp on the back.', 16, 'ac1', 'New', false),
('ac-02', 'Accessories', 'Sticker Pack Vol. 2', 6, 'A pack of eight weatherproof vinyl stickers, fade-resistant for bottles and laptops.', 25, 'ac2', null, false),
('ac-03', 'Accessories', 'Bag Charm Bundle', 12, 'Bundle of three clip-on bag charms — mix and match with any of our keychains.', 3, 'ac3', 'Bestseller', true)
on conflict (id) do update set
  cat         = excluded.cat,
  name        = excluded.name,
  price       = excluded.price,
  description = excluded.description,
  stock       = excluded.stock,
  seed        = excluded.seed,
  tag         = excluded.tag,
  featured    = excluded.featured;
  -- image_url / image_urls intentionally left untouched here — see
  -- USAGE.md §4 to attach real product photos after seeding.

-- 4. Quick sanity check — should show 6 rows, all Keychains/Accessories
select id, cat, name, stock from products order by cat, id;
