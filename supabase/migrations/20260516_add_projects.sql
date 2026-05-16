-- ============================================================
-- Projects table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.projects (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  description   text,
  color         text NOT NULL DEFAULT '#6366f1',
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  created_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read projects
CREATE POLICY "projects_read" ON public.projects
  FOR SELECT USING (auth.role() = 'authenticated');

-- Admins / CEOs / super_admins can insert
CREATE POLICY "projects_insert" ON public.projects
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'ceo', 'super_admin')
    )
  );

-- Admins / CEOs / super_admins can update
CREATE POLICY "projects_update" ON public.projects
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'ceo', 'super_admin')
    )
  );

-- Admins / CEOs / super_admins can delete
CREATE POLICY "projects_delete" ON public.projects
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'ceo', 'super_admin')
    )
  );

-- ============================================================
-- Add project_id to tasks
-- ============================================================
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS tasks_project_id_idx ON public.tasks(project_id);
