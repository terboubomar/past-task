
ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_assignee_profile_fkey
  FOREIGN KEY (assignee_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.task_comments
  ADD CONSTRAINT task_comments_author_profile_fkey
  FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
