import type { Database } from "@/integrations/supabase/types";

export type TaskStatus = Database["public"]["Enums"]["task_status"];
export type TaskPriority = Database["public"]["Enums"]["task_priority"];

export const STATUS_LABEL: Record<TaskStatus, string> = {
  not_started: "Not started",
  working: "Working on it",
  stuck: "Stuck",
  done: "Done",
};

export const STATUS_ORDER: TaskStatus[] = ["not_started", "working", "stuck", "done"];

export const STATUS_BG: Record<TaskStatus, string> = {
  not_started: "bg-status-notstarted",
  working: "bg-status-working",
  stuck: "bg-status-stuck",
  done: "bg-status-done",
};

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: "Low", medium: "Medium", high: "High", critical: "Critical",
};

export const PRIORITY_BG: Record<TaskPriority, string> = {
  low: "bg-priority-low",
  medium: "bg-priority-medium",
  high: "bg-priority-high",
  critical: "bg-priority-critical",
};

export function StatusPill({ status }: { status: TaskStatus }) {
  return (
    <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded text-xs font-medium text-white ${STATUS_BG[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function PriorityPill({ priority }: { priority: TaskPriority }) {
  return (
    <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-medium text-white ${PRIORITY_BG[priority]}`}>
      {PRIORITY_LABEL[priority]}
    </span>
  );
}
