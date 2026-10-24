-- Run this once in Supabase: SQL Editor > New query > paste > Run.

-- Every reader's library, notes and folders are stored as small JSON documents,
-- addressed by a path such as "paper_abc", "paper_abc/highlights/h1" or "folder_x".
create table if not exists public.docs (
  user_id uuid not null references auth.users (id) on delete cascade,
  path text not null,
  parent text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, path)
);
create index if not exists docs_parent_idx on public.docs (user_id, parent);

alter table public.docs enable row level security;

drop policy if exists "own docs" on public.docs;
create policy "own docs" on public.docs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Original PDFs live in a private storage bucket, one folder per user.
insert into storage.buckets (id, name, public, file_size_limit)
values ('pdfs', 'pdfs', false, 52428800)
on conflict (id) do nothing;

drop policy if exists "own pdfs read" on storage.objects;
create policy "own pdfs read" on storage.objects for select
  using (bucket_id = 'pdfs' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "own pdfs write" on storage.objects;
create policy "own pdfs write" on storage.objects for insert
  with check (bucket_id = 'pdfs' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "own pdfs delete" on storage.objects;
create policy "own pdfs delete" on storage.objects for delete
  using (bucket_id = 'pdfs' and (storage.foldername(name))[1] = auth.uid()::text);
