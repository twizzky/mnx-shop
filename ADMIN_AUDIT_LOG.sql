-- Admin audit log
--
-- Records every photo change made through the /admin page: who did it,
-- which products it touched, and when. Use it to answer "who changed this
-- photo?" and to spot a client accidentally wiping a catalog.
--
-- Run this once in the Supabase SQL Editor.
--
-- Access is deliberately denied to everyone holding the public anon key:
-- the RLS policies below reject all reads and writes, so the only way in
-- is the admin-images Edge Function, which uses the service-role key and
-- requires the ADMIN_PIN. That keeps the log (and the names of everyone
-- with admin access) off the public internet.

create table if not exists admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor text not null,                 -- the name typed into the /admin page
  action text not null,                -- 'upload' | 'save' | 'delete'
  product_ids text[] not null default '{}',
  file_count integer default 0,
  detail text,                         -- short human-readable summary
  created_at timestamp with time zone default now()
);

create index if not exists admin_audit_log_created_at_idx
  on admin_audit_log (created_at desc);

alter table admin_audit_log enable row level security;

-- No public read, no public insert/update/delete. These are written as
-- `using (false)` rather than omitted so the intent is explicit and the
-- table stays locked even if someone later flips `alter table ... disable
-- row level security` by mistake.
drop policy if exists "Only service role reads the admin audit log" on admin_audit_log;
create policy "Only service role reads the admin audit log"
  on admin_audit_log for select using (false);

drop policy if exists "Only service role writes the admin audit log" on admin_audit_log;
create policy "Only service role writes the admin audit log"
  on admin_audit_log for insert with check (false);