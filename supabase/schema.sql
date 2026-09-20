-- =====================================================================
-- Idle Death Gamble: base tables (for a NEW Supabase project only)
--
-- Our shared project already has all of this. Use this file only if you start a fresh project:
--   Run in the SQL Editor, in this order:  1) schema.sql   2) functions.sql   3) agents.sql
-- Every statement is "create ... if not exists", so it never drops or empties anything.
-- (Rewritten from the live database so the repo can rebuild it.)
-- =====================================================================

create table if not exists public.places (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,          -- d2, owens, west-end, newman-library, ...
  name        text not null,
  category    text default 'other',          -- dining, study, gym, sports
  description text,
  capacity    integer,                       -- most people allowed at once (gyms)
  meta        jsonb default '{}',            -- football agent stores live/upcoming games here
  created_at  timestamptz default now()
);

-- One row per measurement. source = 'seed' means FAKE sample data.
create table if not exists public.readings (
  id          bigint generated always as identity primary key,
  place_id    uuid references public.places(id) on delete cascade,
  metric      text,                          -- occupancy_pct, wait_minutes, occupancy_count, vt_margin
  value       numeric,
  unit        text,
  source      text default 'manual',
  recorded_at timestamptz default now(),
  unique (place_id, metric, recorded_at, source)
);
create index if not exists readings_lookup on public.readings (place_id, metric, recorded_at desc);

-- Signing up creates the profile (see the trigger in functions.sql). Balance is play money.
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text default ('Hokie' || (floor(random() * 9000 + 1000))::int),
  balance      numeric default 1000 check (balance >= 0),
  created_at   timestamptz default now()
);

create table if not exists public.markets (
  id                  uuid primary key default gen_random_uuid(),
  ticker              text unique,
  question            text,
  rules               text,
  category            text default 'campus',
  place_id            uuid references public.places(id) on delete set null,
  metric              text,
  comparator          text check (comparator in ('gt', 'gte', 'lt', 'lte')),
  threshold           numeric,
  status              text default 'open' check (status in ('open', 'closed', 'resolved', 'cancelled')),
  outcome             text check (outcome in ('yes', 'no')),
  q_yes               numeric default 0,     -- LMSR: total Yes shares sold
  q_no                numeric default 0,     -- LMSR: total No shares sold
  liquidity_b         numeric default 100 check (liquidity_b > 0),
  volume              numeric default 0,
  closes_at           timestamptz,
  resolves_at         timestamptz,
  resolved_at         timestamptz,
  resolved_value      numeric,
  resolved_reading_id bigint references public.readings(id),
  created_by          text default 'system',
  created_at          timestamptz default now()
);
create index if not exists markets_place  on public.markets (place_id);
create index if not exists markets_status on public.markets (status, closes_at);

create table if not exists public.positions (
  user_id    uuid references public.profiles(id) on delete cascade,
  market_id  uuid references public.markets(id) on delete cascade,
  yes_shares numeric default 0,
  no_shares  numeric default 0,
  primary key (user_id, market_id)
);

-- Buys are positive; sells are stored as negative shares and negative cost.
create table if not exists public.trades (
  id         bigint generated always as identity primary key,
  user_id    uuid references public.profiles(id) on delete cascade,
  market_id  uuid references public.markets(id) on delete cascade,
  side       text check (side in ('yes', 'no')),
  shares     numeric,
  cost       numeric,
  created_at timestamptz default now()
);

create table if not exists public.market_price_history (
  id         bigint generated always as identity primary key,
  market_id  uuid references public.markets(id) on delete cascade,
  yes_price  numeric check (yes_price >= 0 and yes_price <= 1),
  created_at timestamptz default now()
);
create index if not exists price_history_market on public.market_price_history (market_id, created_at);

-- Public read policies for the tables everyone may see. (Profiles, positions and trades policies
-- are created in functions.sql.) Grants are in functions.sql too, because automatic exposure is OFF.
alter table public.places               enable row level security;
alter table public.markets              enable row level security;
alter table public.market_price_history enable row level security;
alter table public.positions            enable row level security;

drop policy if exists "places are public" on public.places;
create policy "places are public" on public.places for select using (true);
drop policy if exists "markets are public" on public.markets;
create policy "markets are public" on public.markets for select using (true);
drop policy if exists "price history is public" on public.market_price_history;
create policy "price history is public" on public.market_price_history for select using (true);
drop policy if exists "own positions" on public.positions;
create policy "own positions" on public.positions for select using (auth.uid() = user_id);

-- The four campus places we started with. (Gyms and football come from: npm run seed-places)
insert into public.places (slug, name, category, capacity) values
  ('d2',             'D2 Dining Hall',   'dining', null),
  ('owens',          'Owens Food Court', 'dining', null),
  ('west-end',       'West End Market',  'dining', null),
  ('newman-library', 'Newman Library',   'study',  null)
on conflict (slug) do nothing;
