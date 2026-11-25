-- Admin authentication tables
--
-- Replaces the single shared ADMIN_PIN with per-user accounts (email +
-- password hash), server-side sessions, mandatory TOTP 2FA, and recovery
-- codes. All tables are locked behind RLS; only the service-role Edge
-- Functions can read/write them.
--
-- Run once: supabase db push

-- Admin users: one account per admin with email + password hash
create table if not exists admin_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  totp_secret text,
  totp_enabled boolean not null default false,
  recovery_codes_hash text,
  failed_login_attempts integer not null default 0,
  locked_until timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  last_login_at timestamp with time zone
);

alter table admin_users enable row level security;

drop policy if exists "No public access to admin_users" on admin_users;
create policy "No public access to admin_users"
  on admin_users for all using (false);

-- Admin sessions: server-side session tracking
create table if not exists admin_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references admin_users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamp with time zone not null,
  created_at timestamp with time zone not null default now(),
  last_seen_at timestamp with time zone not null default now(),
  ip_address text,
  user_agent text
);

alter table admin_sessions enable row level security;

drop policy if exists "No public access to admin_sessions" on admin_sessions;
create policy "No public access to admin_sessions"
  on admin_sessions for all using (false);

create index if not exists admin_sessions_user_id_idx on admin_sessions(user_id);
create index if not exists admin_sessions_token_hash_idx on admin_sessions(token_hash);
create index if not exists admin_sessions_expires_at_idx on admin_sessions(expires_at);

-- Admin recovery codes: one-time codes for 2FA lockout
create table if not exists admin_recovery_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references admin_users(id) on delete cascade,
  code_hash text not null,
  used_at timestamp with time zone,
  created_at timestamp with time zone not null default now()
);

alter table admin_recovery_codes enable row level security;

drop policy if exists "No public access to admin_recovery_codes" on admin_recovery_codes;
create policy "No public access to admin_recovery_codes"
  on admin_recovery_codes for all using (false);

create index if not exists admin_recovery_codes_user_id_idx on admin_recovery_codes(user_id);

-- Extend admin_audit_log with user attribution and request metadata
alter table admin_audit_log
  add column if not exists user_id uuid references admin_users(id),
  add column if not exists ip_address text,
  add column if not exists user_agent text;

create index if not exists admin_audit_log_user_id_idx on admin_audit_log(user_id);
create index if not exists admin_audit_log_created_at_idx on admin_audit_log(created_at desc);
