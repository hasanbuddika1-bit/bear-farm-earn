-- ============================================================
-- Bear Farm · migration 0002
-- Ad networks (admin editable), server-verified ad sessions,
-- task icons (imgbb / any https image url).
-- Safe to re-run.
-- ============================================================

-- Task icons ------------------------------------------------
alter table public.tasks add column if not exists icon_url text;

-- Ad networks ----------------------------------------------
create table if not exists public.ad_networks (
  id             text primary key,
  name           text not null,
  provider       text not null check (provider in ('adsgram','monetag','gigapub','link')),
  block_id       text,
  url            text,
  logo_url       text,
  reward         bigint not null default 10,
  daily_limit    int not null default 20,
  cooldown_secs  int not null default 30,
  min_watch_secs int not null default 15,
  active         boolean not null default true,
  sort_order     int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Server-side watch sessions: a reward can only be written for a session
-- that the server itself created and that has not been consumed yet.
create table if not exists public.ad_sessions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  network    text not null,
  reward     bigint not null default 0,
  ready_at   timestamptz not null,
  expires_at timestamptz not null,
  consumed   boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists ad_sessions_user_idx on public.ad_sessions (user_id, created_at desc);

alter table public.ad_impressions add column if not exists network text;
create index if not exists ad_impressions_user_idx on public.ad_impressions (user_id, created_at desc);

-- Privileges: deny by default, service role only -------------
do $$
declare t text;
begin
  foreach t in array array['ad_networks','ad_sessions']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

grant usage on all sequences in schema public to service_role;

-- Seed the four networks ------------------------------------
insert into public.ad_networks (id, name, provider, block_id, url, reward, daily_limit, cooldown_secs, min_watch_secs, sort_order)
values
  ('adsgram_reward', 'Adsgram AI Reward', 'adsgram', '', '', 15, 20, 30, 12, 1),
  ('adsgram_int',    'Adsgram Interstitial', 'adsgram', '', '', 10, 25, 30, 10, 2),
  ('monetag',        'Monetag', 'monetag', '', '', 12, 20, 30, 12, 3),
  ('gigapub',        'GigaPub', 'gigapub', '', '', 12, 20, 30, 12, 4)
on conflict (id) do nothing;
