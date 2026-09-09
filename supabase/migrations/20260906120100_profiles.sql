-- Momentum — profiles.
--
-- One row per auth user, created by a trigger on auth.users so a profile can
-- never be missing for a signed-in account. `level`, `xp` and `coins` are
-- guarded: the client may read them and may never write them (Domain Rule 6).

create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text        not null default '',
  timezone      text        not null default 'UTC',
  week_start    smallint    not null default 1,
  working_hours jsonb       not null default jsonb_build_object(
                              '0', '[]'::jsonb,
                              '1', '[{"start":"09:00","end":"17:00"}]'::jsonb,
                              '2', '[{"start":"09:00","end":"17:00"}]'::jsonb,
                              '3', '[{"start":"09:00","end":"17:00"}]'::jsonb,
                              '4', '[{"start":"09:00","end":"17:00"}]'::jsonb,
                              '5', '[{"start":"09:00","end":"17:00"}]'::jsonb,
                              '6', '[]'::jsonb
                            ),
  focus_windows jsonb       not null default '[]'::jsonb,
  snap_minutes  smallint    not null default 15,
  level         integer     not null default 1,
  xp            integer     not null default 0,
  coins         integer     not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint profiles_display_name_chk  check (length(display_name) <= 80),
  constraint profiles_week_start_chk    check (week_start between 0 and 6),
  constraint profiles_working_hours_chk check (jsonb_typeof(working_hours) = 'object'),
  constraint profiles_focus_windows_chk check (jsonb_typeof(focus_windows) = 'array'),
  constraint profiles_snap_minutes_chk  check (snap_minutes in (5, 10, 15, 30)),
  constraint profiles_level_chk         check (level >= 1),
  constraint profiles_xp_chk            check (xp >= 0),
  constraint profiles_coins_chk         check (coins >= 0)
);

comment on table public.profiles is
  'One row per auth user. The profile timezone is the only timezone persisted logic may use (Domain Rule 4).';
comment on column public.profiles.working_hours is
  'Record<Weekday, TimeWindow[]> keyed "0".."6" (0 = Sunday). Shape is validated by zod at the app boundary.';
comment on column public.profiles.xp is
  'Guarded: maintained by the XP ledger trigger. Never client-writable (Domain Rule 15).';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger profiles_validate_timezone
  before insert or update of timezone on public.profiles
  for each row execute function public.validate_timezone();

-- Guarded columns -----------------------------------------------------------

create function public.guard_profiles()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_trusted() then
    return new;
  end if;

  if new.xp is distinct from old.xp then
    perform public.reject_guarded_write('profiles', 'xp');
  end if;
  if new.level is distinct from old.level then
    perform public.reject_guarded_write('profiles', 'level');
  end if;
  if new.coins is distinct from old.coins then
    perform public.reject_guarded_write('profiles', 'coins');
  end if;

  return new;
end;
$$;

create trigger profiles_guard
  before update on public.profiles
  for each row execute function public.guard_profiles();

-- Row-level security --------------------------------------------------------
--
-- No insert policy: the row is created by handle_new_user(). No delete policy:
-- the row disappears with the auth user via the cascade.

alter table public.profiles enable row level security;

create policy "profiles: select own"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy "profiles: update own"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Signup ---------------------------------------------------------------------
--
-- The signup form sends the browser timezone in raw_user_meta_data; it is
-- copied only when Postgres recognises it, otherwise the profile starts at UTC
-- and the app shows the mismatch banner (docs/ARCHITECTURE.md §10).

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_timezone text := new.raw_user_meta_data ->> 'timezone';
  v_display  text := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '');
begin
  insert into public.profiles (id, display_name, timezone)
  values (
    new.id,
    -- No name given: the part before the @ is a better greeting than blank.
    left(coalesce(v_display, split_part(coalesce(new.email, ''), '@', 1)), 80),
    case when public.is_valid_timezone(v_timezone) then v_timezone else 'UTC' end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'AFTER INSERT trigger on auth.users: creates the profile row. Runs as the definer so it is unaffected by profiles RLS.';

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
