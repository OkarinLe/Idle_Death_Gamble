-- =====================================================================
-- Idle Death Gamble: functions, view, policies and grants
--
-- HOW TO USE: Supabase dashboard > SQL Editor > New query > paste ALL of
-- this file > Run. Safe to run again. It never drops or empties a table.
-- If any line fails, nothing in this file is applied (all or nothing).
--
-- Money rules (from CLAUDE.md): balances and payouts change ONLY inside
-- the functions below. Browsers get read-only access to tables.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Row Level Security (RLS) + table permissions
--    "Automatic exposure is OFF", so every table needs explicit GRANTs.
--    Nobody but service_role gets insert/update/delete on any table.
-- ---------------------------------------------------------------------
alter table public.places               enable row level security;
alter table public.readings             enable row level security;
alter table public.markets              enable row level security;
alter table public.market_price_history enable row level security;
alter table public.profiles             enable row level security;
alter table public.positions            enable row level security;
alter table public.trades               enable row level security;

-- Policies for places, markets, price history and positions already exist,
-- so we only add the ones that were missing.
drop policy if exists "readings are public" on public.readings;
create policy "readings are public" on public.readings for select using (true);

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for select using (auth.uid() = id);

drop policy if exists "own trades" on public.trades;
create policy "own trades" on public.trades for select using (auth.uid() = user_id);

grant usage on schema public to anon, authenticated, service_role;

grant select on public.places, public.markets, public.market_price_history, public.readings
  to anon, authenticated;
grant select on public.profiles, public.positions, public.trades to authenticated;

-- Scripts (scrape, resolve, market-maker) use the service_role key.
grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;


-- ---------------------------------------------------------------------
-- 2. place_latest: newest reading for each place + metric.
--    The home page reads this. security_invoker means the reader's own
--    permissions apply, so it stays as private as the readings table.
-- ---------------------------------------------------------------------
create or replace view public.place_latest with (security_invoker = true) as
select distinct on (place_id, metric)
       place_id, metric, value, unit, source, recorded_at
from public.readings
order by place_id, metric, recorded_at desc, id desc;

grant select on public.place_latest to anon, authenticated, service_role;


-- ---------------------------------------------------------------------
-- 3. LMSR (Logarithmic Market Scoring Rule) math.
--    MUST match src/lib/lmsr.ts:
--      cost(qy, qn) = m + b * ln( exp((qy-m)/b) + exp((qn-m)/b) ),  m = max(qy, qn)
--      yes price    = 1 / (1 + exp((qn - qy) / b))
--    (Subtracting m first keeps exp() from overflowing.)
-- ---------------------------------------------------------------------
create or replace function public.lmsr_cost(q_yes numeric, q_no numeric, b numeric)
returns numeric language plpgsql immutable as $$
declare
  m  double precision := greatest(q_yes, q_no)::double precision;
  bb double precision := b::double precision;
begin
  return (m + bb * ln(exp((q_yes::double precision - m) / bb)
                    + exp((q_no::double precision  - m) / bb)))::numeric;
end $$;

create or replace function public.lmsr_yes_price(q_yes numeric, q_no numeric, b numeric)
returns numeric language sql immutable as $$
  select (1 / (1 + exp(((q_no - q_yes) / b)::double precision)))::numeric;
$$;


