-- Leibgame Supabase schema
-- Run in Supabase SQL Editor (Dashboard → SQL → New query)

-- Player progression (coins, stars, shop)
create table if not exists public.player_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Player',
  coins integer not null default 0 check (coins >= 0),
  stars integer not null default 0 check (stars >= 0),
  upgrades jsonb not null default '{}'::jsonb,
  ronnie_unlocked boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Shared room / session state (world layout + collected entities)
create table if not exists public.rooms (
  id text primary key,
  host_id uuid references auth.users (id) on delete set null,
  world_data jsonb not null,
  generated_at bigint not null,
  collected_coin_ids integer[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Live player presence inside a room
create table if not exists public.room_players (
  room_id text not null references public.rooms (id) on delete cascade,
  player_id uuid not null references auth.users (id) on delete cascade,
  name text not null default 'Player',
  x double precision not null default 0,
  y double precision not null default 0,
  z double precision not null default 0,
  rot double precision not null default 0,
  current_animation text not null default 'idle',
  player_appearance jsonb,
  last_update bigint not null default 0,
  primary key (room_id, player_id)
);

create index if not exists room_players_room_id_idx on public.room_players (room_id);
create index if not exists room_players_last_update_idx on public.room_players (last_update);

-- Auto-create profile on sign-up (anonymous or email)
create or replace function public.handle_new_user ()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
  as $$
begin
  insert into public.player_profiles (id, display_name)
    values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', 'Player'))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users for each row
  execute function public.handle_new_user ();

-- RLS
alter table public.player_profiles enable row level security;
alter table public.rooms enable row level security;
alter table public.room_players enable row level security;

-- Profiles: own row only
create policy "profiles_select_own" on public.player_profiles
  for select to authenticated
  using (auth.uid () = id);

create policy "profiles_insert_own" on public.player_profiles
  for insert to authenticated
  with check (auth.uid () = id);

create policy "profiles_update_own" on public.player_profiles
  for update to authenticated
  using (auth.uid () = id)
  with check (auth.uid () = id);

-- Rooms: any signed-in player can read; any signed-in player can create/update (casual co-op)
create policy "rooms_select_authenticated" on public.rooms
  for select to authenticated
  using (true);

create policy "rooms_insert_authenticated" on public.rooms
  for insert to authenticated
  with check (true);

create policy "rooms_update_authenticated" on public.rooms
  for update to authenticated
  using (true)
  with check (true);

-- Room players: read all in room; write own row; delete own row
create policy "room_players_select_authenticated" on public.room_players
  for select to authenticated
  using (true);

create policy "room_players_insert_own" on public.room_players
  for insert to authenticated
  with check (auth.uid () = player_id);

create policy "room_players_update_own" on public.room_players
  for update to authenticated
  using (auth.uid () = player_id)
  with check (auth.uid () = player_id);

create policy "room_players_delete_own" on public.room_players
  for delete to authenticated
  using (auth.uid () = player_id);

-- After running this file, enable Realtime replication for `rooms` and `room_players`:
-- Dashboard → Database → Publications → supabase_realtime → add both tables.
