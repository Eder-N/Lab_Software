create extension if not exists pgcrypto;

create table if not exists public.labs (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Lab_Software',
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

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
    where m.lab_id = check_lab_id
      and m.user_id = auth.uid()
      and m.status = 'active'
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
    where m.lab_id = check_lab_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role in ('owner','admin')
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

  insert into public.labs (name, owner_id)
  values ('Lab_Software', auth.uid())
  returning id into existing_lab;

  insert into public.lab_members (lab_id, user_id, role, status)
  values (existing_lab, auth.uid(), 'owner', 'active');

  return existing_lab;
end;
$$;
