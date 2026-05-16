import type { Database } from "@/integrations/supabase/types";
import { useI18n, type DictKey } from "@/hooks/use-i18n";

export type TaskStatus = Database["public"]["Enums"]["task_status"];
export type TaskPriority = Database["public"]["Enums"]["task_priority"];

export const STATUS_ORDER: TaskStatus[] = ["not_started", "working", "stuck", "done"];

export const STATUS_BG: Record<TaskStatus, string> = {
  not_started: "bg-status-notstarted",
  working: "bg-status-working",
  stuck: "bg-status-stuck",
  done: "bg-status-done",
};

export const PRIORITY_BG: Record<TaskPriority, string> = {
  low: "bg-priority-low",
  medium: "bg-priority-medium",
  high: "bg-priority-high",
  critical: "bg-priority-critical",
};

// English fallbacks (used when not inside a component / i18n context)
export const STATUS_LABEL: Record<TaskStatus, string> = {
  not_started: "Not started",
  working: "Working on it",
  stuck: "Stuck",
  done: "Done",
};

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: "Low", medium: "Medium", high: "High", critical: "Critical",
};

const STATUS_KEY: Record<TaskStatus, DictKey> = {
  not_started: "not_started",
  working: "working",
  stuck: "stuck",
  done: "done",
};

const PRIORITY_KEY: Record<TaskPriority, DictKey> = {
  low: "low", medium: "medium", high: "high", critical: "critical",
};

export function useStatusLabel() {
  const { t } = useI18n();
  return (s: TaskStatus) => t(STATUS_KEY[s]);
}

export function usePriorityLabel() {
  const { t } = useI18n();
  return (p: TaskPriority) => t(PRIORITY_KEY[p]);
}

export function StatusPill({ status }: { status: TaskStatus }) {
  const label = useStatusLabel();
  return (
    <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded text-xs font-medium text-white ${STATUS_BG[status]}`}>
      {label(status)}
    </span>
  );
}

export function PriorityPill({ priority }: { priority: TaskPriority }) {
  const label = usePriorityLabel();
  return (
    <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-medium text-white ${PRIORITY_BG[priority]}`}>
      {label(priority)}
    </span>
  );
}
