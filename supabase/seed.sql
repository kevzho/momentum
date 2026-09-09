-- Momentum — development seed.
--
-- Applied by `supabase db reset`. It creates two accounts, because a seed with
-- one user cannot prove anything about row-level security: the RLS suite signs
-- in as both and asserts the second can reach none of the first's rows.
--
-- Everything is positioned relative to now() in each profile's own timezone, so
-- the seed never goes stale and "this week" is always this week. Seed data is a
-- testing asset: the shapes below (a task with three work blocks, three
-- overlapping events, a series with an override and a cancellation, every habit
-- frequency, eight weeks of focus history) are exactly the cases later phases
-- have to get right.
--
-- Sign in with:
--   demo@momentum.test   / momentum123   (the populated account)
--   second@momentum.test / momentum123   (the neighbour who must see nothing)

-- Guarded columns are written by trusted logic only. The seed says so
-- explicitly rather than working around the triggers (Domain Rule 15).
set momentum.trusted = 'on';

-- ---------------------------------------------------------------------------
-- Accounts. The trigger on auth.users creates each profile; the timezone
-- travels in raw_user_meta_data exactly as the signup form sends it.
-- ---------------------------------------------------------------------------

-- GoTrue scans the token columns into non-nullable strings, and they have no
-- default, so a row inserted here with NULLs makes every later sign-in fail
-- with "Database error querying schema". Empty strings are what GoTrue's own
-- inserts write.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '11111111-1111-4111-8111-111111111111',
    'authenticated', 'authenticated', 'demo@momentum.test',
    extensions.crypt('momentum123', extensions.gen_salt('bf')),
    now() - interval '8 weeks',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Demo Ross","timezone":"America/New_York"}'::jsonb,
    now() - interval '8 weeks', now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '22222222-2222-4222-8222-222222222222',
    'authenticated', 'authenticated', 'second@momentum.test',
    extensions.crypt('momentum123', extensions.gen_salt('bf')),
    now() - interval '3 weeks',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Sam Okafor","timezone":"Europe/London"}'::jsonb,
    now() - interval '3 weeks', now(),
    '', '', '', ''
  );

-- GoTrue needs an identity row before an email/password sign-in works.
insert into auth.identities (
  id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
)
select
  gen_random_uuid(),
  u.id,
  u.id::text,
  jsonb_build_object(
    'sub', u.id::text, 'email', u.email, 'email_verified', true, 'phone_verified', false
  ),
  'email',
  now(), now(), now()
from auth.users u
where u.email in ('demo@momentum.test', 'second@momentum.test');

-- Working hours differ per account so capacity maths has something to chew on.
update public.profiles
   set week_start = 1,
       snap_minutes = 15,
       focus_windows = '[{"start":"09:00","end":"12:00"},{"start":"14:00","end":"17:00"}]'::jsonb
 where id = '11111111-1111-4111-8111-111111111111';

update public.profiles
   set week_start = 0,
       snap_minutes = 30
 where id = '22222222-2222-4222-8222-222222222222';

-- ---------------------------------------------------------------------------
-- The populated account
-- ---------------------------------------------------------------------------

do $seed$
declare
  u              uuid := '11111111-1111-4111-8111-111111111111';
  tz             text := 'America/New_York';
  today          date;
  monday         date;   -- start of the current week, in the profile timezone

  p_thesis       uuid := gen_random_uuid();
  p_course       uuid := gen_random_uuid();
  p_side         uuid := gen_random_uuid();
  p_home         uuid := gen_random_uuid();
  p_old          uuid := gen_random_uuid();

  t_essay        uuid := gen_random_uuid();
  t_reading      uuid := gen_random_uuid();
  t_lit          uuid := gen_random_uuid();
  t_data         uuid := gen_random_uuid();
  t_supervisor   uuid := gen_random_uuid();
  t_deploy       uuid := gen_random_uuid();
  t_refactor     uuid := gen_random_uuid();
  t_dentist      uuid := gen_random_uuid();
  t_shop         uuid := gen_random_uuid();
  t_taxes        uuid := gen_random_uuid();
  t_talk         uuid := gen_random_uuid();
  t_library      uuid := gen_random_uuid();
  t_brief        uuid := gen_random_uuid();

  h_read         uuid := gen_random_uuid();
  h_gym          uuid := gen_random_uuid();
  h_run          uuid := gen_random_uuid();
  h_meditate     uuid := gen_random_uuid();
  h_language     uuid := gen_random_uuid();

  series_class   uuid := gen_random_uuid();
  ev_meeting     uuid := gen_random_uuid();

  session_id     uuid;
  n              integer;
  minutes        integer;
