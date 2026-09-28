-- Momentum — course files.
--
-- A course can hold several PDFs beside its syllabus: the textbooks, a
-- problem set collection, lecture notes. Each is one row here and one object
-- in the private `syllabi` bucket under the same owner folder the syllabus
-- uses, `<user id>/<course id>/<file id>.pdf` — the path is fixed by the ids,
-- so the storage policies that already confine an account to its own folder
-- cover these objects too, and a row can never name another course's file.
--
-- A file is uploaded, opened and removed; it is never edited, so there is no
-- update grant. Deleting the course deletes its rows; the application removes
-- the objects.
--
-- Textbooks are larger than syllabi, so the bucket's limit rises from 10 MB
-- to 50 MB — the most a hosted project accepts per object on the free plan.

create table public.course_files (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  course_id   uuid not null references public.courses (id) on delete cascade,
  path        text not null,
  file_name   text not null,
  size_bytes  bigint not null,
  sort_order  double precision not null default 0,
  created_at  timestamptz not null default now(),

  constraint course_files_path_uniq unique (path),
  constraint course_files_path_chk
    check (path = user_id::text || '/' || course_id::text || '/' || id::text || '.pdf'),
  constraint course_files_name_chk check (length(file_name) between 1 and 255),
  constraint course_files_size_chk check (size_bytes between 1 and 52428800)
);

comment on table public.course_files is
  'A PDF attached to a course (a textbook, notes). The object lives in the syllabi bucket at path.';
comment on column public.course_files.path is
  'Object path in the syllabi bucket: <user id>/<course id>/<id>.pdf, enforced by course_files_path_chk.';

create index course_files_course_idx on public.course_files (course_id, sort_order);

create trigger course_files_freeze_created_at
  before insert or update on public.course_files
  for each row execute function public.freeze_created_at();

create trigger course_files_same_owner
  before insert or update on public.course_files
  for each row execute function public.assert_same_owner('course_id', 'courses');

alter table public.course_files enable row level security;

create policy "course_files: select own"
  on public.course_files for select to authenticated
  using (user_id = (select auth.uid()));

create policy "course_files: insert own"
  on public.course_files for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "course_files: delete own"
  on public.course_files for delete to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, delete on public.course_files to authenticated;

-- ---- The bucket ---------------------------------------------------------------

update storage.buckets
   set file_size_limit = 52428800
 where id = 'syllabi';
