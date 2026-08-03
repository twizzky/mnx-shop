-- ============================================================
-- MNX Accessories — Bulk Sample Products
-- ============================================================
-- Adds ~30 more sample products on top of the base 6 from
-- SEED_PRODUCTS.sql — useful for testing the horizontal category
-- rows, cart, and checkout with a fuller catalog.
--
-- Safe to run more than once: upserts by id, so re-running just
-- refreshes these rows rather than duplicating them. Doesn't touch
-- image_url / image_urls if you've already attached real photos.
--
-- Run SEED_PRODUCTS.sql first if you haven't already — this script
-- assumes the products table exists and has the current schema.
-- ============================================================

insert into products (id, cat, name, price, description, stock, seed, tag, featured) values

-- Keychains
('kc-04', 'Keychains', 'Ghost Blade Charm', 9, 'Translucent acrylic blade charm with a frosted edge finish and a nickel keyring.', 18, 'kc4', null, false),
('kc-05', 'Keychains', 'Pixel Sword Keychain', 8, 'Blocky pixel-art sword rendered in enamel, double-sided print.', 12, 'kc5', 'New', false),
('kc-06', 'Keychains', 'Mecha Pilot Charm', 11, 'Die-cast metal charm styled after a classic mecha pilot helmet.', 6, 'kc6', null, false),
('kc-07', 'Keychains', 'Ramen Bowl Charm', 7, 'Soft rubber charm shaped like a steaming ramen bowl, hand-painted detail.', 22, 'kc7', 'Bestseller', false),
('kc-08', 'Keychains', 'Cat Ears Charm', 6, 'Minimalist cat-ear silhouette charm in brushed matte black.', 0, 'kc8', null, false),
('kc-09', 'Keychains', 'Retro Cartridge Keychain', 9, 'Miniature game cartridge charm with a removable rattling label.', 15, 'kc9', null, false),
('kc-10', 'Keychains', 'Ninja Scroll Charm', 8, 'Rolled-scroll charm with debossed kanji-style linework.', 10, 'kc10', null, false),
('kc-11', 'Keychains', 'Dragon Fang Keychain', 10, 'Carved-look resin fang charm on a braided cord loop.', 2, 'kc11', 'Limited', false),
('kc-12', 'Keychains', 'Neon Cat Charm', 9, 'Glow-in-the-dark cat silhouette charm, soft-touch coating.', 14, 'kc12', 'New', true),
('kc-13', 'Keychains', 'Arcade Joystick Charm', 12, 'Tiny working joystick charm — the stick actually wiggles.', 8, 'kc13', null, false),
('kc-14', 'Keychains', 'Mini Katana Keychain', 11, 'Sheathed mini katana charm with a magnetic hilt release.', 5, 'kc14', null, false),
('kc-15', 'Keychains', 'Slime Blob Charm', 7, 'Squishable silicone slime charm in a soft gradient finish.', 20, 'kc15', 'Bestseller', false),
('kc-16', 'Keychains', 'Star Fragment Charm', 8, 'Faceted acrylic star charm with a holographic inner layer.', 1, 'kc16', 'Limited', false),
('kc-17', 'Keychains', 'Robot Arm Keychain', 10, 'Articulated mini robot-arm charm with three moving joints.', 9, 'kc17', null, false),
('kc-18', 'Keychains', 'Lucky Coin Charm', 6, 'Engraved coin charm that spins freely on its ring.', 17, 'kc18', null, false),

-- Accessories
('ac-04', 'Accessories', 'Lanyard Set — Mono', 8, 'Woven lanyard in black and white with a breakaway clasp and card clip.', 19, 'ac4', null, false),
('ac-05', 'Accessories', 'Keycap Charm Pack', 10, 'Set of three mechanical-keyboard keycap charms, standard-fit stem.', 11, 'ac5', 'New', false),
('ac-06', 'Accessories', 'Badge Reel Clip', 7, 'Retractable badge reel with a swappable front plate.', 13, 'ac6', null, false),
('ac-07', 'Accessories', 'Mini Tote Bag Charm', 9, 'Palm-sized canvas tote charm that clips onto a bigger bag.', 6, 'ac7', null, false),
('ac-08', 'Accessories', 'Wristband Pack', 6, 'Pack of three silicone wristbands in mixed finishes.', 24, 'ac8', 'Bestseller', false),
('ac-09', 'Accessories', 'Laptop Sleeve Patch', 8, 'Iron-on woven patch sized for laptop sleeves and jackets.', 0, 'ac9', null, false),
('ac-10', 'Accessories', 'Pin Backing Set', 5, 'Set of eight locking pin backs, rubber and metal mixed.', 30, 'ac10', null, false),
('ac-11', 'Accessories', 'Zipper Pull Pack', 7, 'Set of four clip-on zipper pulls for jackets and bags.', 16, 'ac11', null, false),
('ac-12', 'Accessories', 'Clip-On Bag Tag', 9, 'Double-sided acrylic bag tag with a swivel clip.', 3, 'ac12', 'Limited', false),
('ac-13', 'Accessories', 'Acrylic Stand — Mini', 13, 'Small desktop acrylic stand with a weighted base.', 7, 'ac13', 'New', true),
('ac-14', 'Accessories', 'Washi Tape Set', 8, 'Set of three patterned washi tape rolls.', 21, 'ac14', null, false),
('ac-15', 'Accessories', 'Button Badge Trio', 6, 'Set of three 32mm pinback button badges.', 18, 'ac15', null, false),
('ac-16', 'Accessories', 'Phone Grip Charm', 9, 'Collapsible phone grip with a swappable charm loop.', 2, 'ac16', 'Limited', false),
('ac-17', 'Accessories', 'Tote Bag — Canvas', 16, 'Heavyweight canvas tote with a screen-printed front graphic.', 10, 'ac17', null, false),
('ac-18', 'Accessories', 'Keychain Display Case', 14, 'Wall-mountable acrylic case for showing off a keychain collection.', 4, 'ac18', null, false)

on conflict (id) do update set
  cat         = excluded.cat,
  name        = excluded.name,
  price       = excluded.price,
  description = excluded.description,
  stock       = excluded.stock,
  seed        = excluded.seed,
  tag         = excluded.tag,
  featured    = excluded.featured;
  -- image_url / image_urls intentionally left untouched — see
  -- USAGE.md §4 to attach real product photos.

-- Sanity check — should show 36 rows total (6 base + 30 bulk) once
-- both this script and SEED_PRODUCTS.sql have been run.
select cat, count(*) from products group by cat order by cat;
