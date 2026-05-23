import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import {
  Activity, Plus, Trash2, RefreshCw, Flag, Pencil,
  Upload, MessageSquare, UserPlus, Building2, UserCheck,
  Search, X, Filter,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { LogAction } from "@/lib/activity-log";
import { useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/logs")({
  component: LogsPage,
});

// ─── Types ────────────────────────────────────────────────────────────────────

interface ActivityLog {
  id: string;
  created_at: string;
  actor_id: string | null;
  actor_name: string | null;
  action: LogAction;
  entity_type: string;
  entity_id: string | null;
  entity_name: string | null;
  meta: Record<string, unknown>;
}

// ─── Action metadata ──────────────────────────────────────────────────────────

const ACTION_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  "task.created":           { label: "Task created",     icon: <Plus className="size-3.5" />,          color: "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400" },
  "task.deleted":           { label: "Task deleted",     icon: <Trash2 className="size-3.5" />,        color: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400" },
  "task.status_changed":    { label: "Status changed",   icon: <RefreshCw className="size-3.5" />,     color: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400" },
  "task.priority_changed":  { label: "Priority changed", icon: <Flag className="size-3.5" />,          color: "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400" },
  "task.assignee_changed":  { label: "Assignee changed", icon: <UserCheck className="size-3.5" />,     color: "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400" },
  "task.updated":           { label: "Task updated",     icon: <Pencil className="size-3.5" />,        color: "bg-muted text-muted-foreground" },
  "attachment.uploaded":    { label: "File uploaded",    icon: <Upload className="size-3.5" />,        color: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400" },
  "attachment.deleted":     { label: "File deleted",     icon: <Trash2 className="size-3.5" />,        color: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400" },
  "comment.posted":         { label: "Comment posted",   icon: <MessageSquare className="size-3.5" />, color: "bg-muted text-muted-foreground" },
  "user.created":           { label: "User created",     icon: <UserPlus className="size-3.5" />,      color: "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400" },
  "user.updated":           { label: "User updated",     icon: <Pencil className="size-3.5" />,        color: "bg-muted text-muted-foreground" },
  "user.deleted":           { label: "User deleted",     icon: <Trash2 className="size-3.5" />,        color: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400" },
  "department.created":     { label: "Dept created",     icon: <Building2 className="size-3.5" />,     color: "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400" },
  "department.deleted":     { label: "Dept deleted",     icon: <Trash2 className="size-3.5" />,        color: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400" },
};

const ACTION_GROUPS: { label: string; actions: LogAction[] }[] = [
  { label: "Tasks",       actions: ["task.created", "task.deleted", "task.status_changed", "task.priority_changed", "task.assignee_changed", "task.updated"] },
  { label: "Files",       actions: ["attachment.uploaded", "attachment.deleted"] },
  { label: "Comments",    actions: ["comment.posted"] },
  { label: "Users",       actions: ["user.created", "user.updated", "user.deleted"] },
  { label: "Departments", actions: ["department.created", "department.deleted"] },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function describeLog(log: ActivityLog): React.ReactNode {
  const name   = <span className="font-semibold text-foreground">{log.actor_name ?? "Someone"}</span>;
  const entity = log.entity_name
    ? <span className="font-medium text-foreground">"{log.entity_name}"</span>
    : null;

  switch (log.action) {
    case "task.created":
      return <>{name} created task {entity}</>;
    case "task.deleted":
      return <>{name} deleted task {entity}</>;
    case "task.status_changed":
      return <>{name} changed {entity ?? "a task"} status to{" "}
        <span className="font-medium text-foreground">{String(log.meta?.to ?? "")}</span></>;
    case "task.priority_changed":
      return <>{name} changed {entity ?? "a task"} priority to{" "}
        <span className="font-medium text-foreground">{String(log.meta?.to ?? "")}</span></>;
    case "task.assignee_changed":
      return <>{name} assigned {entity ?? "a task"} to{" "}
        <span className="font-medium text-foreground">{String(log.meta?.to ?? "Unassigned")}</span></>;
    case "task.updated":
      return <>{name} updated task {entity}</>;
    case "attachment.uploaded":
      return <>{name} uploaded{" "}
        <span className="font-medium text-foreground">"{String(log.meta?.file ?? "a file")}"</span>
        {log.meta?.task ? <> on {<span className="font-medium text-foreground">"{String(log.meta.task)}"</span>}</> : null}
      </>;
    case "attachment.deleted":
      return <>{name} deleted{" "}
        <span className="font-medium text-foreground">"{String(log.meta?.file ?? "a file")}"</span>
        {log.meta?.task ? <> from {<span className="font-medium text-foreground">"{String(log.meta.task)}"</span>}</> : null}
      </>;
    case "comment.posted":
      return <>{name} commented on task {entity}</>;
    case "user.created":
      return <>{name} created user {entity}</>;
    case "user.updated":
      return <>{name} updated user {entity}</>;
    case "user.deleted":
      return <>{name} deleted user {entity}</>;
    case "department.created":
      return <>{name} created department {entity}</>;
    case "department.deleted":
      return <>{name} deleted department {entity}</>;
    default:
      return <>{name} performed {log.action}</>;
  }
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins < 1)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

function dayKey(dateStr: string): string {
  const d = new Date(dateStr);
  const today     = new Date();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);

  if (d.toDateString() === today.toDateString())     return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function LogsPage() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();

  const [search, setSearch]           = useState("");
  const [filterAction, setFilterAction] = useState("all");
  const [filterActor, setFilterActor]   = useState("all");

  // Redirect non-admins
  if (!isAdmin) {
    navigate({ to: "/dashboard" });
    return null;
  }

  const { data: logs, isLoading } = useQuery({
    queryKey: ["activity_logs"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("activity_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as ActivityLog[];
    },
    refetchInterval: 30_000, // auto-refresh every 30s
  });

  // Unique actors for filter
  const actors = useMemo(() => {
    const seen = new Map<string, string>();
    (logs ?? []).forEach((l) => {
      if (l.actor_id && l.actor_name) seen.set(l.actor_id, l.actor_name);
    });
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [logs]);

  const filtered = useMemo(() => {
    return (logs ?? []).filter((l) => {
      if (filterAction !== "all" && l.action !== filterAction) return false;
      if (filterActor  !== "all" && l.actor_id !== filterActor) return false;
      if (search) {
        const q = search.toLowerCase();
        const matches =
          (l.actor_name ?? "").toLowerCase().includes(q) ||
          (l.entity_name ?? "").toLowerCase().includes(q) ||
          l.action.toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [logs, filterAction, filterActor, search]);

  const hasFilters = search || filterAction !== "all" || filterActor !== "all";

  // Group by day
  const grouped = useMemo(() => {
    const g: { day: string; entries: ActivityLog[] }[] = [];
    filtered.forEach((l) => {
      const day = dayKey(l.created_at);
      const last = g[g.length - 1];
      if (last && last.day === day) last.entries.push(l);
      else g.push({ day, entries: [l] });
    });
    return g;
  }, [filtered]);

  return (
    <div className="p-4 md:p-6 max-w-4xl space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Activity className="size-5 text-muted-foreground" />
            Activity Logs
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Monitor every action taken in the app
          </p>
        </div>
        <Badge variant="secondary" className="text-xs shrink-0">
          {filtered.length} events
        </Badge>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by user, task, action…"
            className="ps-8 h-8 text-sm"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select value={filterAction} onValueChange={setFilterAction}>
            <SelectTrigger className="h-8 text-xs w-40">
              <Filter className="size-3 me-1.5" />
              <SelectValue placeholder="Action type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              {ACTION_GROUPS.map((g) => (
                <div key={g.label}>
                  <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                    {g.label}
                  </div>
                  {g.actions.map((a) => (
                    <SelectItem key={a} value={a}>
                      {ACTION_META[a]?.label ?? a}
                    </SelectItem>
                  ))}
                </div>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterActor} onValueChange={setFilterActor}>
            <SelectTrigger className="h-8 text-xs w-36"><SelectValue placeholder="All users" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All users</SelectItem>
              {actors.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {hasFilters && (
            <Button
              variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground"
              onClick={() => { setSearch(""); setFilterAction("all"); setFilterActor("all"); }}
            >
              <X className="size-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Timeline */}
      {isLoading && (
        <div className="py-16 text-center text-sm text-muted-foreground animate-pulse">
          Loading activity…
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <div className="py-20 text-center text-sm text-muted-foreground">
          <Activity className="size-8 mx-auto mb-3 opacity-30" />
          {hasFilters ? "No events match your filters." : "No activity recorded yet."}
        </div>
      )}

      <div className="space-y-6">
        {grouped.map(({ day, entries }) => (
          <div key={day}>
            {/* Day separator */}
            <div className="flex items-center gap-3 mb-3">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs font-medium text-muted-foreground shrink-0">{day}</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            {/* Entries */}
            <div className="space-y-1">
              {entries.map((log) => {
                const meta = ACTION_META[log.action];
                const initials = (log.actor_name ?? "?")[0].toUpperCase();

                return (
                  <div
                    key={log.id}
                    className="flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/30 transition-colors"
                  >
                    {/* Actor avatar */}
                    <div className="size-7 rounded-full bg-primary/15 flex items-center justify-center text-[11px] font-semibold text-primary shrink-0 mt-0.5">
                      {initials}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-muted-foreground leading-snug">
                        {describeLog(log)}
                      </p>
                      {/* Action badge */}
                      <div className="flex items-center gap-2 mt-1">
                        <span className={cn(
                          "inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded",
                          meta?.color ?? "bg-muted text-muted-foreground"
                        )}>
                          {meta?.icon}
                          {meta?.label ?? log.action}
                        </span>
                        {log.meta && Object.keys(log.meta).length > 0 && log.action === "task.status_changed" && (
                          <span className="text-[10px] text-muted-foreground">
                            → {String(log.meta.to)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Timestamp */}
                    <div className="shrink-0 text-right">
                      <span
                        className="text-xs text-muted-foreground"
                        title={new Date(log.created_at).toLocaleString()}
                      >
                        {timeAgo(log.created_at)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
