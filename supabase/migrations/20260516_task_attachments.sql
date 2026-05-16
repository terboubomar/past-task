-- Task attachments table
create table if not exists public.task_attachments (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references public.tasks(id) on delete cascade,
  uploaded_by  uuid not null references public.profiles(id) on delete cascade,
  file_name    text not null,
  file_size    bigint not null,
  mime_type    text not null,
  storage_path text not null,
  created_at   timestamptz not null default now()
);

alter table public.task_attachments enable row level security;

-- Authenticated users can view attachments for tasks they can access
create policy "authenticated can view attachments"
  on public.task_attachments for select
  to authenticated using (true);

-- Authenticated users can insert their own attachments
create policy "authenticated can insert attachments"
  on public.task_attachments for insert
  to authenticated with check (uploaded_by = auth.uid());

-- Admins or uploader can delete
create policy "uploader can delete attachments"
  on public.task_attachments for delete
  to authenticated using (uploaded_by = auth.uid());

-- Storage bucket (run this manually in Supabase dashboard or via CLI)
-- insert into storage.buckets (id, name, public) values ('task-attachments', 'task-attachments', false);

-- Storage policies for task-attachments bucket
-- create policy "authenticated read" on storage.objects for select to authenticated using (bucket_id = 'task-attachments');
-- create policy "authenticated upload" on storage.objects for insert to authenticated with check (bucket_id = 'task-attachments');
-- create policy "uploader delete" on storage.objects for delete to authenticated using (bucket_id = 'task-attachments' and owner = auth.uid()::text);
