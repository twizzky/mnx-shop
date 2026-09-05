-- ============================================================
-- MNX Accessories — Seed Delivery Prices (all 58 wilayas)
-- ============================================================
-- These are PLACEHOLDER prices, roughly tiered by typical distance
-- from the north-central region — meant to get checkout working
-- end-to-end immediately. Replace them with your real courier's
-- rates via Table Editor → delivery_prices whenever you're ready.
--
-- wilaya_code is the official 1-58 wilaya code — required by the
-- Ecotrack shipment-creation integration (see SUPABASE_SETUP.md §5).
--
-- Safe to run more than once: upserts by wilaya, won't duplicate rows.
-- Run SUPABASE_SETUP.md §1 (or §2) first if the delivery_prices table
-- doesn't exist yet, or if it's missing the wilaya_code column.
-- ============================================================

insert into delivery_prices (wilaya, wilaya_code, home_delivery_price, stopdesk_price) values
('Adrar', 1, 1300, 950),
('Chlef', 2, 600, 400),
('Laghouat', 3, 900, 650),
('Oum El Bouaghi', 4, 750, 550),
('Batna', 5, 750, 550),
('Béjaïa', 6, 550, 400),
('Biskra', 7, 900, 650),
('Béchar', 8, 1000, 750),
('Blida', 9, 500, 350),
('Bouira', 10, 550, 400),
('Tamanrasset', 11, 1400, 1000),
('Tébessa', 12, 800, 600),
('Tlemcen', 13, 700, 500),
('Tiaret', 14, 700, 500),
('Tizi Ouzou', 15, 550, 400),
('Alger', 16, 500, 350),
('Djelfa', 17, 750, 550),
('Jijel', 18, 600, 400),
('Sétif', 19, 600, 400),
('Saïda', 20, 750, 550),
('Skikda', 21, 600, 400),
('Sidi Bel Abbès', 22, 700, 500),
('Annaba', 23, 800, 600),
('Guelma', 24, 800, 600),
('Constantine', 25, 600, 400),
('Médéa', 26, 550, 400),
('Mostaganem', 27, 700, 500),
('M''Sila', 28, 700, 500),
('Mascara', 29, 700, 500),
('Ouargla', 30, 950, 700),
('Oran', 31, 700, 500),
('El Bayadh', 32, 950, 700),
('Illizi', 33, 1400, 1000),
('Bordj Bou Arréridj', 34, 600, 400),
('Boumerdès', 35, 500, 350),
('El Tarf', 36, 800, 600),
('Tindouf', 37, 1400, 1000),
('Tissemsilt', 38, 700, 500),
('El Oued', 39, 950, 700),
('Khenchela', 40, 800, 600),
('Souk Ahras', 41, 800, 600),
('Tipaza', 42, 500, 350),
('Mila', 43, 600, 400),
('Aïn Defla', 44, 550, 400),
('Naâma', 45, 950, 700),
('Aïn Témouchent', 46, 700, 500),
('Ghardaïa', 47, 900, 650),
('Relizane', 48, 700, 500),
('Timimoun', 49, 1300, 950),
('Bordj Badji Mokhtar', 50, 1400, 1050),
('Ouled Djellal', 51, 950, 700),
('Béni Abbès', 52, 1200, 900),
('In Salah', 53, 1400, 1000),
('In Guezzam', 54, 1500, 1100),
('Touggourt', 55, 950, 700),
('Djanet', 56, 1450, 1050),
('El M''Ghair', 57, 950, 700),
('El Meniaa', 58, 1000, 750)

on conflict (wilaya) do update set
  wilaya_code          = excluded.wilaya_code,
  home_delivery_price  = excluded.home_delivery_price,
  stopdesk_price       = excluded.stopdesk_price;

-- Sanity check — should show 58 rows, wilaya_code 1 through 58
select wilaya_code, wilaya from delivery_prices order by wilaya_code;
