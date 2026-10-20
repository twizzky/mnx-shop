-- Offers / promotions applied to individual products.
-- Examples: "2 for $15", "Buy 2 Get 1 Free", "Second item 50% off".
--
-- The admin page manages these via the admin-offers Edge Function
-- (service-role writes). The storefront reads active offers directly
-- through the public RLS policy below — no auth needed to show them.
create table if not exists offers (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references products(id) on delete cascade,
  title text not null,               -- e.g. "2 for $15", "Buy 2 Get 1 Free"
  subtitle text,                     -- smaller supporting line
  kind text not null                 -- how the discount is calculated
    check (kind in ('x_for_price', 'bogo', 'percent_off_second')),
  config jsonb not null default '{}',-- kind-specific parameters
  active boolean not null default true,
  starts_at timestamp with time zone not null default now(),
  ends_at timestamp with time zone not null default now() + interval '1 year',
  created_at timestamp with time zone not null default now()
);
create index if not exists offers_product_id_idx on offers(product_id);
create index if not exists offers_active_window_idx on offers(active, starts_at, ends_at);

alter table offers enable row level security;

drop policy if exists "Public can view active offers" on offers;
create policy "Public can view active offers"
  on offers for select
  using (active and starts_at <= now() and ends_at > now());

drop policy if exists "Only service role manages offers" on offers;
create policy "Only service role manages offers"
  on offers for all using (false);
