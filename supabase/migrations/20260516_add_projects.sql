-- Projects table
create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  color       text not null default '#6366f1',
  department_id uuid references public.departments(id) on delete set null,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

alter table public.projects enable row level security;

-- Everyone authenticated can read projects
create policy "projects_read" on public.projects
  for select using (auth.role() = 'authenticated');

-- Only admins/ceo/super_admin can insert/update/delete
create policy "projects_write" on public.projects
  for all using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid()
        and role in ('admin','ceo','super_admin')
    )
  );

-- Add project_id to tasks
alter table public.tasks
  add column if not exists project_id uuid references public.projects(id) on delete set null;
