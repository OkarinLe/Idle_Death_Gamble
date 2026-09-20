-- =====================================================================
-- Idle Death Gamble: agent accounts and agent-to-agent payments
--
-- HOW TO USE: Supabase dashboard > SQL Editor > New query > paste ALL of this
-- file > Run. Safe to run again. It never drops or empties a table.
--
-- Agents (Data Agent, Market Maker Agent) have play-money Hokie Bucks accounts.
-- The ONLY way money moves between them is agent_pay(), which only the server
-- (service_role) can call, and only after the payee passed the ANS identity check.
-- =====================================================================

create table if not exists public.agent_accounts (
  ans_name   text primary key,                                  -- e.g. ans://v1.0.0.data-agent.example.com
  balance    numeric not null default 100 check (balance >= 0), -- play money
  created_at timestamptz not null default now()
);

create table if not exists public.agent_payments (
  id         bigint generated always as identity primary key,
  from_name  text not null references public.agent_accounts(ans_name),
  to_name    text not null references public.agent_accounts(ans_name),
  amount     numeric not null check (amount > 0),
  memo       text,
  created_at timestamptz not null default now(),
  check (from_name <> to_name)
);

alter table public.agent_accounts enable row level security;
alter table public.agent_payments enable row level security;

-- Anyone may READ (the demo page shows the ledger). Nobody but service_role can write.
drop policy if exists "agent accounts are public" on public.agent_accounts;
create policy "agent accounts are public" on public.agent_accounts for select using (true);
drop policy if exists "agent payments are public" on public.agent_payments;
create policy "agent payments are public" on public.agent_payments for select using (true);

grant select on public.agent_accounts, public.agent_payments to anon, authenticated;
grant all on public.agent_accounts, public.agent_payments to service_role;

-- Move Hokie Bucks from one agent to another. Small cap so a bug cannot drain an account.
create or replace function public.agent_pay(p_from text, p_to text, p_amount numeric, p_memo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_balance numeric;
begin
  if p_from = p_to then raise exception 'An agent cannot pay itself.'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 10 then
    raise exception 'Amount must be more than 0 and at most 10.';
  end if;

  -- Lock both rows in the same order every time, so two payments cannot deadlock.
  perform 1 from public.agent_accounts where ans_name in (p_from, p_to) order by ans_name for update;
  select balance into v_balance from public.agent_accounts where ans_name = p_from;
  if not found then raise exception 'Unknown paying agent.'; end if;
  if not exists (select 1 from public.agent_accounts where ans_name = p_to) then
    raise exception 'Unknown receiving agent.';
  end if;
  if v_balance < p_amount then raise exception 'Not enough Hokie Bucks in the paying agent account.'; end if;

  update public.agent_accounts set balance = balance - p_amount where ans_name = p_from;
  update public.agent_accounts set balance = balance + p_amount where ans_name = p_to;
  insert into public.agent_payments (from_name, to_name, amount, memo) values (p_from, p_to, p_amount, left(p_memo, 200));

  return jsonb_build_object('paid', p_amount, 'from_balance', v_balance - p_amount);
end $$;

revoke all on function public.agent_pay(text, text, numeric, text) from public, anon, authenticated;
grant execute on function public.agent_pay(text, text, numeric, text) to service_role;

notify pgrst, 'reload schema';

select 'table' as kind, table_name::text as name from information_schema.tables
 where table_schema = 'public' and table_name in ('agent_accounts', 'agent_payments')
union all
select 'function', proname::text from pg_proc
 where pronamespace = 'public'::regnamespace and proname = 'agent_pay'
order by 1, 2;
