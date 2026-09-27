-- Element Drills: profiles, ranked scores, RPC-only writes.
-- Run once, in file-name order (0001, 0002, 0003), in the Supabase SQL editor.
--
-- Security model: RLS is enabled on every table with NO policies, and all table
-- privileges are revoked from the client roles (anon, authenticated). Clients
-- can only call the SECURITY DEFINER functions granted at the bottom of this
-- file. submit_run is the ONLY way a score row is ever written.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------

-- One row per ranked game. Ids and limits must match src/games/*.ts
-- (checked by src/lib/sqlParity.test.ts).
create table public.ranked_games (
  id            text primary key,
  entry_order   text    not null check (entry_order in ('any', 'asc', 'desc')),
  limit_ms      integer not null check (limit_ms > 0),
  complete_only boolean not null,            -- ordered games rank only full 118-element runs
  min_entry_ms  integer not null,            -- floor between two accepted entries
  min_letter_ms integer not null,            -- floor per letter of an entry
  min_total_ms  integer not null             -- floor for a full 118 run, scaled by entries
);
insert into public.ranked_games values
  ('nameAll',      'any',  720000, false, 150, 40, 30000),
  ('nameInOrder',  'asc',  900000, true,  150, 40, 30000),
  ('reverseOrder', 'desc', 900000, true,  150, 40, 30000);

create table public.elements (
  z     smallint primary key check (z between 1 and 118),
  names text[]   not null                    -- accepted spellings, normalized to a-z
);
-- Rows: 0002_elements.sql, generated from src/data/elements.ts.

create table public.blocked_words (word text primary key check (word ~ '^[a-z]{3,}$'));
-- Rows: 0003_blocked_words.sql.

-- ---------------------------------------------------------------------------
-- Accounts. No email, no real name: auth.users holds the email, and nothing
-- here ever returns it.
-- ---------------------------------------------------------------------------

create table public.profiles (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  username         text not null check (username ~ '^[a-z0-9_]{3,20}$'),
  age_confirmed_at timestamptz not null,     -- "13 or older" was confirmed; no birthdate stored
  created_at       timestamptz not null default now()
);
create unique index profiles_username_ci on public.profiles (lower(username));

-- ---------------------------------------------------------------------------
-- Runs and scores
-- ---------------------------------------------------------------------------

-- start_run issues one of these on the first keystroke. submit_run accepts a
-- run only if the server saw at least as much time pass as the run claims.
create table public.run_starts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  game_id    text not null references public.ranked_games (id),
  started_at timestamptz not null default now(),
  used_at    timestamptz
);
create index run_starts_user on public.run_starts (user_id, started_at desc);

-- Every submit attempt, accepted or not, for rate limiting.
create table public.submissions (
  id      bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  at      timestamptz not null default now(),
  outcome text not null                      -- 'accepted' or the rejection reason
);
create index submissions_user on public.submissions (user_id, at desc);

create table public.scores (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  game_id      text not null references public.ranked_games (id),
  named        smallint not null check (named between 1 and 118),
  time_ms      integer  not null check (time_ms > 0),
  events       jsonb    not null,
  submitted_at timestamptz not null default now()
);
create index scores_board on public.scores (game_id, named desc, time_ms, submitted_at, id);
create index scores_user  on public.scores (user_id, game_id);

-- RLS on with no policies = every client role is denied. Grants revoked as well.
do $$
declare t text;
begin
  foreach t in array array['ranked_games', 'elements', 'blocked_words', 'profiles',
                           'run_starts', 'submissions', 'scores'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Private helpers (schema not exposed to the API, not executable by clients)
-- ---------------------------------------------------------------------------

-- Same as normalize() in src/lib/matching.ts: lowercase, strip every non-letter.
create function private.norm(s text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(lower(s), '[^a-z]', '', 'g')
$$;

-- Weekly boards start Monday 00:00 UTC.
create function private.week_start() returns timestamptz
language sql stable set search_path = '' as $$
  select date_trunc('week', now() at time zone 'utc') at time zone 'utc'
$$;

-- Substring match after dropping underscores and folding common digit swaps.
create function private.username_blocked(u text) returns boolean
language sql stable set search_path = '' as $$
  select exists (
    select 1 from public.blocked_words b
    where position(b.word in translate(replace(u, '_', ''), '013457', 'oieast')) > 0)
$$;

-- Each user's best run for a game (all-time or this week), ranked.
-- Order: most named, then fastest, then earliest submitted (ties go to the earlier run).
create function private.board(p_game text, p_period text)
returns table (user_id uuid, named smallint, time_ms integer, submitted_at timestamptz, rank bigint)
language sql stable set search_path = '' as $$
  with best as (
    select distinct on (s.user_id) s.user_id, s.named, s.time_ms, s.submitted_at, s.id
    from public.scores s
    where s.game_id = p_game
      and (p_period = 'all' or s.submitted_at >= private.week_start())
    order by s.user_id, s.named desc, s.time_ms, s.submitted_at, s.id
  )
  select b.user_id, b.named, b.time_ms, b.submitted_at,
         row_number() over (order by b.named desc, b.time_ms, b.submitted_at, b.id)
  from best b
$$;

revoke all on all functions in schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Public RPCs
-- ---------------------------------------------------------------------------

create function public.get_my_profile() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('username', p.username)
  from public.profiles p where p.user_id = auth.uid()
$$;

create function public.create_profile(p_username text, p_age_confirmed boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  u   text := lower(trim(coalesce(p_username, '')));
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'reason', 'not_signed_in');
  end if;
  if p_age_confirmed is not true then
    return jsonb_build_object('ok', false, 'reason', 'age_not_confirmed');
  end if;
  if u !~ '^[a-z0-9_]{3,20}$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_username');
  end if;
  if private.username_blocked(u) then
    return jsonb_build_object('ok', false, 'reason', 'username_not_allowed');
  end if;
  if exists (select 1 from public.profiles where user_id = uid) then
    return jsonb_build_object('ok', false, 'reason', 'profile_exists');
  end if;
  begin
    insert into public.profiles (user_id, username, age_confirmed_at) values (uid, u, now());
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'username_taken');
  end;
  return jsonb_build_object('ok', true, 'username', u);
end $$;

create function public.start_run(p_game_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  rid uuid;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'reason', 'not_signed_in');
  end if;
  if not exists (select 1 from public.profiles where user_id = uid) then
    return jsonb_build_object('ok', false, 'reason', 'no_profile');
  end if;
  if not exists (select 1 from public.ranked_games where id = p_game_id) then
    return jsonb_build_object('ok', false, 'reason', 'unknown_game');
  end if;
  if (select count(*) from public.run_starts
      where user_id = uid and started_at > now() - interval '1 hour') >= 60 then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;
  insert into public.run_starts (user_id, game_id) values (uid, p_game_id) returning id into rid;
  return jsonb_build_object('ok', true, 'run_id', rid);
end $$;

-- The ONLY write path to scores. It recomputes the result from the events and
-- never trusts a client-computed score. It never raises: it returns
-- {ok: false, reason, detail} so the attempt is still logged for rate limiting.
--
-- p_events: [{ "name": "Hydrogen", "t": 1830 }, ...] in the order accepted,
-- t = ms since the run's first keystroke.
create function public.submit_run(p_game_id text, p_run_id uuid, p_events jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid       uuid := auth.uid();
  g         public.ranked_games;
  rs        public.run_starts;
  reason    text;
  detail    text;
  n         integer;
  ev        jsonb;
  i         bigint;
  nm        text;
  t         integer;
  prev_t    integer := 0;
  hit       smallint;
  seen      smallint[] := '{}';
  server_ms bigint;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'reason', 'not_signed_in');
  end if;

  -- Serialize one user's submissions so a parallel burst can't slip past the limit.
  perform pg_advisory_xact_lock(hashtext('submit:' || uid::text));

  if (select count(*) from public.submissions
      where user_id = uid and at > now() - interval '1 minute') >= 6
  or (select count(*) from public.submissions
      where user_id = uid and at > now() - interval '1 hour') >= 60 then
    insert into public.submissions (user_id, outcome) values (uid, 'rate_limited');
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  <<validate>>
  begin
    select * into g from public.ranked_games where id = p_game_id;
    if not found then
      reason := 'unknown_game'; exit validate;
    end if;

    select * into rs from public.run_starts r
      where r.id = p_run_id and r.user_id = uid and r.game_id = p_game_id
      for update;
    if not found then
      reason := 'unknown_run'; exit validate;
    end if;
    if rs.used_at is not null then
      reason := 'run_already_used'; exit validate;
    end if;
    update public.run_starts set used_at = now() where id = rs.id;   -- one attempt per run
    if rs.started_at < now() - make_interval(secs => g.limit_ms / 1000.0 + 3600) then
      reason := 'run_expired'; exit validate;
    end if;

    if jsonb_typeof(p_events) is distinct from 'array' then
      reason := 'bad_events'; exit validate;
    end if;
    n := jsonb_array_length(p_events);
    if n < 1 or n > 118 then
      reason := 'bad_events'; detail := format('%s entries', n); exit validate;
    end if;

    for ev, i in select e.value, e.ordinality from jsonb_array_elements(p_events) with ordinality e loop
      if jsonb_typeof(ev) is distinct from 'object'
         or jsonb_typeof(ev -> 'name') is distinct from 'string'
         or length(ev ->> 'name') > 40
         or jsonb_typeof(ev -> 't') is distinct from 'number'
         or (ev ->> 't') !~ '^[0-9]{1,9}$' then
        reason := 'bad_events'; detail := format('entry %s', i); exit validate;
      end if;
      nm := private.norm(ev ->> 'name');
      t  := (ev ->> 't')::integer;

      select e.z into hit from public.elements e where nm = any (e.names);
      if hit is null then
        reason := 'wrong_entry'; detail := format('entry %s', i); exit validate;
      end if;
      if hit = any (seen) then
        reason := 'duplicate'; detail := format('entry %s is element %s again', i, hit); exit validate;
      end if;
      if (g.entry_order = 'asc' and hit <> i) or (g.entry_order = 'desc' and hit <> 119 - i) then
        reason := 'out_of_order'; detail := format('entry %s is element %s', i, hit); exit validate;
      end if;
      if t <= prev_t then
        reason := 'bad_timestamps'; detail := format('entry %s', i); exit validate;
      end if;
      if t - prev_t < greatest(g.min_entry_ms, g.min_letter_ms * length(nm)) then
        reason := 'too_fast'; detail := format('entry %s after %s ms', i, t - prev_t); exit validate;
      end if;
      seen   := seen || hit;
      prev_t := t;
    end loop;

    if prev_t < g.min_total_ms * n / 118 then
      reason := 'too_fast'; detail := format('total %s ms', prev_t); exit validate;
    end if;
    if prev_t > g.limit_ms then
      reason := 'over_time_limit'; detail := format('%s ms', prev_t); exit validate;
    end if;
    if g.complete_only and n <> 118 then
      reason := 'incomplete'; detail := format('%s of 118', n); exit validate;
    end if;
    -- The run can't be longer than the time the server saw since start_run (5 s slack for latency).
    server_ms := floor(extract(epoch from now() - rs.started_at) * 1000);
    if prev_t > server_ms + 5000 then
      reason := 'time_mismatch';
      detail := format('claimed %s ms, server saw %s ms', prev_t, server_ms);
      exit validate;
    end if;
  end;

  insert into public.submissions (user_id, outcome) values (uid, coalesce(reason, 'accepted'));
  if reason is not null then
    return jsonb_build_object('ok', false, 'reason', reason, 'detail', detail);
  end if;

  insert into public.scores (user_id, game_id, named, time_ms, events)
    values (uid, p_game_id, n, prev_t, p_events);

  -- Ranks are of the user's best run, which may be an earlier one.
  return jsonb_build_object('ok', true, 'named', n, 'time_ms', prev_t,
    'rank_all',  (select b.rank from private.board(p_game_id, 'all')  b where b.user_id = uid),
    'rank_week', (select b.rank from private.board(p_game_id, 'week') b where b.user_id = uid));
end $$;

-- Top 50, plus the caller's own row when it's outside the top 50.
create function public.get_leaderboard(p_game_id text, p_period text)
returns table (rank bigint, username text, named smallint, time_ms integer,
               submitted_at timestamptz, is_me boolean)
language sql stable security definer set search_path = '' as $$
  select b.rank, p.username, b.named, b.time_ms, b.submitted_at,
         coalesce(b.user_id = auth.uid(), false)
  from private.board(p_game_id, p_period) b
  join public.profiles p on p.user_id = b.user_id
  where p_period in ('all', 'week')
    and (b.rank <= 50 or b.user_id = auth.uid())
  order by b.rank
$$;

create function public.get_my_best(p_game_id text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'all',  (select to_jsonb(b) - 'user_id' from private.board(p_game_id, 'all')  b where b.user_id = auth.uid()),
    'week', (select to_jsonb(b) - 'user_id' from private.board(p_game_id, 'week') b where b.user_id = auth.uid()))
$$;

-- Supabase grants EXECUTE on new functions to anon by default; take it back explicitly.
revoke all on function
  public.get_my_profile(),
  public.create_profile(text, boolean),
  public.start_run(text),
  public.submit_run(text, uuid, jsonb),
  public.get_leaderboard(text, text),
  public.get_my_best(text)
from public, anon, authenticated;

grant execute on function
  public.get_my_profile(),
  public.create_profile(text, boolean),
  public.start_run(text),
  public.submit_run(text, uuid, jsonb),
  public.get_my_best(text)
to authenticated;

grant execute on function public.get_leaderboard(text, text) to anon, authenticated;
