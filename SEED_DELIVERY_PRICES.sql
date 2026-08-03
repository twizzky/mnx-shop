-- ============================================================
-- MNX Accessories — Seed Delivery Prices (all 58 wilayas)
-- ============================================================
-- These are PLACEHOLDER prices, roughly tiered by typical distance
-- from the north-central region — meant to get checkout working
-- end-to-end immediately. Replace them with your real courier's
-- rates via Table Editor → delivery_prices whenever you're ready.
--
-- Safe to run more than once: upserts by wilaya, won't duplicate rows.
-- Run SUPABASE_SETUP.md §1 (or §2) first if the delivery_prices table
-- doesn't exist yet.
-- ============================================================

insert into delivery_prices (wilaya, home_delivery_price, stopdesk_price) values
('Adrar', 1300, 950),
('Chlef', 600, 400),
('Laghouat', 900, 650),
('Oum El Bouaghi', 750, 550),
('Batna', 750, 550),
('Béjaïa', 550, 400),
('Biskra', 900, 650),
('Béchar', 1000, 750),
('Blida', 500, 350),
('Bouira', 550, 400),
('Tamanrasset', 1400, 1000),
('Tébessa', 800, 600),
('Tlemcen', 700, 500),
('Tiaret', 700, 500),
('Tizi Ouzou', 550, 400),
('Alger', 500, 350),
('Djelfa', 750, 550),
('Jijel', 600, 400),
('Sétif', 600, 400),
('Saïda', 750, 550),
('Skikda', 600, 400),
('Sidi Bel Abbès', 700, 500),
('Annaba', 800, 600),
('Guelma', 800, 600),
('Constantine', 600, 400),
('Médéa', 550, 400),
('Mostaganem', 700, 500),
('M''Sila', 700, 500),
('Mascara', 700, 500),
('Ouargla', 950, 700),
('Oran', 700, 500),
('El Bayadh', 950, 700),
('Illizi', 1400, 1000),
('Bordj Bou Arréridj', 600, 400),
('Boumerdès', 500, 350),
('El Tarf', 800, 600),
('Tindouf', 1400, 1000),
('Tissemsilt', 700, 500),
('El Oued', 950, 700),
('Khenchela', 800, 600),
('Souk Ahras', 800, 600),
('Tipaza', 500, 350),
('Mila', 600, 400),
('Aïn Defla', 550, 400),
('Naâma', 950, 700),
('Aïn Témouchent', 700, 500),
('Ghardaïa', 900, 650),
('Relizane', 700, 500),
('Timimoun', 1300, 950),
('Bordj Badji Mokhtar', 1400, 1050),
('Ouled Djellal', 950, 700),
('Béni Abbès', 1200, 900),
('In Salah', 1400, 1000),
('In Guezzam', 1500, 1100),
('Touggourt', 950, 700),
('Djanet', 1450, 1050),
('El M''Ghair', 950, 700),
('El Meniaa', 1000, 750)

on conflict (wilaya) do update set
  home_delivery_price = excluded.home_delivery_price,
  stopdesk_price       = excluded.stopdesk_price;

-- Sanity check — should show 58 rows
select count(*) as wilaya_count from delivery_prices;