begin
  today := (now() at time zone tz)::date;
  monday := today - (extract(isodow from today)::integer - 1);

  -- Projects. One archived, because "archived" is the normal way a project
  -- ends and every list has to handle it.
  insert into public.projects (id, user_id, name, description, color, archived_at, created_at)
  values
    (p_thesis, u, 'Thesis',        'Chapter drafts, data, supervisor meetings.', 'violet', null, now() - interval '8 weeks'),
    (p_course, u, 'Coursework',    'Statistics and history modules.',            'blue',   null, now() - interval '8 weeks'),
    (p_side,   u, 'Side project',  'The scheduling tool, ironically.',           'teal',   null, now() - interval '6 weeks'),
    (p_home,   u, 'Home',          null,                                          'amber',  null, now() - interval '8 weeks'),
    (p_old,    u, 'Internship search', 'Closed out in the spring.',              'slate',  now() - interval '2 weeks', now() - interval '7 weeks');

  -- Open tasks: every priority, with and without due dates and estimates.
  insert into public.tasks
    (id, user_id, project_id, title, description, priority, estimated_minutes, due_date, sort_order, created_at)
  values
    (t_essay,      u, p_course, 'History essay draft', 'Argument, three sources, 2000 words.', 1, 135, monday + 4, 100, now() - interval '9 days'),
    (t_reading,    u, p_course, 'Read chapters 4-6',   null,                                   2,  90, monday + 8, 200, now() - interval '6 days'),
    (t_lit,        u, p_thesis, 'Literature review outline', 'Group by method, not by year.',  1, 180, monday + 10, 300, now() - interval '12 days'),
    (t_data,       u, p_thesis, 'Clean survey data',   'Drop partials, recode the Likert items.', 2, 240, null,   400, now() - interval '5 days'),
    (t_supervisor, u, p_thesis, 'Email supervisor',    null,                                   3,  10, today,     500, now() - interval '2 days'),
    (t_deploy,     u, p_side,   'Deploy staging build', null,                                  2,  60, today - 1, 600, now() - interval '4 days'),
    (t_refactor,   u, p_side,   'Refactor the auth module', 'Split the session helper out.',   3, 120, null,      700, now() - interval '3 days'),
    (t_dentist,    u, p_home,   'Book dentist',        null,                                   4,  15, today + 3, 800, now() - interval '10 days'),
    (t_shop,       u, p_home,   'Weekly shop',         null,                                   4, null, null,     900, now() - interval '1 day'),
    (t_taxes,      u, p_home,   'File taxes',          null,                                   1,  90, today + 21, 1000, now() - interval '14 days'),
    -- Inbox: no project at all.
    (t_talk,       u, null,     'Sketch a talk proposal', null,                                4, null, null,     1100, now() - interval '2 days'),
    (t_library,    u, null,     'Renew library card',  null,                                   4,   5, null,     1200, now() - interval '1 day');

  -- Subtasks, one level deep. The trigger copies the parent's project.
  insert into public.tasks
    (user_id, parent_task_id, title, priority, estimated_minutes, sort_order, status, completed_at, created_at)
  values
    (u, t_essay, 'Outline the argument', 2, 30, 10, 'completed', now() - interval '2 days', now() - interval '9 days'),
    (u, t_essay, 'Find three sources',   2, 45, 20, 'open',      null,                      now() - interval '9 days'),
    (u, t_essay, 'Draft the introduction', 1, 60, 30, 'open',    null,                      now() - interval '9 days');

  -- An archived task: status and archived_at always move together.
  insert into public.tasks
    (id, user_id, project_id, title, priority, status, archived_at, sort_order, created_at)
  values
    (t_brief, u, p_course, 'Old project brief', 3, 'archived', now() - interval '3 weeks', 1300, now() - interval '7 weeks');

  -- Eight weeks of completed work, so analytics and the review have history.
  for n in 1..28 loop
    insert into public.tasks
      (user_id, project_id, title, priority, estimated_minutes, actual_minutes, due_date,
       status, completed_at, sort_order, created_at)
    values (
      u,
      (array[p_thesis, p_course, p_side, p_home])[1 + (n % 4)],
      (array[
        'Weekly reading notes', 'Tidy the reference list', 'Fix the chart axes',
        'Review pull request', 'Plan the week', 'Write up the method',
        'Reply to seminar thread'
      ])[1 + (n % 7)] || ' #' || n,
      1 + (n % 4),
      case when n % 3 = 0 then null else 20 + (n % 5) * 15 end,
      15 + (n % 6) * 10,
      case when n % 4 = 0 then null else today - (n * 2) end,
      'completed',
      ((today - n * 2)::timestamp + interval '17 hours') at time zone tz,
      2000 + n,
      now() - ((n * 2 + 3) || ' days')::interval
    );
  end loop;

  -- Work blocks. A task owns as many as the work needs (Domain Rule 2): the
  -- essay has three, spread across three evenings, all pointing at one task.
  insert into public.calendar_blocks (user_id, kind, task_id, start_at, end_at, created_at)
  values
    (u, 'work', t_essay,   ((monday + 0)::timestamp + time '16:00') at time zone tz, ((monday + 0)::timestamp + time '16:45') at time zone tz, now() - interval '9 days'),
    (u, 'work', t_essay,   ((monday + 1)::timestamp + time '17:00') at time zone tz, ((monday + 1)::timestamp + time '18:00') at time zone tz, now() - interval '9 days'),
    (u, 'work', t_essay,   ((monday + 3)::timestamp + time '19:00') at time zone tz, ((monday + 3)::timestamp + time '19:30') at time zone tz, now() - interval '9 days'),
    (u, 'work', t_reading, ((monday + 1)::timestamp + time '10:00') at time zone tz, ((monday + 1)::timestamp + time '11:00') at time zone tz, now() - interval '6 days'),
    (u, 'work', t_reading, ((monday + 4)::timestamp + time '10:00') at time zone tz, ((monday + 4)::timestamp + time '10:30') at time zone tz, now() - interval '6 days'),
    (u, 'work', t_lit,     ((monday + 2)::timestamp + time '09:00') at time zone tz, ((monday + 2)::timestamp + time '10:30') at time zone tz, now() - interval '12 days'),
    (u, 'work', t_lit,     ((monday + 5)::timestamp + time '11:00') at time zone tz, ((monday + 5)::timestamp + time '12:30') at time zone tz, now() - interval '12 days'),
    (u, 'work', t_data,    ((monday + 2)::timestamp + time '14:00') at time zone tz, ((monday + 2)::timestamp + time '16:00') at time zone tz, now() - interval '5 days'),
    (u, 'work', t_deploy,  ((monday + 0)::timestamp + time '11:00') at time zone tz, ((monday + 0)::timestamp + time '12:00') at time zone tz, now() - interval '4 days');

  -- A completed block on a task that is still open: executing a planned span
  -- is not the same as finishing the work (Domain Rule 13).
  update public.calendar_blocks
     set completed_at = start_at + interval '45 minutes'
   where user_id = u and task_id = t_essay and start_at < now();

  -- Events, including three that overlap on Wednesday afternoon so the grid's
  -- column layout has a real cluster to lay out.
  insert into public.calendar_blocks
    (id, user_id, kind, title, description, start_at, end_at, color, created_at)
  values
    (ev_meeting, u, 'event', 'Supervisor meeting', 'Bring the outline.',
      ((monday + 2)::timestamp + time '14:00') at time zone tz,
      ((monday + 2)::timestamp + time '15:00') at time zone tz, 'violet', now() - interval '7 days'),
    (gen_random_uuid(), u, 'event', 'Study group', null,
      ((monday + 2)::timestamp + time '14:30') at time zone tz,
      ((monday + 2)::timestamp + time '16:00') at time zone tz, 'blue', now() - interval '7 days'),
    (gen_random_uuid(), u, 'event', 'Coffee with Sam', null,
      ((monday + 2)::timestamp + time '15:30') at time zone tz,
      ((monday + 2)::timestamp + time '16:30') at time zone tz, null, now() - interval '5 days'),
    (gen_random_uuid(), u, 'event', 'Dentist', null,
      ((monday + 3)::timestamp + time '08:30') at time zone tz,
      ((monday + 3)::timestamp + time '09:15') at time zone tz, 'rose', now() - interval '10 days');

  -- An all-day event. Still a span, so the same range query finds it.
  insert into public.calendar_blocks (user_id, kind, title, start_at, end_at, all_day, created_at)
  values (u, 'event', 'Department conference',
    ((monday + 7)::timestamp + time '00:00') at time zone tz,
    ((monday + 8)::timestamp + time '00:00') at time zone tz, true, now() - interval '3 weeks');

  -- A weekly series with the timezone its wall-clock schedule is defined in
  -- (Domain Rule 16). Occurrences are expanded at query time, never stored.
  insert into public.calendar_blocks
    (id, user_id, kind, title, start_at, end_at, color, recurrence, created_at)
  values (
    series_class, u, 'event', 'Statistics lecture',
    ((monday - 21)::timestamp + time '09:00') at time zone tz,
    ((monday - 21)::timestamp + time '10:30') at time zone tz,
    'blue',
    jsonb_build_object(
      'freq', 'weekly',
      'interval', 1,
      'byWeekday', jsonb_build_array(2, 4),
      'until', to_char(monday + 63, 'YYYY-MM-DD'),
      'count', null,
      'timezone', tz
    ),
    now() - interval '6 weeks'
  );

  -- One occurrence moved, one cancelled: the two edits the model has to support
  -- without materialising the rest of the series.
  insert into public.calendar_blocks
    (user_id, kind, title, start_at, end_at, series_id, occurrence_date, created_at)
  values (
    u, 'event', 'Statistics lecture (moved)',
    ((monday + 1)::timestamp + time '11:00') at time zone tz,
    ((monday + 1)::timestamp + time '12:30') at time zone tz,
    series_class, monday + 1, now() - interval '2 days'
  );

  insert into public.calendar_blocks
    (user_id, kind, title, start_at, end_at, series_id, occurrence_date, cancelled, created_at)
  values (
    u, 'event', 'Statistics lecture',
    ((monday + 3)::timestamp + time '09:00') at time zone tz,
    ((monday + 3)::timestamp + time '10:30') at time zone tz,
    series_class, monday + 3, true, now() - interval '2 days'
  );

  -- Habits: one of every frequency type, because each one counts differently.
  insert into public.habits
    (id, user_id, name, description, frequency_type, target, unit, active_days,
     preferred_start_time, estimated_minutes, xp_reward, color, created_at)
  values
    (h_read,      u, 'Read 20 pages',      null,                       'daily',           1, 'count',   '{}',        time '21:30', 25,  5, 'indigo', now() - interval '8 weeks'),
    (h_gym,       u, 'Gym',                'Push, pull, legs.',        'weekdays',        1, 'count',   '{1,3,5}',   time '07:00', 60,  8, 'red',    now() - interval '8 weeks'),
    (h_run,       u, 'Run',                'Any three days.',          'times_per_week',  3, 'count',   '{}',        null,         30,  8, 'green',  now() - interval '6 weeks'),
    (h_meditate,  u, 'Meditate',           null,                       'amount_per_day', 15, 'minutes', '{}',        time '08:00', 15,  5, 'teal',   now() - interval '8 weeks'),
    (h_language,  u, 'Language practice',  'Two hours a week, any shape.', 'amount_per_week', 120, 'minutes', '{}', null,         30,  6, 'amber',  now() - interval '5 weeks');

  -- Habit blocks for the current week, written by "Add to week".
  insert into public.calendar_blocks (user_id, kind, habit_id, start_at, end_at, created_at)
  select
    u, 'habit', h_gym,
    ((monday + d)::timestamp + time '07:00') at time zone tz,
    ((monday + d)::timestamp + time '08:00') at time zone tz,
    now() - interval '3 days'
  from unnest(array[0, 2, 4]) as d;

  insert into public.calendar_blocks (user_id, kind, habit_id, start_at, end_at, created_at)
  select
    u, 'habit', h_meditate,
    ((monday + d)::timestamp + time '08:00') at time zone tz,
    ((monday + d)::timestamp + time '08:15') at time zone tz,
    now() - interval '3 days'
  from generate_series(0, 4) as d;

  -- Eight weeks of completions with real gaps. A missed day lowers a rate; it
  -- never deletes anything (Domain Rule 7), so the holes below are the point.
  --
  -- Ids come from public.habit_completion_id() rather than the column default,
  -- because that is the id record_habit_completion() would give the same day —
  -- and the XP awards below point at it. A seeded row with a random id would
  -- earn a second award the first time the app re-recorded that day
  -- (Domain Rule 6).
  for n in 0..55 loop
    -- Daily reading: most days, but not all.
    if n % 7 <> 3 and n % 11 <> 5 then
      insert into public.habit_completions (id, habit_id, user_id, completion_date, amount, completed_at)
      values (public.habit_completion_id(h_read, today - n), h_read, u, today - n, 1, least(((today - n)::timestamp + interval '21 hours') at time zone tz, now()))
      on conflict do nothing;
    end if;

    -- Gym on its active days, with a skipped fortnight.
    if extract(isodow from today - n)::integer in (1, 3, 5) and (n < 14 or n > 27) then
      insert into public.habit_completions (id, habit_id, user_id, completion_date, amount, completed_at)
      values (public.habit_completion_id(h_gym, today - n), h_gym, u, today - n, 1, least(((today - n)::timestamp + interval '8 hours') at time zone tz, now()))
      on conflict do nothing;
    end if;

    -- Three runs a week, some weeks two.
    if extract(isodow from today - n)::integer in (2, 6) or (n % 9 = 0) then
      insert into public.habit_completions (id, habit_id, user_id, completion_date, amount, completed_at)
      values (public.habit_completion_id(h_run, today - n), h_run, u, today - n, 1, least(((today - n)::timestamp + interval '7 hours') at time zone tz, now()))
      on conflict do nothing;
    end if;

    -- Amount habits accumulate minutes rather than a tick.
    if n % 3 <> 2 then
      insert into public.habit_completions (id, habit_id, user_id, completion_date, amount, completed_at)
      values (public.habit_completion_id(h_meditate, today - n), h_meditate, u, today - n, 10 + (n % 3) * 5, least(((today - n)::timestamp + interval '8 hours') at time zone tz, now()))
      on conflict do nothing;
    end if;

    if n % 4 = 1 then
      insert into public.habit_completions (id, habit_id, user_id, completion_date, amount, completed_at)
      values (public.habit_completion_id(h_language, today - n), h_language, u, today - n, 30 + (n % 3) * 10, least(((today - n)::timestamp + interval '19 hours') at time zone tz, now()))
      on conflict do nothing;
    end if;
  end loop;

  -- Eight weeks of focus sessions. Every one is finished: the partial unique
  -- index allows a single live session per user, and a seed that left one
  -- running would block the first real one.
  for n in 1..56 loop
    if n % 3 <> 0 then
      minutes := 25 + (n % 4) * 15;
      session_id := gen_random_uuid();

      insert into public.focus_sessions
        (id, user_id, task_id, project_id, planned_minutes, actual_minutes,
         started_at, ended_at, status, interruption_count, created_at)
      values (
        session_id,
        u,
        case when n % 5 = 0 then null else (
          select t.id from public.tasks t
           where t.user_id = u and t.status = 'completed'
           order by md5(t.id::text || n::text)
           limit 1
        ) end,
        (array[p_thesis, p_course, p_side, p_home])[1 + (n % 4)],
        minutes,
        case when n % 13 = 0 then greatest(minutes - 12, 1) else minutes end,
        ((today - n)::timestamp + interval '10 hours') at time zone tz,
        ((today - n)::timestamp + interval '10 hours' + (minutes || ' minutes')::interval) at time zone tz,
        case when n % 13 = 0 then 'abandoned' else 'completed' end::public.focus_status,
        n % 3,
        ((today - n)::timestamp + interval '10 hours') at time zone tz
      );

      -- Every fourth session was interrupted long enough to pause it.
      if n % 4 = 1 then
        insert into public.focus_pauses (session_id, user_id, paused_at, resumed_at)
        values (
          session_id, u,
          ((today - n)::timestamp + interval '10 hours 12 minutes') at time zone tz,
          ((today - n)::timestamp + interval '10 hours 17 minutes') at time zone tz
        );
      end if;
    end if;
  end loop;

  -- Actual minutes on a task are the sum of its finished sessions, never a
  -- number anyone typed (Domain Rule 3).
  update public.tasks t
     set actual_minutes = coalesce(s.total, 0)
    from (
      select task_id, sum(actual_minutes)::integer as total
        from public.focus_sessions
       where user_id = u and task_id is not null and actual_minutes is not null
       group by task_id
    ) s
   where t.id = s.task_id and t.user_id = u;

  -- A weekly goal and a review, so those surfaces are not empty either.
  insert into public.weekly_goals (user_id, week_start, metric, target, title, created_at)
  values
    (u, monday, 'focus_minutes', 300, 'Four solid mornings', now() - interval '2 days'),
    (u, monday - 7, 'tasks_completed', 10, null, now() - interval '9 days');

  insert into public.weekly_reviews
    (user_id, week_start, went_well, got_in_the_way, change_next_week, completed_at, created_at)
  values (
    u, monday - 7,
    'Three mornings on the literature review before anything else.',
    'Two afternoons disappeared into email.',
    'Block the first hour after lunch as well.',
    now() - interval '6 days', now() - interval '6 days'
  );

  -- The ledger, consistent with the history above. Idempotent by construction:
  -- the partial unique index means each source can be awarded once.
  insert into public.xp_events (user_id, source_type, source_id, amount, reason, created_at)
  select
    u, 'task', t.id,
    10 + case when t.priority = 1 then 5 else 0 end,
    'Completed "' || t.title || '"',
    t.completed_at
  from public.tasks t
  where t.user_id = u and t.status = 'completed'
  on conflict do nothing;

  insert into public.xp_events (user_id, source_type, source_id, amount, reason, created_at)
  select
    u, 'focus_session', f.id,
    least(f.actual_minutes, 120),
    'Focused for ' || f.actual_minutes || ' minutes',
    f.ended_at
  from public.focus_sessions f
  where f.user_id = u and f.status = 'completed' and f.actual_minutes >= 5
  on conflict do nothing;

  insert into public.xp_events (user_id, source_type, source_id, amount, reason, created_at)
  select
    u, 'habit_completion', c.id, h.xp_reward,
    'Kept up "' || h.name || '"',
    c.completed_at
  from public.habit_completions c
  join public.habits h on h.id = c.habit_id
  where c.user_id = u
  on conflict do nothing;

  -- profiles.xp is reconciled from the ledger at the very end of this file,
  -- after every block has finished awarding, so it can never lag an award made
  -- further down.
