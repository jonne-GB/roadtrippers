-- ============================================================
--  Roadtrippers — databaseschema voor Neon
--  Plak dit in de Neon Console → SQL Editor en voer het uit.
--  Draaien mag meerdere keren (alles is idempotent).
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
--  Voorwaarden
--  Dit script leunt op twee dingen die Neon pas aanmaakt als je
--  Auth en de Data API hebt aangezet: de functie auth.user_id()
--  en de rol "authenticated". Ontbreekt er een, dan stoppen we
--  meteen — anders worden de tabellen wel aangemaakt maar de
--  policies en grants niet, en krijg je later in de app
--  "permission denied for table trips".
-- ------------------------------------------------------------

do $$
begin
  if to_regprocedure('auth.user_id()') is null then
    raise exception
      'auth.user_id() bestaat niet. Zet eerst Neon Auth aan (Console -> Auth) en voer dit script daarna opnieuw uit.';
  end if;

  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise exception
      'De rol "authenticated" bestaat niet. Zet eerst de Data API aan (Console -> Data API) en voer dit script daarna opnieuw uit.';
  end if;
end
$$;

-- ------------------------------------------------------------
--  Tabellen
-- ------------------------------------------------------------

create table if not exists public.trips (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  join_code   text not null unique,
  created_by  text not null,
  created_at  timestamptz not null default now()
);

create table if not exists public.trip_members (
  trip_id      uuid not null references public.trips(id) on delete cascade,
  user_id      text not null,
  display_name text,
  slot         text check (slot in ('a', 'b')),
  joined_at    timestamptz not null default now(),
  primary key (trip_id, user_id)
);

-- Alle reisdata zit in één generieke tabel. "kind" zegt wat het is
-- (day, activity, campsite, gear, container, meal, grocery, expense,
--  log, waypoint, settings) en "data" bevat het record als JSON.
-- Dat houdt het schema stabiel terwijl de app kan groeien.
create table if not exists public.trip_items (
  id          text primary key,
  trip_id     uuid not null references public.trips(id) on delete cascade,
  kind        text not null,
  data        jsonb not null default '{}'::jsonb,
  deleted     boolean not null default false,
  updated_at  timestamptz not null default now(),
  updated_by  text
);

create index if not exists trip_items_trip_updated_idx
  on public.trip_items (trip_id, updated_at);

create index if not exists trip_items_trip_kind_idx
  on public.trip_items (trip_id, kind);

create index if not exists trip_members_user_idx
  on public.trip_members (user_id);

-- ------------------------------------------------------------
--  Hulpfunctie: is de ingelogde gebruiker lid van deze reis?
--  SECURITY DEFINER voorkomt oneindige recursie in de policies.
-- ------------------------------------------------------------

create or replace function public.is_trip_member(p_trip uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.trip_members m
    where m.trip_id = p_trip
      and m.user_id = auth.user_id()
  );
$$;

-- ------------------------------------------------------------
--  Row Level Security
--  Verplicht voor de Data API: zonder RLS is een tabel niet
--  veilig vanuit de browser te benaderen.
-- ------------------------------------------------------------

alter table public.trips        enable row level security;
alter table public.trip_members enable row level security;
alter table public.trip_items   enable row level security;

drop policy if exists trips_select on public.trips;
create policy trips_select on public.trips
  for select to authenticated
  using (public.is_trip_member(id));

drop policy if exists trips_update on public.trips;
create policy trips_update on public.trips
  for update to authenticated
  using (created_by = auth.user_id())
  with check (created_by = auth.user_id());

drop policy if exists trips_delete on public.trips;
create policy trips_delete on public.trips
  for delete to authenticated
  using (created_by = auth.user_id());
-- Let op: geen INSERT-policy. Reizen maak je via create_trip(),
-- zodat de uitnodigingscode altijd door de database wordt bepaald.

drop policy if exists members_select on public.trip_members;
create policy members_select on public.trip_members
  for select to authenticated
  using (public.is_trip_member(trip_id));

drop policy if exists members_update on public.trip_members;
create policy members_update on public.trip_members
  for update to authenticated
  using (user_id = auth.user_id())
  with check (user_id = auth.user_id());

drop policy if exists members_delete on public.trip_members;
create policy members_delete on public.trip_members
  for delete to authenticated
  using (user_id = auth.user_id());

drop policy if exists items_all on public.trip_items;
create policy items_all on public.trip_items
  for all to authenticated
  using (public.is_trip_member(trip_id))
  with check (public.is_trip_member(trip_id));

-- ------------------------------------------------------------
--  Wie heeft het laatst geschreven? (puur informatief)
-- ------------------------------------------------------------

create or replace function public.set_updated_by()
returns trigger
language plpgsql
as $$
begin
  begin
    new.updated_by := auth.user_id();
  exception when others then
    new.updated_by := null;
  end;
  return new;
end;
$$;

drop trigger if exists trip_items_set_updated_by on public.trip_items;
create trigger trip_items_set_updated_by
  before insert or update on public.trip_items
  for each row execute function public.set_updated_by();

-- ------------------------------------------------------------
--  RPC's — aangeroepen door de app via /rest/v1/rpc/<naam>
-- ------------------------------------------------------------

create or replace function public.create_trip(p_name text)
returns public.trips
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  text := auth.user_id();
  v_trip public.trips;
  v_code text;
begin
  if v_uid is null then
    raise exception 'Niet ingelogd';
  end if;

  loop
    v_code := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 6));
    exit when not exists (select 1 from public.trips t where t.join_code = v_code);
  end loop;

  insert into public.trips (name, join_code, created_by)
  values (coalesce(nullif(btrim(p_name), ''), 'Naamloze reis'), v_code, v_uid)
  returning * into v_trip;

  insert into public.trip_members (trip_id, user_id, slot)
  values (v_trip.id, v_uid, 'a');

  return v_trip;
end;
$$;

create or replace function public.join_trip(p_code text)
returns public.trips
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   text := auth.user_id();
  v_trip  public.trips;
  v_count int;
begin
  if v_uid is null then
    raise exception 'Niet ingelogd';
  end if;

  select * into v_trip
  from public.trips
  where join_code = upper(btrim(p_code));

  if not found then
    raise exception 'Geen reis gevonden met deze code';
  end if;

  select count(*) into v_count
  from public.trip_members
  where trip_id = v_trip.id;

  insert into public.trip_members (trip_id, user_id, slot)
  values (v_trip.id, v_uid,
          case when v_count = 0 then 'a' when v_count = 1 then 'b' else null end)
  on conflict (trip_id, user_id) do nothing;

  return v_trip;
end;
$$;

create or replace function public.leave_trip(p_trip uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.trip_members
  where trip_id = p_trip and user_id = auth.user_id();
$$;

-- ------------------------------------------------------------
--  Rechten voor de ingelogde gebruiker
-- ------------------------------------------------------------

grant usage on schema public to authenticated;

grant select, insert, update, delete
  on public.trips, public.trip_members, public.trip_items
  to authenticated;

grant execute on function public.create_trip(text)      to authenticated;
grant execute on function public.join_trip(text)        to authenticated;
grant execute on function public.leave_trip(uuid)       to authenticated;
grant execute on function public.is_trip_member(uuid)   to authenticated;

-- ------------------------------------------------------------
--  Controle
-- ------------------------------------------------------------
-- Verwacht: drie rijen met rowsecurity = true
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('trips', 'trip_members', 'trip_items')
order by tablename;
