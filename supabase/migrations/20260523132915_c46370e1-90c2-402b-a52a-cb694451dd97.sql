
CREATE TABLE public.task_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL CONSTRAINT task_attachments_uploaded_by_fkey REFERENCES public.profiles(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_size bigint NOT NULL,
  mime_type text,
  storage_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.task_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read attachments" ON public.task_attachments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth insert attachments" ON public.task_attachments
  FOR INSERT TO authenticated WITH CHECK (uploaded_by = auth.uid());

CREATE POLICY "uploader or admin delete attachment" ON public.task_attachments
  FOR DELETE TO authenticated
  USING (uploaded_by = auth.uid() OR public.is_admin_or_ceo(auth.uid()));

INSERT INTO storage.buckets (id, name, public)
  VALUES ('task-attachments', 'task-attachments', false)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "auth read task-attachments files" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'task-attachments');

CREATE POLICY "auth upload task-attachments files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'task-attachments');

CREATE POLICY "auth delete task-attachments files" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'task-attachments');
