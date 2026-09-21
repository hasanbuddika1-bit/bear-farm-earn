-- Bear Farm — Supabase schema (zero-trust, deny-by-default)
-- Run this whole file in Supabase → SQL Editor. Safe to re-run.

create extension if not exists pgcrypto;

-- ============================================================
-- 1. Core tables (all writes happen server-side only)
-- ============================================================

create table if not exists public.app_config (
  id            text primary key default 'default',
  data          jsonb not null default '{}'::jsonb,
  updated_at    timestamptz not null default now()
);

create table if not exists public.users (
  id                 uuid primary key default gen_random_uuid(),
  telegram_id        text not null unique,
  username           text,
  first_name         text,
  last_name          text,
  photo_url          text,
  balance            bigint not null default 0 check (balance >= 0),
  lifetime_earned    bigint not null default 0,
  wallet_address     text unique,
  is_admin           boolean not null default false,
  suspended          boolean not null default false,
  suspended_reason   text,
  device_hash        text,
  signup_ip          text,
  referred_by        uuid references public.users(id) on delete set null,
  referral_pot       bigint not null default 0,
  daily_streak       int not null default 0,
  last_daily_day     text,
  ads_watched        int not null default 0,
  withdrawal_count   int not null default 0,
  total_paid_usd     numeric(12,4) not null default 0,
  mining_started_at  timestamptz,
  mining_ends_at     timestamptz,
  mining_reward      bigint not null default 0,
  mining_claimable   boolean not null default false,
  language           text not null default 'en',
  notifications      boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists users_balance_idx on public.users (balance desc);
create index if not exists users_device_idx on public.users (device_hash);
create index if not exists users_mining_idx on public.users (mining_ends_at) where mining_claimable = false;

-- append-only reward ledger
create table if not exists public.ledger (
  id            bigserial primary key,
  user_id       uuid not null references public.users(id) on delete cascade,
  kind          text not null,
  label         text,
  amount        bigint not null,
  balance_after bigint not null,
  meta          jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists ledger_user_idx on public.ledger (user_id, id desc);

-- idempotency guard for every credit/debit
create table if not exists public.idempotency (
  key        text primary key,
  user_id    uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.rate_limits (
  bucket     text primary key,
  count      int not null default 0,
  window_at  timestamptz not null default now()
);

create table if not exists public.tasks (
  id          uuid primary key default gen_random_uuid(),
  group_name  text not null check (group_name in ('daily','main','partner')),
  kind        text not null check (kind in ('channel','mini_app','link')),
  title       text not null,
  description text,
  url         text,
  chat_id     text,
  reward      bigint not null default 0,
  wait_secs   int not null default 5,
  active      boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.task_claims (
  id         bigserial primary key,
  user_id    uuid not null references public.users(id) on delete cascade,
  task_key   text not null,
  day_key    text,
  created_at timestamptz not null default now(),
  unique (user_id, task_key, day_key)
);

create table if not exists public.task_sessions (
  id         bigserial primary key,
  user_id    uuid not null references public.users(id) on delete cascade,
  task_key   text not null,
  ready_at   timestamptz not null,
  created_at timestamptz not null default now(),
  unique (user_id, task_key)
);

create table if not exists public.reward_codes (
  code        text primary key,
  reward      bigint not null,
  max_uses    int not null default 1,
  used_count  int not null default 0,
  active      boolean not null default true,
  expires_at  timestamptz,
  created_at  timestamptz not null default now()
);

create table if not exists public.code_claims (
  id         bigserial primary key,
  code       text not null references public.reward_codes(code) on delete cascade,
  user_id    uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (code, user_id)
);

create table if not exists public.referrals (
  id           bigserial primary key,
  referrer_id  uuid not null references public.users(id) on delete cascade,
  referred_id  uuid not null references public.users(id) on delete cascade,
  stage        text not null default 'pending' check (stage in ('pending','half','verified','fake')),
  earned       bigint not null default 0,
  claimed      bigint not null default 0,
  ads_day1     int not null default 0,
  ads_day2     int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (referred_id)
);
create index if not exists referrals_referrer_idx on public.referrals (referrer_id, created_at desc);

create table if not exists public.ad_impressions (
  id         text primary key,
  user_id    uuid not null references public.users(id) on delete cascade,
  reward     bigint not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.withdrawals (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users(id) on delete cascade,
  tokens         bigint not null check (tokens > 0),
  gross_usd      numeric(12,4) not null,
  fee_usd        numeric(12,4) not null,
  net_usd        numeric(12,4) not null,
  wallet_address text not null,
  status         text not null default 'pending' check (status in ('pending','approved','rejected')),
  tx_id          text,
  reviewed_by    text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists withdrawals_user_idx on public.withdrawals (user_id, created_at desc);
create index if not exists withdrawals_status_idx on public.withdrawals (status, created_at desc);

create table if not exists public.admin_sessions (
  token       text primary key,
  telegram_id text not null,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);

create table if not exists public.audit_log (
  id         bigserial primary key,
  actor      text not null,
  action     text not null,
  target     text,
  meta       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- server-maintained aggregates (keeps read counts tiny)
create table if not exists public.stats (
  id            text primary key default 'global',
  total_users   bigint not null default 0,
  active_today  bigint not null default 0,
  tokens_minted bigint not null default 0,
  paid_usd      numeric(14,4) not null default 0,
  pending_usd   numeric(14,4) not null default 0,
  daily         jsonb not null default '[]'::jsonb,
  updated_at    timestamptz not null default now()
);

-- ============================================================
-- 2. Privileges — deny by default
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array[
    'app_config','users','ledger','idempotency','rate_limits','tasks','task_claims',
    'task_sessions','reward_codes','code_claims','referrals','ad_impressions',
    'withdrawals','admin_sessions','audit_log','stats'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

grant usage on all sequences in schema public to service_role;

-- No policies exist for anon/authenticated on base tables: every read and
-- write goes through server functions using the service role key.
-- RLS enabled + zero policies = denied for everyone except service_role.

-- ============================================================
-- 3. Public read surfaces (leaderboard + payouts only)
-- ============================================================
create or replace view public.public_leaderboard as
  select row_number() over (order by u.balance desc) as rank,
         coalesce(nullif(u.first_name, ''), nullif(u.username, ''), 'Farmer') as name,
         u.balance
  from public.users u
  where u.suspended = false
  order by u.balance desc
  limit 100;

create or replace view public.public_payouts as
  select coalesce(nullif(u.first_name, ''), nullif(u.username, ''), 'Farmer') as name,
         w.net_usd,
         w.updated_at as paid_at
  from public.withdrawals w
  join public.users u on u.id = w.user_id
  where w.status = 'approved'
  order by w.updated_at desc
  limit 50;

grant select on public.public_leaderboard, public.public_payouts to anon, authenticated;

-- ============================================================
-- 4. Seed config
-- ============================================================
insert into public.app_config (id, data) values ('default', jsonb_build_object(
  'miningRewardPerCycle', 100,
  'miningCycleMinutes', 60,
  'dailyRewards', jsonb_build_array(30,40,50,70,90,120,150),
  'dailyTaskCommunityReward', 50,
  'dailyTaskPaymentReward', 50,
  'dailyReferralTaskReward', 250,
  'referralJoinReward', 200,
  'referralStage1Reward', 400,
  'referralStage1Ads', 10,
  'referralStage2Reward', 600,
  'referralStage2Ads', 15,
  'tokensPerUsd', 100000,
  'firstWithdrawMinTokens', 10000,
  'nextWithdrawMinTokens', 20000,
  'withdrawFeeFlatUsd', 0.01,
  'withdrawFeePercent', 5,
  'adsEnabled', true,
  'maintenance', false
)) on conflict (id) do nothing;

insert into public.stats (id) values ('global') on conflict (id) do nothing;

-- ============================================================
-- 5. Atomic money functions (service_role only)
-- ============================================================
create or replace function public.bf_apply_amount(
  p_user uuid, p_amount bigint, p_kind text, p_label text, p_meta jsonb default '{}'::jsonb
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare new_balance bigint;
begin
  update public.users
     set balance = balance + p_amount,
         lifetime_earned = lifetime_earned + greatest(p_amount, 0),
         updated_at = now()
   where id = p_user
  returning balance into new_balance;

  if new_balance is null then
    raise exception 'user not found';
  end if;

  insert into public.ledger (user_id, kind, label, amount, balance_after, meta)
  values (p_user, p_kind, p_label, p_amount, new_balance, coalesce(p_meta, '{}'::jsonb));

  return new_balance;
end $$;

create or replace function public.bf_ledger_sum(p_user uuid)
returns bigint
language sql
security definer
set search_path = public
as $$ select coalesce(sum(amount), 0) from public.ledger where user_id = p_user $$;

revoke all on function public.bf_apply_amount(uuid, bigint, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.bf_ledger_sum(uuid) from public, anon, authenticated;
grant execute on function public.bf_apply_amount(uuid, bigint, text, text, jsonb) to service_role;
grant execute on function public.bf_ledger_sum(uuid) to service_role;