end;
$seed$;

-- ---------------------------------------------------------------------------
-- Unlocks, assignments and a purchase.
--
-- The functions that award these arrive with the gamification phase; the rows
-- exist now so every user-owned table has data on both sides of the fence and
-- the RLS proofs are never vacuous.
-- ---------------------------------------------------------------------------

do $seed$
declare
  u      uuid := '11111111-1111-4111-8111-111111111111';
  tz     text := 'America/New_York';
  today  date;
  monday date;
begin
  today := (now() at time zone tz)::date;
  monday := today - (extract(isodow from today)::integer - 1);

  insert into public.user_achievements (user_id, achievement_id, unlocked_at)
  select u, a.id, now() - interval '7 weeks'
    from public.achievement_definitions a
   where a.key in ('first_step', 'deep_work')
  on conflict do nothing;

  insert into public.xp_events (user_id, source_type, source_id, amount, reason)
  select u, 'achievement', ua.achievement_id, public.xp_rule('achievement_base'),
         'Unlocked "' || a.name || '"'
    from public.user_achievements ua
    join public.achievement_definitions a on a.id = ua.achievement_id
   where ua.user_id = u
  on conflict do nothing;

  -- Three daily quests for today and two weekly ones for this week, assigned by
  -- the same function the application calls, so the seed cannot drift from the
  -- rotation the product actually uses (20260907140000_gamification_functions.sql).
  perform public.assign_quests(u, 'daily', today);
  perform public.assign_quests(u, 'weekly', monday);

  -- One of today's is already done, so the surface has both states in it.
  update public.quest_assignments a
     set completed_at = now() - interval '2 hours'
   where a.user_id = u and a.period = 'daily' and a.period_start = today and a.slot = 0;

  insert into public.user_cosmetics (user_id, cosmetic_id, purchased_at, equipped)
  select u, c.id, now() - interval '3 weeks', true
    from public.cosmetic_definitions c
   where c.key = 'frame_copper'
  on conflict do nothing;
