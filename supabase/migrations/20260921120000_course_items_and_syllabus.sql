-- Momentum — course checklist items and the syllabus file.
--
-- A course week's material becomes a checklist: readings, links and
-- exercises, each ticked off on its own, and each optionally planned for one
-- day of that week so Today can show it. Items are notes-level: ticking one
-- writes `completed_at` and nothing else — no XP, no ledger — because they
-- are not the unit of work Momentum rewards (a task is; an assignment is a
-- task). The week's free text stays as `course_weeks.materials` for what is
-- not a list.
--
-- A syllabus can also be a PDF. The file lives in the private `syllabi`
-- bucket under `<user id>/<course id>/<file id>.pdf`, and the course row
-- records the object path and the name the user uploaded it under. The
-- typed syllabus text stays beside it.

create type public.course_item_kind as enum ('reading', 'link', 'exercise');

create table public.course_items (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  course_id     uuid not null references public.courses (id) on delete cascade,
  week_number   integer not null,
  kind          public.course_item_kind not null default 'reading',
  title         text not null,
  url           text,
  -- The day of that week the item is planned for; null means any day. The
  -- application keeps it inside the week; the database keeps it a date.
  planned_on    date,
  completed_at  timestamptz,
  sort_order    double precision not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint course_items_week_chk  check (week_number between 1 and 53),
  constraint course_items_title_chk check (length(title) between 1 and 300),
  constraint course_items_url_chk   check (url is null or length(url) between 1 and 2000)
);

comment on table public.course_items is
  'One reading, link or exercise of a course week. Ticking one records completed_at only; no XP.';
comment on column public.course_items.planned_on is
  'The day inside the week the item is planned for, or null for any day. Today lists items planned for it.';

create index course_items_course_idx on public.course_items (course_id, week_number, sort_order);
-- Today reads "what is planned for this date" across every course.
create index course_items_planned_idx on public.course_items (user_id, planned_on);

create trigger course_items_set_updated_at
  before update on public.course_items
  for each row execute function public.set_updated_at();

create trigger course_items_freeze_created_at
  before insert or update on public.course_items
  for each row execute function public.freeze_created_at();

create trigger course_items_same_owner
  before insert or update on public.course_items
  for each row execute function public.assert_same_owner('course_id', 'courses');

alter table public.course_items enable row level security;

create policy "course_items: select own"
  on public.course_items for select to authenticated
  using (user_id = (select auth.uid()));

create policy "course_items: insert own"
  on public.course_items for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "course_items: update own"
  on public.course_items for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "course_items: delete own"
  on public.course_items for delete to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.course_items to authenticated;

-- ---- The syllabus file -----------------------------------------------------

alter table public.courses
  add column syllabus_path      text,
  add column syllabus_file_name text,
  add constraint courses_syllabus_file_chk check (
    (syllabus_path is null) = (syllabus_file_name is null)
    and (syllabus_file_name is null or length(syllabus_file_name) between 1 and 255)
  );

comment on column public.courses.syllabus_path is
  'Object path in the syllabi bucket: <user id>/<course id>/<file id>.pdf. Null when no file was uploaded.';

-- A private bucket: nothing in it is reachable without a signed URL minted
-- for the owner. PDF only, ten megabytes at most. `on conflict` so the
-- migration is safe to run against a project where the bucket was made by hand.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('syllabi', 'syllabi', false, 10485760, array['application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Each user owns the folder named after their id, and nothing outside it.
create policy "syllabi: read own"
  on storage.objects for select to authenticated
  using (bucket_id = 'syllabi' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "syllabi: upload own"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'syllabi' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "syllabi: replace own"
  on storage.objects for update to authenticated
  using (bucket_id = 'syllabi' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'syllabi' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "syllabi: delete own"
  on storage.objects for delete to authenticated
  using (bucket_id = 'syllabi' and (storage.foldername(name))[1] = (select auth.uid())::text);
