import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/hooks/use-i18n";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  STATUS_ORDER, STATUS_BG, PriorityPill, StatusPill, useStatusLabel,
} from "@/components/task-pills";
import type { TaskStatus } from "@/components/task-pills";
import { cn } from "@/lib/utils";
import {
  AlertTriangle, CheckCircle2, Clock, Layers,
  User, CalendarClock, ArrowRight, TrendingUp,
  ListTodo, Users, Building2,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function isOverdue(due: string | null, status: TaskStatus) {
  if (!due || status === "done") return false;
  return new Date(due) < new Date(new Date().toDateString());
}

function DashboardPage() {
  const { user, isAdmin } = useAuth();
  const { t } = useI18n();
  const statusLabel = useStatusLabel();

  const { data: tasks } = useQuery({
    queryKey: ["tasks", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*, assignee:profiles!tasks_assignee_profile_fkey(id,full_name), department:departments(name), project:projects(id,name,color)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: members } = useQuery({
    queryKey: ["members"],
    queryFn: async () => (await supabase.from("profiles").select("id,full_name,email")).data ?? [],
    enabled: isAdmin,
  });

  const { data: projects } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => (await supabase.from("projects").select("id,name,color")).data ?? [],
    enabled: isAdmin,
  });

  const all = tasks ?? [];
  const myTasks = all.filter((tk) => tk.assignee_id === user?.id);

  // KPI counts
  const counts = STATUS_ORDER.reduce((acc, s) => {
    acc[s] = all.filter((tk) => tk.status === s).length;
    return acc;
  }, {} as Record<TaskStatus, number>);

  const overdueTasks = all.filter((tk) => isOverdue(tk.due_date, tk.status as TaskStatus));
  const myOverdue = myTasks.filter((tk) => isOverdue(tk.due_date, tk.status as TaskStatus));
  const donePct = all.length > 0 ? Math.round((counts.done / all.length) * 100) : 0;

  // Recent tasks (last 5 created)
  const recentTasks = all.slice(0, 5);

  // Due today
  const today = new Date().toISOString().split("T")[0];
  const dueToday = all.filter((tk) => tk.due_date === today && tk.status !== "done");

  // Per-member breakdown (admin only)
  const memberStats = (members ?? []).map((m: any) => {
    const mt = all.filter((tk) => tk.assignee_id === m.id);
    return {
      ...m,
      total: mt.length,
      done: mt.filter((tk) => tk.status === "done").length,
      stuck: mt.filter((tk) => tk.status === "stuck").length,
      overdue: mt.filter((tk) => isOverdue(tk.due_date, tk.status as TaskStatus)).length,
    };
  }).filter((m: any) => m.total > 0).sort((a: any, b: any) => b.total - a.total);

  // Per-project breakdown (admin only)
  const projectStats = (projects ?? []).map((p: any) => {
    const pt = all.filter((tk) => tk.project_id === p.id);
    return {
      ...p,
      total: pt.length,
      done: pt.filter((tk) => tk.status === "done").length,
      stuck: pt.filter((tk) => tk.status === "stuck").length,
    };
  }).filter((p: any) => p.total > 0).sort((a: any, b: any) => b.total - a.total);

  return (
    <div className="p-4 md:p-6 max-w-7xl space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-xl md:text-2xl font-semibold tracking-tight">{t("dashboard")}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {isAdmin ? t("dashboard_sub_admin") : t("dashboard_sub_member")}
        </p>
      </div>

      {/* ── OVERDUE ALERT BANNER ── */}
      {(isAdmin ? overdueTasks : myOverdue).length > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          <AlertTriangle className="size-4 shrink-0" />
          <span className="font-medium">
            {(isAdmin ? overdueTasks : myOverdue).length} overdue task{(isAdmin ? overdueTasks : myOverdue).length > 1 ? "s" : ""}
          </span>
          <span className="text-destructive/70 hidden sm:inline">— action needed</span>
          <Link to="/tasks" className="ms-auto flex items-center gap-1 text-xs font-medium hover:underline shrink-0">
            View <ArrowRight className="size-3" />
          </Link>
        </div>
      )}

      {/* ── KPI CARDS ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard
          icon={<Layers className="size-4" />}
          label="Total Tasks"
          value={all.length}
          sub={`${donePct}% complete`}
          color="text-foreground"
        />
        <KpiCard
          icon={<Clock className="size-4 text-blue-500" />}
          label={statusLabel("working")}
          value={counts.working ?? 0}
          sub={`${counts.not_started ?? 0} not started`}
          color="text-blue-600"
        />
        <KpiCard
          icon={<AlertTriangle className="size-4 text-red-500" />}
          label="Stuck / Overdue"
          value={(counts.stuck ?? 0) + overdueTasks.length}
          sub={`${counts.stuck} stuck · ${overdueTasks.length} overdue`}
          color="text-red-600"
        />
        <KpiCard
          icon={<CheckCircle2 className="size-4 text-green-500" />}
          label={statusLabel("done")}
          value={counts.done ?? 0}
          sub={`out of ${all.length} total`}
          color="text-green-600"
        />
      </div>

      {/* ── STATUS BREAKDOWN ── */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Status Breakdown</span>
          <span className="ms-auto text-xs text-muted-foreground">{all.length} tasks total</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {STATUS_ORDER.map((s) => {
            const count = counts[s] ?? 0;
            const pct = all.length > 0 ? Math.round((count / all.length) * 100) : 0;
            return (
              <div key={s} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <span className={`size-2 rounded-full ${STATUS_BG[s]}`} />
                    {statusLabel(s)}
                  </span>
                  <span className="font-semibold text-foreground">{count}</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${STATUS_BG[s]}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground">{pct}%</span>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* ── MY TASKS ── */}
        <Card className="p-0 overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center gap-2">
            <User className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">{t("my_tasks")}</span>
            <Badge variant="secondary" className="ms-auto text-xs">{myTasks.length}</Badge>
          </div>
          {myTasks.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">{t("no_tasks_assigned")}</div>
          ) : (
            <div className="divide-y max-h-72 overflow-y-auto">
              {myTasks.map((tk) => (
                <div key={tk.id} className="px-4 py-2.5 flex items-center gap-3 hover:bg-muted/40 transition-colors">
                  <span className={`size-2 rounded-full shrink-0 ${STATUS_BG[tk.status as TaskStatus]}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate flex items-center gap-1.5">
                      {tk.title}
                      {isOverdue(tk.due_date, tk.status as TaskStatus) && (
                        <CalendarClock className="size-3 text-destructive shrink-0" />
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">{tk.project?.name ?? "—"}</div>
                  </div>
                  <PriorityPill priority={tk.priority} />
                  <span className={cn("text-xs shrink-0", isOverdue(tk.due_date, tk.status as TaskStatus) ? "text-destructive font-medium" : "text-muted-foreground")}>
                    {tk.due_date ?? "—"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* ── DUE TODAY ── */}
        <Card className="p-0 overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center gap-2">
            <CalendarClock className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">Due Today</span>
            <Badge variant={dueToday.length > 0 ? "destructive" : "secondary"} className="ms-auto text-xs">
              {dueToday.length}
            </Badge>
          </div>
          {dueToday.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">Nothing due today 🎉</div>
          ) : (
            <div className="divide-y max-h-72 overflow-y-auto">
              {dueToday.map((tk) => (
                <div key={tk.id} className="px-4 py-2.5 flex items-center gap-3 hover:bg-muted/40 transition-colors">
                  <span className={`size-2 rounded-full shrink-0 ${STATUS_BG[tk.status as TaskStatus]}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{tk.title}</div>
                    <div className="text-xs text-muted-foreground">{tk.assignee?.full_name ?? t("unassigned")}</div>
                  </div>
                  <StatusPill status={tk.status as TaskStatus} />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* ── RECENT ACTIVITY (admin) ── */}
      {isAdmin && (
        <Card className="p-0 overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center gap-2">
            <ListTodo className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">Recently Added</span>
          </div>
          <div className="divide-y">
            {recentTasks.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">{t("empty")}</div>
            )}
            {recentTasks.map((tk) => (
              <div key={tk.id} className="px-4 py-2.5 flex items-center gap-3 hover:bg-muted/40 transition-colors">
                <span className={`size-2 rounded-full shrink-0 ${STATUS_BG[tk.status as TaskStatus]}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{tk.title}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                    <span>{tk.assignee?.full_name ?? t("unassigned")}</span>
                    {tk.project && (
                      <span className="flex items-center gap-1">
                        · <span className="size-1.5 rounded-full inline-block" style={{ backgroundColor: tk.project.color }} />
                        {tk.project.name}
                      </span>
                    )}
                  </div>
                </div>
                <PriorityPill priority={tk.priority} />
                <StatusPill status={tk.status as TaskStatus} />
                <span className="text-xs text-muted-foreground hidden sm:block w-20 text-end">
                  {tk.due_date ?? "—"}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {isAdmin && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* ── TEAM BREAKDOWN ── */}
          <Card className="p-0 overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center gap-2">
              <Users className="size-4 text-muted-foreground" />
              <span className="text-sm font-medium">Team Workload</span>
            </div>
            {memberStats.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">No assignments yet</div>
            ) : (
              <div className="divide-y max-h-72 overflow-y-auto">
                {memberStats.map((m: any) => (
                  <div key={m.id} className="px-4 py-2.5 flex items-center gap-3 hover:bg-muted/40 transition-colors">
                    <div className="size-7 rounded-full bg-muted flex items-center justify-center text-xs font-semibold shrink-0">
                      {(m.full_name ?? m.email ?? "?")[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{m.full_name ?? m.email}</div>
                      <div className="text-xs text-muted-foreground">{m.done}/{m.total} done</div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {m.stuck > 0 && (
                        <span className="text-[10px] bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400 px-1.5 py-0.5 rounded font-medium">
                          {m.stuck} stuck
                        </span>
                      )}
                      {m.overdue > 0 && (
                        <span className="text-[10px] bg-orange-100 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400 px-1.5 py-0.5 rounded font-medium">
                          {m.overdue} late
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground w-14 text-end">{m.total} task{m.total !== 1 ? "s" : ""}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* ── PROJECT BREAKDOWN ── */}
          <Card className="p-0 overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center gap-2">
              <Building2 className="size-4 text-muted-foreground" />
              <span className="text-sm font-medium">Projects</span>
            </div>
            {projectStats.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">No projects with tasks</div>
            ) : (
              <div className="divide-y max-h-72 overflow-y-auto">
                {projectStats.map((p: any) => {
                  const pct = p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
                  return (
                    <div key={p.id} className="px-4 py-2.5 hover:bg-muted/40 transition-colors">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                        <span className="text-sm font-medium flex-1 truncate">{p.name}</span>
                        {p.stuck > 0 && (
                          <span className="text-[10px] bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400 px-1.5 py-0.5 rounded font-medium">
                            {p.stuck} stuck
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground shrink-0">{p.done}/{p.total}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all bg-green-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

        </div>
      )}
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: number; sub: string; color: string;
}) {
  return (
    <Card className="p-4">
      <div className={cn("flex items-center gap-1.5 text-xs text-muted-foreground mb-2", color)}>
        {icon}
        <span>{label}</span>
      </div>
      <div className={cn("text-3xl font-bold", color)}>{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{sub}</div>
    </Card>
  );
}