end;
$seed$;

-- ---------------------------------------------------------------------------
-- The neighbouring account. Small on purpose: it exists so the RLS suite can
-- sign in as somebody else and prove that none of the rows above are reachable.
-- ---------------------------------------------------------------------------

do $seed$
declare
  u        uuid := '22222222-2222-4222-8222-222222222222';
  tz       text := 'Europe/London';
  today    date;
  sunday   date;
  proj     uuid := gen_random_uuid();
  task     uuid := gen_random_uuid();
  habit    uuid := gen_random_uuid();
  sess     uuid := gen_random_uuid();
begin
  today := (now() at time zone tz)::date;
  sunday := today - extract(dow from today)::integer;   -- this profile starts weeks on Sunday

  insert into public.projects (id, user_id, name, color, created_at)
  values (proj, u, 'Recording', 'cyan', now() - interval '3 weeks');

  insert into public.tasks
    (id, user_id, project_id, title, priority, estimated_minutes, due_date, sort_order, created_at)
  values
    (task, u, proj, 'Mix the second track', 2, 120, today + 2, 100, now() - interval '5 days');

  insert into public.tasks (user_id, project_id, title, priority, sort_order, status, completed_at, created_at)
  values (u, proj, 'Book the studio', 3, 200, 'completed', now() - interval '4 days', now() - interval '10 days');

  insert into public.tasks (user_id, title, priority, sort_order, created_at)
  values (u, 'Replace the guitar strings', 4, 300, now() - interval '2 days');

  insert into public.calendar_blocks (user_id, kind, task_id, start_at, end_at, created_at)
  values (u, 'work', task,
    ((sunday + 2)::timestamp + time '19:00') at time zone tz,
    ((sunday + 2)::timestamp + time '21:00') at time zone tz, now() - interval '5 days');

  insert into public.habits (id, user_id, name, frequency_type, target, unit, created_at)
  values (habit, u, 'Practise scales', 'daily', 1, 'count', now() - interval '3 weeks');

  insert into public.habit_completions (id, habit_id, user_id, completion_date, amount)
  values (public.habit_completion_id(habit, today - 1), habit, u, today - 1, 1);

  insert into public.focus_sessions
    (id, user_id, task_id, project_id, planned_minutes, actual_minutes, started_at, ended_at, status)
  values (sess, u, task, proj, 50, 48,
    ((today - 2)::timestamp + interval '19 hours') at time zone tz,
    ((today - 2)::timestamp + interval '19 hours 48 minutes') at time zone tz,
    'completed');

  insert into public.focus_pauses (session_id, user_id, paused_at, resumed_at)
  values (sess, u,
    ((today - 2)::timestamp + interval '19 hours 20 minutes') at time zone tz,
    ((today - 2)::timestamp + interval '19 hours 22 minutes') at time zone tz);

  insert into public.user_achievements (user_id, achievement_id, unlocked_at)
  select u, a.id, now() - interval '2 weeks'
    from public.achievement_definitions a where a.key = 'first_step';

  insert into public.xp_events (user_id, source_type, source_id, amount, reason)
  select u, 'task', t.id, 10, 'Completed "' || t.title || '"'
    from public.tasks t where t.user_id = u and t.status = 'completed';

  insert into public.xp_events (user_id, source_type, source_id, amount, reason)
  select u, 'achievement', ua.achievement_id, public.xp_rule('achievement_base'),
         'Unlocked "' || a.name || '"'
    from public.user_achievements ua
    join public.achievement_definitions a on a.id = ua.achievement_id
   where ua.user_id = u;

  -- One row in each of the remaining user-owned tables. Without them the RLS
  -- suite's "an unscoped select returns only the neighbour's own rows" is
  -- vacuously true for those tables, which proves nothing.
  perform public.assign_quests(u, 'daily', today);

  insert into public.weekly_goals (user_id, week_start, metric, target, title)
  values (u, sunday, 'focus_minutes', 180, 'Three hours at the desk');

  insert into public.weekly_reviews
    (user_id, week_start, went_well, got_in_the_way, change_next_week, completed_at)
  values (u, sunday - 7,
    'Finished the rough mix.',
    'The studio booking moved twice.',
    'Book two sessions instead of one.',
    now() - interval '5 days');

  insert into public.user_cosmetics (user_id, cosmetic_id, purchased_at, equipped)
  select u, c.id, now() - interval '10 days', true
    from public.cosmetic_definitions c
   where c.key = 'frame_graphite';
end;
$seed$;

-- ---------------------------------------------------------------------------
-- Reconcile the profile totals with the ledger.
--
-- The last thing the seed does, because awards are inserted by three separate
-- blocks above: a per-block update was 50 XP short the moment the achievements
-- block ran after it. The XP trigger keeps the total right on its own from now
-- on; this is here for the rows the seed inserted before it existed, and it
-- calls the same reconcile_xp() an audit would, so the seeded level is the
-- level the curve actually gives.
--
-- Coins are a seeded starting balance, not a derived number: the ledger records
-- XP, and coins come from claiming quests and goals.
-- ---------------------------------------------------------------------------

do $seed$
declare
  u uuid;
begin
  for u in select id from public.profiles loop
    perform public.reconcile_xp(u);
  end loop;
end;
$seed$;

update public.profiles p
   set coins = greatest(p.coins, (p.xp / 40)::integer);

reset momentum.trusted;
