create extension if not exists pgcrypto;

create table if not exists public.labs (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Lab_Software',
  account_name text,
  status text not null default 'active' check (status in ('active','blocked','cancelled')),
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.labs add column if not exists account_name text;
alter table public.labs add column if not exists status text not null default 'active';

create table if not exists public.lab_members (
  lab_id uuid not null references public.labs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  status text not null default 'active' check (status in ('active','blocked')),
  created_at timestamptz not null default now(),
  primary key (lab_id, user_id)
);

create table if not exists public.lab_state (
  lab_id uuid primary key references public.labs(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.labs enable row level security;
alter table public.lab_members enable row level security;
alter table public.lab_state enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.labs to authenticated;
grant select, insert, update, delete on public.lab_members to authenticated;
grant select, insert, update, delete on public.lab_state to authenticated;

create or replace function public.is_lab_member(check_lab_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.lab_members m
    join public.labs l on l.id = m.lab_id
    where m.lab_id = check_lab_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and l.status = 'active'
  );
$$;

create or replace function public.is_lab_admin(check_lab_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.lab_members m
    join public.labs l on l.id = m.lab_id
    where m.lab_id = check_lab_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role in ('owner','admin')
      and l.status = 'active'
  );
$$;

drop policy if exists "labs_select_members" on public.labs;
drop policy if exists "labs_insert_own" on public.labs;
drop policy if exists "labs_update_owner" on public.labs;
drop policy if exists "members_select_same_lab" on public.lab_members;
drop policy if exists "members_manage_admin" on public.lab_members;
drop policy if exists "state_select_members" on public.lab_state;
drop policy if exists "state_insert_members" on public.lab_state;
drop policy if exists "state_update_members" on public.lab_state;

create policy "labs_select_members"
on public.labs
for select
to authenticated
using (public.is_lab_member(id));

create policy "labs_insert_own"
on public.labs
for insert
to authenticated
with check (owner_id = auth.uid());

create policy "labs_update_owner"
on public.labs
for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "members_select_same_lab"
on public.lab_members
for select
to authenticated
using (public.is_lab_member(lab_id));

create policy "members_manage_admin"
on public.lab_members
for all
to authenticated
using (public.is_lab_admin(lab_id))
with check (public.is_lab_admin(lab_id));

create policy "state_select_members"
on public.lab_state
for select
to authenticated
using (public.is_lab_member(lab_id));

create policy "state_insert_members"
on public.lab_state
for insert
to authenticated
with check (public.is_lab_member(lab_id));

create policy "state_update_members"
on public.lab_state
for update
to authenticated
using (public.is_lab_member(lab_id))
with check (public.is_lab_member(lab_id));

create or replace function public.ensure_my_lab()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_lab uuid;
  lab_name text;
  account_name text;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado';
  end if;

  select lab_id into existing_lab
  from public.lab_members
  where user_id = auth.uid()
    and status = 'active'
  order by created_at
  limit 1;

  if existing_lab is not null then
    return existing_lab;
  end if;

  lab_name := coalesce(nullif(auth.jwt() -> 'user_metadata' ->> 'lab_name', ''), 'Lab_Software');
  account_name := nullif(auth.jwt() -> 'user_metadata' ->> 'account_name', '');

  insert into public.labs (name, account_name, owner_id)
  values (lab_name, account_name, auth.uid())
  returning id into existing_lab;

  insert into public.lab_members (lab_id, user_id, role, status)
  values (existing_lab, auth.uid(), 'owner', 'active');

  return existing_lab;
end;
$$;

grant execute on function public.is_lab_member(uuid) to authenticated;
grant execute on function public.is_lab_admin(uuid) to authenticated;
grant execute on function public.ensure_my_lab() to authenticated;

-- Controle de assinatura: use status = 'active' para liberar e
-- 'suspended', 'blocked' ou 'cancelled' para bloquear o acesso do cliente.
alter table public.labs add column if not exists suspended_reason text;
alter table public.labs add column if not exists suspended_until date;
alter table public.labs add column if not exists updated_at timestamptz not null default now();

do $$
begin
  alter table public.labs drop constraint if exists labs_status_check;
  alter table public.labs
    add constraint labs_status_check
    check (status in ('active','suspended','blocked','cancelled'));
end $$;

drop policy if exists "labs_select_members" on public.labs;
create policy "labs_select_members"
on public.labs
for select
to authenticated
using (
  exists (
    select 1
    from public.lab_members m
    where m.lab_id = labs.id
      and m.user_id = auth.uid()
      and m.status = 'active'
  )
);

create or replace function public.set_lab_subscription_status(
  target_lab uuid,
  new_status text,
  reason text default null,
  until_date date default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.jwt() ->> 'email', '') not in ('en.protese@gmail.com','eder.prolab@gmail.com') then
    raise exception 'Acesso negado';
  end if;

  if new_status not in ('active','suspended','blocked','cancelled') then
    raise exception 'Status invalido';
  end if;

  update public.labs
  set status = new_status,
      suspended_reason = case when new_status = 'active' then null else reason end,
      suspended_until = case when new_status = 'active' then null else until_date end,
      updated_at = now()
  where id = target_lab;
end;
$$;

grant execute on function public.set_lab_subscription_status(uuid,text,text,date) to authenticated;
