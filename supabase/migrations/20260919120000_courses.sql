-- Momentum — courses.
--
-- A course is a project with a term: the project already holds the name, the
-- colour and the tasks (a course's assignments are its project's tasks, and
-- an assignment competes for the week like any other task). This table adds
-- what a project does not have — a code, an instructor, a syllabus and the
-- term the course runs over — and `course_weeks` holds what the user writes
-- against each week of that term: a topic and the material to cover.
--
-- Weeks are not rows until written to. Week N of a course is the seven days
-- from `term_start + 7 * (N - 1)`; the application derives the list from the
-- term and reads a row for it when one exists. Assignments are never stored
-- here: a week's assignments are the project's tasks due inside it.
--
-- Deleting a course deletes its weeks and nothing else; the project and its
-- tasks stay. Deleting the project deletes the course (there is nothing for a
-- course to be without one).

create table public.courses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  project_id  uuid not null references public.projects (id) on delete cascade,
  code        text,
  instructor  text,
  location    text,
  syllabus    text,
  term_start  date not null,
  term_end    date not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint courses_project_uniq unique (project_id),
  constraint courses_code_chk       check (code is null or length(code) between 1 and 20),
  constraint courses_instructor_chk check (instructor is null or length(instructor) between 1 and 100),
  constraint courses_location_chk   check (location is null or length(location) between 1 and 100),
  constraint courses_syllabus_chk   check (syllabus is null or length(syllabus) <= 20000),
  -- A term is at least its first day and at most a year: 53 weeks is the most
  -- `course_weeks.week_number` can name.
  constraint courses_term_chk       check (term_end >= term_start and term_end - term_start < 366)
);

comment on table public.courses is
  'A project with a term. Assignments are the project''s tasks; weeks are derived from the term.';
comment on column public.courses.code is 'How the institution names it: "CHEM 101".';
comment on column public.courses.term_start is 'Week 1 begins here; every week is seven days from it.';

create index courses_user_idx on public.courses (user_id, term_start);

create trigger courses_set_updated_at
  before update on public.courses
  for each row execute function public.set_updated_at();

create trigger courses_freeze_created_at
  before insert or update on public.courses
  for each row execute function public.freeze_created_at();

-- The project must belong to the same user; a course cannot borrow another account's project.
create trigger courses_same_owner
  before insert or update on public.courses
  for each row execute function public.assert_same_owner('project_id', 'projects');

alter table public.courses enable row level security;

create policy "courses: select own"
  on public.courses for select to authenticated
  using (user_id = (select auth.uid()));

create policy "courses: insert own"
  on public.courses for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "courses: update own"
  on public.courses for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "courses: delete own"
  on public.courses for delete to authenticated
  using (user_id = (select auth.uid()));

-- What the user wrote against one week of a course. One row per week at most;
-- a week with nothing written has no row.
create table public.course_weeks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  course_id    uuid not null references public.courses (id) on delete cascade,
  week_number  integer not null,
  topic        text,
  materials    text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint course_weeks_uniq          unique (course_id, week_number),
  constraint course_weeks_number_chk    check (week_number between 1 and 53),
  constraint course_weeks_topic_chk     check (topic is null or length(topic) between 1 and 200),
  constraint course_weeks_materials_chk check (materials is null or length(materials) <= 5000)
);

comment on table public.course_weeks is
  'Topic and material for week N of a course. Week N is the seven days from term_start + 7 * (N - 1).';

create trigger course_weeks_set_updated_at
  before update on public.course_weeks
  for each row execute function public.set_updated_at();

create trigger course_weeks_freeze_created_at
  before insert or update on public.course_weeks
  for each row execute function public.freeze_created_at();

create trigger course_weeks_same_owner
  before insert or update on public.course_weeks
  for each row execute function public.assert_same_owner('course_id', 'courses');

alter table public.course_weeks enable row level security;

create policy "course_weeks: select own"
  on public.course_weeks for select to authenticated
  using (user_id = (select auth.uid()));

create policy "course_weeks: insert own"
  on public.course_weeks for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "course_weeks: update own"
  on public.course_weeks for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "course_weeks: delete own"
  on public.course_weeks for delete to authenticated
  using (user_id = (select auth.uid()));

-- The column-and-verb gate in front of RLS (`20260906121200_grants.sql`):
-- default privileges were revoked for every future table, so each new one is
-- granted by name. Both tables are plain user-owned rows.
grant select, insert, update, delete on public.courses      to authenticated;
grant select, insert, update, delete on public.course_weeks to authenticated;
