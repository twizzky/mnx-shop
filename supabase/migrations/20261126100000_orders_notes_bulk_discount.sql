-- Admin orders & offers enhancements
--
-- 1. Add `notes` column to orders table for admin notes on each order
-- 2. Add "bulk_discount" offer kind: buy more than N units at price x, price becomes y
-- 3. Extend order statuses with "no answer 1", "no answer 2", "no answer 3"
--    for call-attempt tracking

-- --------------------------------------------------------
-- 1. Orders: add notes column
-- --------------------------------------------------------
alter table orders
  add column if not exists notes text;

create index if not exists orders_notes_idx on orders(notes);

-- --------------------------------------------------------
-- 2. Offers: add "bulk_discount" kind to CHECK constraint
-- --------------------------------------------------------
-- Drop the old check constraint and recreate with bulk_discount
alter table offers
  drop constraint if exists offers_kind_check;

alter table offers
  add constraint offers_kind_check
  check (kind in ('x_for_price', 'bogo', 'percent_off_second', 'bulk_discount'));
