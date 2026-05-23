import { supabase } from "@/integrations/supabase/client";

export type LogAction =
  | "task.created"
  | "task.deleted"
  | "task.status_changed"
  | "task.priority_changed"
  | "task.assignee_changed"
  | "task.updated"
  | "attachment.uploaded"
  | "attachment.deleted"
  | "comment.posted"
  | "user.created"
  | "user.updated"
  | "user.deleted"
  | "department.created"
  | "department.deleted";

export type LogEntityType =
  | "task"
  | "attachment"
  | "comment"
  | "user"
  | "department";

export interface LogEntry {
  actorId: string;
  actorName?: string | null;
  action: LogAction;
  entityType: LogEntityType;
  entityId?: string | null;
  entityName?: string | null;
  meta?: Record<string, unknown>;
}

/**
 * Fire-and-forget activity logger.
 * Errors are swallowed — logging must never break the app.
 */
export function logActivity(entry: LogEntry): void {
  supabase
    .from("activity_logs" as any)
    .insert({
      actor_id:    entry.actorId,
      actor_name:  entry.actorName ?? null,
      action:      entry.action,
      entity_type: entry.entityType,
      entity_id:   entry.entityId ?? null,
      entity_name: entry.entityName ?? null,
      meta:        entry.meta ?? {},
    })
    .then(({ error }) => {
      if (error && import.meta.env.DEV) {
        console.warn("[activity-log]", error.message);
      }
    });
}