-- ---------------------------------------------------------------------
-- 4. buy_shares: signed-in users only.
--    Rounding: a buy cost is rounded UP to 4 decimals and a sell payout is
--    rounded DOWN to 4 decimals, so rounding can never make free money.
--    (The browser preview in lmsr.ts is unrounded; the difference is < 0.0001.)
--    Sells are stored in `trades` as NEGATIVE shares and NEGATIVE cost.
-- ---------------------------------------------------------------------
create or replace function public.buy_shares(p_market_id uuid, p_side text, p_shares numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user    uuid := auth.uid();
  m         public.markets%rowtype;
  v_qy      numeric;
  v_qn      numeric;
  v_cost    numeric;
  v_balance numeric;
begin
  if v_user is null then raise exception 'Sign in to trade.'; end if;
  if p_side not in ('yes', 'no') then raise exception 'Side must be yes or no.'; end if;
  if p_shares is null or p_shares < 1 or p_shares > 1000 or p_shares <> floor(p_shares) then
    raise exception 'Shares must be a whole number from 1 to 1000.';
  end if;

  -- "for update" locks the market row so two trades cannot change it at once.
  select * into m from public.markets where id = p_market_id for update;
  if not found then raise exception 'Market not found.'; end if;
  if m.status <> 'open' or (m.closes_at is not null and m.closes_at <= now()) then
    raise exception 'This market is closed.';
  end if;

  v_qy := m.q_yes + case when p_side = 'yes' then p_shares else 0 end;
  v_qn := m.q_no  + case when p_side = 'no'  then p_shares else 0 end;
  v_cost := ceil((public.lmsr_cost(v_qy, v_qn, m.liquidity_b)
                - public.lmsr_cost(m.q_yes, m.q_no, m.liquidity_b)) * 10000) / 10000;

  select balance into v_balance from public.profiles where id = v_user for update;
  if not found then raise exception 'No profile found for this account.'; end if;
  if v_balance < v_cost then
    raise exception 'Not enough Hokie Bucks. This costs % and you have %.',
      round(v_cost, 2), round(v_balance, 2);
  end if;

  update public.profiles set balance = balance - v_cost where id = v_user;
  update public.markets  set q_yes = v_qy, q_no = v_qn, volume = volume + p_shares where id = m.id;

  insert into public.positions (user_id, market_id, yes_shares, no_shares)
  values (v_user, m.id,
          case when p_side = 'yes' then p_shares else 0 end,
          case when p_side = 'no'  then p_shares else 0 end)
  on conflict (user_id, market_id) do update
    set yes_shares = public.positions.yes_shares + excluded.yes_shares,
        no_shares  = public.positions.no_shares  + excluded.no_shares;

  insert into public.trades (user_id, market_id, side, shares, cost)
  values (v_user, m.id, p_side, p_shares, v_cost);

  insert into public.market_price_history (market_id, yes_price)
  values (m.id, public.lmsr_yes_price(v_qy, v_qn, m.liquidity_b));

  return jsonb_build_object('cost', v_cost,
                            'yes_price', public.lmsr_yes_price(v_qy, v_qn, m.liquidity_b));
end $$;


-- ---------------------------------------------------------------------
-- 5. sell_shares: give shares back to the market at the current price.
--    Payout = cost(before) - cost(after), the exact reverse of a buy.
-- ---------------------------------------------------------------------
create or replace function public.sell_shares(p_market_id uuid, p_side text, p_shares numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user     uuid := auth.uid();
  m          public.markets%rowtype;
  pos        public.positions%rowtype;
  v_owned    numeric;
  v_qy       numeric;
  v_qn       numeric;
  v_proceeds numeric;
begin
  if v_user is null then raise exception 'Sign in to trade.'; end if;
  if p_side not in ('yes', 'no') then raise exception 'Side must be yes or no.'; end if;
  if p_shares is null or p_shares < 1 or p_shares > 1000 or p_shares <> floor(p_shares) then
    raise exception 'Shares must be a whole number from 1 to 1000.';
  end if;

  select * into m from public.markets where id = p_market_id for update;
  if not found then raise exception 'Market not found.'; end if;
  if m.status <> 'open' or (m.closes_at is not null and m.closes_at <= now()) then
    raise exception 'This market is closed.';
  end if;

  select * into pos from public.positions
   where user_id = v_user and market_id = m.id for update;
  v_owned := case when not found then 0
                  when p_side = 'yes' then pos.yes_shares
                  else pos.no_shares end;
  if v_owned < p_shares then
    raise exception 'You only own % % shares.', v_owned, upper(p_side);
  end if;

  v_qy := m.q_yes - case when p_side = 'yes' then p_shares else 0 end;
  v_qn := m.q_no  - case when p_side = 'no'  then p_shares else 0 end;
  v_proceeds := floor((public.lmsr_cost(m.q_yes, m.q_no, m.liquidity_b)
                     - public.lmsr_cost(v_qy, v_qn, m.liquidity_b)) * 10000) / 10000;

  update public.profiles set balance = balance + v_proceeds where id = v_user;
  update public.markets  set q_yes = v_qy, q_no = v_qn, volume = volume + p_shares where id = m.id;
  update public.positions
     set yes_shares = yes_shares - case when p_side = 'yes' then p_shares else 0 end,
         no_shares  = no_shares  - case when p_side = 'no'  then p_shares else 0 end
   where user_id = v_user and market_id = m.id;

  insert into public.trades (user_id, market_id, side, shares, cost)
  values (v_user, m.id, p_side, -p_shares, -v_proceeds);

  insert into public.market_price_history (market_id, yes_price)
  values (m.id, public.lmsr_yes_price(v_qy, v_qn, m.liquidity_b));

  return jsonb_build_object('proceeds', v_proceeds,
                            'yes_price', public.lmsr_yes_price(v_qy, v_qn, m.liquidity_b));
end $$;


-- ---------------------------------------------------------------------
-- 6. resolve_market: service_role only. Plain rules, no AI.
--    Uses the newest reading at or before resolves_at (but not older than
--    60 minutes before it). Each winning share pays 1 Hokie Buck.
-- ---------------------------------------------------------------------
create or replace function public.resolve_market(p_market_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  m         public.markets%rowtype;
  r         public.readings%rowtype;
  v_outcome text;
  v_paid    numeric;
begin
  select * into m from public.markets where id = p_market_id for update;
  if not found then raise exception 'Market not found.'; end if;
  if m.status not in ('open', 'closed') then
    raise exception 'Market is already %.', m.status;
  end if;
  if m.resolves_at is null or m.resolves_at > now() then
    raise exception 'Not due yet.';
  end if;
  if m.place_id is null or m.metric is null or m.comparator is null or m.threshold is null then
    raise exception 'Market is missing place, metric, comparator or threshold.';
  end if;

  select * into r from public.readings
   where place_id = m.place_id and metric = m.metric
     and recorded_at <= m.resolves_at
     and recorded_at >= m.resolves_at - interval '60 minutes'
   order by recorded_at desc, id desc
   limit 1;
  if not found then
    raise exception 'No % reading within 60 minutes before the resolve time.', m.metric;
  end if;

  if    m.comparator = 'gt'  then v_outcome := case when r.value >  m.threshold then 'yes' else 'no' end;
  elsif m.comparator = 'gte' then v_outcome := case when r.value >= m.threshold then 'yes' else 'no' end;
  elsif m.comparator = 'lt'  then v_outcome := case when r.value <  m.threshold then 'yes' else 'no' end;
  else                            v_outcome := case when r.value <= m.threshold then 'yes' else 'no' end;
  end if;

  select coalesce(sum(case when v_outcome = 'yes' then yes_shares else no_shares end), 0)
    into v_paid from public.positions where market_id = m.id;

  update public.profiles p
     set balance = p.balance + case when v_outcome = 'yes' then pos.yes_shares else pos.no_shares end
    from public.positions pos
   where pos.market_id = m.id and pos.user_id = p.id;

  update public.markets
     set status = 'resolved', outcome = v_outcome, resolved_at = now(),
         resolved_value = r.value, resolved_reading_id = r.id
   where id = m.id;

  return jsonb_build_object('outcome', v_outcome, 'value', r.value, 'paid', v_paid);
end $$;


-- ---------------------------------------------------------------------
-- 7. cancel_market: service_role only. Gives every trader back what they
--    net-spent on the market (never a negative amount), then closes it.
-- ---------------------------------------------------------------------
create or replace function public.cancel_market(p_market_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  m          public.markets%rowtype;
  v_refunded numeric;
begin
  select * into m from public.markets where id = p_market_id for update;
  if not found then raise exception 'Market not found.'; end if;
  if m.status not in ('open', 'closed') then
    raise exception 'Market is already %.', m.status;
  end if;

  select coalesce(sum(spent), 0) into v_refunded from (
    select sum(cost) as spent from public.trades
     where market_id = m.id group by user_id having sum(cost) > 0
  ) s;

  update public.profiles p
     set balance = p.balance + n.spent
    from (select user_id, sum(cost) as spent from public.trades
           where market_id = m.id group by user_id having sum(cost) > 0) n
   where p.id = n.user_id;

  update public.markets set status = 'cancelled', resolved_at = now() where id = m.id;

  return jsonb_build_object('refunded', v_refunded);
end $$;


-- ---------------------------------------------------------------------
-- 8. get_leaderboard: anyone may call it. Profiles are private (own row
--    only), so this function shares just display name + money numbers.
--    net_worth = balance + open positions valued at the current price.
-- ---------------------------------------------------------------------
create or replace function public.get_leaderboard()
returns table (rank_number bigint, display_name text, balance numeric,
               positions_value numeric, net_worth numeric, is_you boolean)
language sql stable security definer set search_path = public as $$
  with worth as (
    select p.id, p.display_name, p.balance,
           coalesce((
             select sum(pos.yes_shares * public.lmsr_yes_price(m.q_yes, m.q_no, m.liquidity_b)
                      + pos.no_shares  * (1 - public.lmsr_yes_price(m.q_yes, m.q_no, m.liquidity_b)))
               from public.positions pos
               join public.markets m on m.id = pos.market_id
              where pos.user_id = p.id and m.status = 'open'
           ), 0) as pv
      from public.profiles p
  )
  select (rank() over (order by w.balance + w.pv desc))::bigint,
         w.display_name, w.balance, w.pv, w.balance + w.pv, (w.id = auth.uid())
    from worth w
   order by 1, 2
   limit 50;
$$;


-- ---------------------------------------------------------------------
-- 9. Who may call which function. Postgres lets everyone run new
--    functions by default, so we revoke first, then grant on purpose.
-- ---------------------------------------------------------------------
revoke all on function public.lmsr_cost(numeric, numeric, numeric)       from public, anon, authenticated;
revoke all on function public.lmsr_yes_price(numeric, numeric, numeric)  from public, anon, authenticated;

revoke all on function public.buy_shares(uuid, text, numeric)  from public, anon, authenticated;
revoke all on function public.sell_shares(uuid, text, numeric) from public, anon, authenticated;
grant execute on function public.buy_shares(uuid, text, numeric)  to authenticated;
grant execute on function public.sell_shares(uuid, text, numeric) to authenticated;

revoke all on function public.resolve_market(uuid) from public, anon, authenticated;
revoke all on function public.cancel_market(uuid)  from public, anon, authenticated;
grant execute on function public.resolve_market(uuid) to service_role;
grant execute on function public.cancel_market(uuid)  to service_role;

revoke all on function public.get_leaderboard() from public;
grant execute on function public.get_leaderboard() to anon, authenticated, service_role;


-- ---------------------------------------------------------------------
-- 9b. Lock the balance. A policy named "users update own profile" existed
--     already; without this, a signed-in user could edit their own balance
--     from the browser. Browsers may now change display_name ONLY.
-- ---------------------------------------------------------------------
revoke update on public.profiles from anon, authenticated;
grant update (display_name) on public.profiles to authenticated;


-- ---------------------------------------------------------------------
-- 10. Sign-up triggers. Each one is created ONLY if you do not already
--     have a trigger on auth.users that does the same job.
--       a) makes a profiles row (1000 Hokie Bucks) for each new user
--       b) rejects any email that is not @vt.edu
-- ---------------------------------------------------------------------
do $do$
begin
  if not exists (select 1 from pg_trigger t join pg_proc f on f.oid = t.tgfoid
                  where t.tgrelid = 'auth.users'::regclass and not t.tgisinternal
                    and f.prosrc ilike '%profiles%') then
    execute $f$
      create or replace function public.idg_create_profile()
      returns trigger language plpgsql security definer set search_path = public as $b$
      begin
        insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
        return new;
      end $b$
    $f$;
    execute 'drop trigger if exists idg_create_profile on auth.users';
    execute 'create trigger idg_create_profile after insert on auth.users
             for each row execute function public.idg_create_profile()';
  end if;

  if not exists (select 1 from pg_trigger t join pg_proc f on f.oid = t.tgfoid
                  where t.tgrelid = 'auth.users'::regclass and not t.tgisinternal
                    and f.prosrc ilike '%vt.edu%') then
    execute $f$
      create or replace function public.idg_require_vt_email()
      returns trigger language plpgsql security definer set search_path = public as $b$
      begin
        if new.email is null or lower(new.email) not like '%@vt.edu' then
          raise exception 'Only @vt.edu emails can sign up.';
        end if;
        return new;
      end $b$
    $f$;
    execute 'drop trigger if exists idg_require_vt_email on auth.users';
    execute 'create trigger idg_require_vt_email before insert on auth.users
             for each row execute function public.idg_require_vt_email()';
  end if;
end $do$;

-- Give a profile to anyone who signed up while the trigger was missing.
insert into public.profiles (id)
select u.id from auth.users u
on conflict (id) do nothing;


-- ---------------------------------------------------------------------
-- 11. Tell the Supabase API to notice the new functions, then show a
--     checklist. Paste the checklist rows back to the team / Claude.
-- ---------------------------------------------------------------------
notify pgrst, 'reload schema';

select 'function' as kind, p.proname::text as name,
       'service_role=' || has_function_privilege('service_role',  p.oid, 'execute')::text
    || ' authenticated=' || has_function_privilege('authenticated', p.oid, 'execute')::text
    || ' anon='          || has_function_privilege('anon',          p.oid, 'execute')::text as detail
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('buy_shares', 'sell_shares', 'resolve_market', 'cancel_market', 'get_leaderboard')
union all
select 'auto-id column', table_name::text, 'is_identity=' || is_identity::text
  from information_schema.columns
 where table_schema = 'public' and column_name = 'id'
   and table_name in ('trades', 'market_price_history', 'readings')
union all
select 'view', viewname::text, 'ok' from pg_views
 where schemaname = 'public' and viewname = 'place_latest'
union all
select 'policy', tablename::text, policyname::text from pg_policies where schemaname = 'public'
union all
select 'auth trigger', tgname::text, 'ok' from pg_trigger
 where tgrelid = 'auth.users'::regclass and not tgisinternal
order by 1, 2;
