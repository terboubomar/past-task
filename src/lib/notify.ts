import { supabase } from "@/integrations/supabase/client";

export type NotifType =
  | "task.assigned"
  | "comment.posted"
  | "mention";

export interface NotifEntry {
  userId: string;      // recipient
  actorId: string;     // who triggered it
  actorName: string;
  type: NotifType;
  taskId?: string | null;
  taskTitle?: string | null;
  message: string;
}

/**
 * Fire-and-forget notification creator.
 * Never throws — errors are swallowed (logged in DEV).
 */
export function createNotification(entry: NotifEntry): void {
  // Never notify yourself
  if (entry.userId === entry.actorId) return;

  (supabase as any)
    .from("notifications")
    .insert({
      user_id:    entry.userId,
      actor_id:   entry.actorId,
      actor_name: entry.actorName,
      type:       entry.type,
      task_id:    entry.taskId    ?? null,
      task_title: entry.taskTitle ?? null,
      message:    entry.message,
      read:       false,
    })
    .then(({ error }: any) => {
      if (error && import.meta.env.DEV) console.warn("[notify]", error.message);
    });
}

/**
 * Parse @mentions from comment text and return matching member ids.
 * Matches @firstname or @fullnamewithoutspaces (case-insensitive).
 */
export function parseMentions(text: string, members: { id: string; full_name?: string | null; email?: string | null }[]): string[] {
  const tokens = [...text.matchAll(/@(\w+)/g)].map(m => m[1].toLowerCase());
  if (tokens.length === 0) return [];
  const ids: string[] = [];
  for (const m of members) {
    const name      = (m.full_name ?? "").toLowerCase();
    const firstName = name.split(" ")[0];
    const slug      = name.replace(/\s+/g, "");
    const email     = (m.email ?? "").toLowerCase().split("@")[0];
    if (tokens.some(t => t === firstName || t === slug || t === email)) {
      ids.push(m.id);
    }
  }
  return ids;
}
