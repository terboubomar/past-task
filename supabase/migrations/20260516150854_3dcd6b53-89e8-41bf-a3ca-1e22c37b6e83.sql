
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_assignee_id_fkey;
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_created_by_fkey;
ALTER TABLE public.task_comments DROP CONSTRAINT IF EXISTS task_comments_author_id_fkey;
