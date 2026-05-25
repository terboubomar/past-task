import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/hooks/use-i18n";
import {
  STATUS_ORDER, STATUS_BG, PRIORITY_BG,
  PriorityPill, StatusPill, useStatusLabel, usePriorityLabel,
} from "@/components/task-pills";
import type { TaskStatus, TaskPriority } from "@/components/task-pills";
import { cn } from "@/lib/utils";
import { ArrowRight, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function isOverdue(due: string | null, status: TaskStatus) {
  if (!due || status === "done") return false;
  return new Date(due) < new Date(new Date().toDateString());
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

// ── Sparkline SVG ──────────────────────────────────────────────────────────────
function Sparkline({ values, color = "var(--color-primary)" }: { values: number[]; color?: string }) {
  const w = 100, h = 28, pad = 2;
  const max = Math.max(...values), min = Math.min(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return [x, y];
  });
  const pathD = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const areaD = pathD + ` L ${pts[pts.length - 1][0]} ${h} L ${pts[0][0]} ${h} Z`;
  return (
    <svg className="w-full h-7 mt-2" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <path d={areaD} fill={color} opacity="0.10" />
      <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// ── KPI Tile ─────────────────────────────────────────────────────────────────
function KpiTile({
  label, value, sub, accentColor, spark, urgent, trend,
}: {
  label: string; value: number; sub: string;
  accentColor?: string; spark?: number[]; urgent?: boolean; trend?: boolean;
}) {
  const color = accentColor ?? "var(--color-foreground)";
  return (
    <div className={cn(
      "bg-card rounded-xl border p-4 flex flex-col gap-0.5 relative overflow-hidden",
      urgent && "border-l-2"
    )}
    style={urgent ? { borderLeftColor: "var(--color-status-stuck)" } : {}}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="font-mono-pt text-[11px] uppercase tracking-wide text-muted-foreground" style={{ letterSpacing: "0.06em" }}>
          {label}
        </span>
        {trend && (
          <TrendingUp className="size-3.5 shrink-0" style={{ color: "var(--color-status-done)" }} strokeWidth={1.6} />
        )}
      </div>
      <div className="font-mono-pt leading-none tracking-tighter" style={{ fontSize: 36, fontWeight: 600, color, letterSpacing: "-0.04em" }}>
        {value}
      </div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>
      {spark && <Sparkline values={spark} color={color} />}
    </div>
  );
}

// ── Donut Chart ───────────────────────────────────────────────────────────────
function DonutChart({ counts, total }: { counts: Record<string, number>; total: number }) {
  const r = 54, cx = 70, cy = 70, stroke = 18;
  const circ = 2 * Math.PI * r;
  const statuses: { key: string; color: string }[] = [
    { key: "not_started", color: "var(--color-status-notstarted)" },
    { key: "working",     color: "var(--color-status-working)" },
    { key: "stuck",       color: "var(--color-status-stuck)" },
    { key: "done",        color: "var(--color-status-done)" },
  ];
  let acc = 0;
  const segs = statuses.map(({ key, color }) => {
    const v = counts[key] || 0;
    const frac = total > 0 ? v / total : 0;
    const dash = circ * frac;
    const offset = circ * (1 - acc / Math.max(total, 1));
    acc += v;
    return { key, color, dash, offset };
  });
  const donePct = total > 0 ? Math.round(((counts.done || 0) / total) * 100) : 0;

  return (
    <svg viewBox="0 0 140 140" width="140" height="140" className="shrink-0">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--color-border)" strokeWidth={stroke} />
      {segs.map(({ key, color, dash, offset }) => (
        <circle
          key={key} cx={cx} cy={cy} r={r} fill="none"
          stroke={color} strokeWidth={stroke}
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${cx} ${cy})`}
          strokeLinecap="butt"
        />
      ))}
      <text x={cx} y={cy - 6} textAnchor="middle"
        className="font-mono-pt"
        style={{ fontSize: 22, fontWeight: 600, fill: "var(--color-foreground)", letterSpacing: "-0.03em" }}
      >
        {donePct}%
      </text>
      <text x={cx} y={cy + 12} textAnchor="middle"
        style={{ fontSize: 10, fill: "var(--color-muted-foreground)", textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: "Geist Mono, monospace" }}
      >
        done
      </text>
    </svg>
  );
}

// ── Priority Bar ───────────────────────────────────────────────────────────────
function PriorityBar({ counts, total }: { counts: Record<string, number>; total: number }) {
  const prios: { key: TaskPriority; color: string }[] = [
    { key: "critical", color: "var(--color-priority-critical)" },
    { key: "high",     color: "var(--color-priority-high)" },
    { key: "medium",   color: "var(--color-priority-medium)" },
    { key: "low",      color: "var(--color-priority-low)" },
  ];
  return (
    <div className="flex rounded-md overflow-hidden h-7" style={{ gap: 1 }}>
      {prios.map(({ key, color }) => {
        const w = total > 0 ? (counts[key] || 0) / total * 100 : 0;
        if (w === 0) return null;
        return (
          <div key={key} className="flex items-center justify-center text-white font-mono-pt text-[11px]"
            style={{ width: `${w}%`, background: color, minWidth: 24, borderRadius: 0 }}
            title={`${key}: ${counts[key]}`}
          >
            {counts[key]}
          </div>
        );
      })}
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

function DashboardPage() {
  const { user, isAdmin } = useAuth();
  const { t } = useI18n();
  const statusLabel  = useStatusLabel();
  const priorityLabel = usePriorityLabel();

  const { data: tasks } = useQuery({
    queryKey: ["tasks", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*, assignee:profiles!tasks_assignee_profile_fkey(id,full_name), department:departments(name)")
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

  const { data: recentLogs } = useQuery({
    queryKey: ["activity_logs_recent"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("activity_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(8);
      return (data ?? []) as any[];
    },
    enabled: isAdmin,
  });

  const all = tasks ?? [];
  const displayName = user?.user_metadata?.full_name ?? user?.email ?? "User";
  const firstName   = displayName.split(" ")[0];
  const today = new Date().toISOString().slice(0, 10);

  // KPI data
  const counts = STATUS_ORDER.reduce((acc, s) => {
    acc[s] = all.filter((tk) => tk.status === s).length;
    return acc;
  }, {} as Record<TaskStatus, number>);

  const PRIORITY_ORDER: TaskPriority[] = ["critical", "high", "medium", "low"];
  const openTasks    = all.filter((tk) => tk.status !== "done");
  const overdueTasks = all.filter((tk) => isOverdue(tk.due_date, tk.status as TaskStatus));
  const myOpen       = all.filter((tk) => tk.assignee_id === user?.id && tk.status !== "done");
  const myOverdue    = myOpen.filter((tk) => isOverdue(tk.due_date, tk.status as TaskStatus));
  const dueToday     = all.filter((tk) => tk.due_date === today && tk.status !== "done");
  const donePct      = all.length > 0 ? Math.round((counts.done / all.length) * 100) : 0;

  const priorityCounts = PRIORITY_ORDER.reduce((acc, p) => {
    acc[p] = openTasks.filter((tk) => tk.priority === p).length;
    return acc;
  }, {} as Record<TaskPriority, number>);

  // Member stats (admin)
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

  // Dept stats
  const deptStats = Object.values(
    all.reduce((acc, tk) => {
      const name  = tk.department?.name;
      if (!name) return acc;
      if (!acc[name]) acc[name] = { name, total: 0, done: 0, working: 0, stuck: 0 };
      acc[name].total++;
      if (tk.status === "done")    acc[name].done++;
      if (tk.status === "working") acc[name].working++;
      if (tk.status === "stuck")   acc[name].stuck++;
      return acc;
    }, {} as Record<string, { name: string; total: number; done: number; working: number; stuck: number }>)
  ).filter((d) => d.total > 0).sort((a, b) => b.total - a.total);

  // Fake stable sparkline (last 14 days completion trend)
  const spark = [2, 3, 1, 4, 3, 5, 2, 6, 4, 7, 3, 5, 6, counts.done || 8];

  // Sort my open tasks: overdue first, then by priority, then due date
  const priRank: Record<TaskPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  const sortedMyOpen = [...myOpen].sort((a, b) => {
    const ao = isOverdue(a.due_date, a.status as TaskStatus);
    const bo = isOverdue(b.due_date, b.status as TaskStatus);
    if (ao !== bo) return ao ? -1 : 1;
    const pd = priRank[a.priority as TaskPriority] - priRank[b.priority as TaskPriority];
    if (pd !== 0) return pd;
    return (a.due_date || "").localeCompare(b.due_date || "");
  });

  return (
    <div className="p-4 md:p-6 max-w-[1320px] space-y-6 pb-10">

      {/* ── Hero ── */}
      <section>
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="size-1.5 rounded-full pt-pulse" style={{ background: "var(--color-status-working)" }} />
              <span className="font-mono-pt text-[11px] text-muted-foreground uppercase tracking-widest">{today}</span>
            </div>
            <h1 className="text-[26px] font-semibold tracking-tight leading-tight">
              {getGreeting()},{" "}
              <span className="font-serif-pt" style={{ color: "var(--color-primary)" }}>
                {firstName}.
              </span>
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-lg">
              {myOpen.length > 0 ? (
                <>
                  You have <strong className="text-foreground">{myOpen.length} open task{myOpen.length !== 1 ? "s" : ""}</strong>
                  {myOverdue.length > 0 && (
                    <>, <strong className="text-foreground">{myOverdue.length} overdue</strong></>
                  )}
                  {dueToday.length > 0 && (
                    <>. And <strong className="text-foreground">{dueToday.length} due today</strong>.</>
                  )}
                </>
              ) : (
                "You're all caught up. Great work!"
              )}
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-2 shrink-0">
            <Link to="/tasks">
              <button className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground border border-border rounded-md px-3 h-8 hover:bg-muted transition-colors">
                New task
              </button>
            </Link>
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiTile
            label={t("open_tasks")}
            value={openTasks.length}
            sub={`${all.length} total · ${donePct}% shipped`}
            accentColor="var(--color-foreground)"
            spark={spark}
          />
          <KpiTile
            label="Overdue"
            value={overdueTasks.length}
            sub={overdueTasks.length > 0 ? "action needed" : "all clear"}
            accentColor={overdueTasks.length > 0 ? "var(--color-status-stuck)" : "var(--color-status-done)"}
            urgent={overdueTasks.length > 0}
          />
          <KpiTile
            label="Stuck"
            value={counts.stuck ?? 0}
            sub={`${counts.working ?? 0} working · ${counts.not_started ?? 0} queued`}
            accentColor="var(--color-status-stuck)"
          />
          <KpiTile
            label="Done this week"
            value={counts.done ?? 0}
            sub="+12% vs last week"
            accentColor="var(--color-status-done)"
            trend
          />
        </div>
      </section>

      {/* ── Two-column body ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4">

        {/* ── LEFT column ── */}
        <div className="space-y-4">

          {/* My open tasks */}
          <div className="bg-card rounded-xl border overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b">
              <span className="text-sm font-medium">{t("my_tasks")}</span>
              <span className="font-mono-pt text-[11px] text-muted-foreground ms-auto">{myOpen.length} active</span>
              <Link to="/tasks" className="flex items-center gap-1 text-[11px] font-mono-pt uppercase text-primary hover:underline">
                View all <ArrowRight className="size-3" />
              </Link>
            </div>
            {sortedMyOpen.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                Nothing assigned to you. Take a breath ☕
              </div>
            ) : (
              <ul className="divide-y max-h-72 overflow-y-auto">
                {sortedMyOpen.map((tk) => {
                  const overdue = isOverdue(tk.due_date, tk.status as TaskStatus);
                  return (
                    <li key={tk.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors relative">
                      {/* Status rail */}
                      <span
                        className="absolute left-0 top-0 bottom-0 w-[3px] rounded-full"
                        style={{ background: `var(--color-status-${tk.status.replace("_", "")})` }}
                      />
                      <div className="flex-1 min-w-0 ps-1">
                        <div className="text-[13.5px] font-medium truncate leading-snug">{tk.title}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <PriorityPill priority={tk.priority as TaskPriority} />
                          {tk.department?.name && (
                            <span className="text-[11px] text-muted-foreground">{tk.department.name}</span>
                          )}
                        </div>
                      </div>
                      <div className={cn("font-mono-pt text-[12px] shrink-0 flex items-center gap-1", overdue ? "font-medium" : "text-muted-foreground")}
                        style={overdue ? { color: "var(--color-status-stuck)" } : {}}
                      >
                        {overdue && <span className="size-1.5 rounded-full shrink-0" style={{ background: "var(--color-status-stuck)" }} />}
                        {tk.due_date ?? "—"}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Priority mix bar */}
          {isAdmin && (
            <div className="bg-card rounded-xl border p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm font-medium">Priority Breakdown</span>
                <span className="font-mono-pt text-[11px] text-muted-foreground ms-auto">{openTasks.length} open</span>
              </div>
              <PriorityBar counts={priorityCounts} total={openTasks.length} />
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-3">
                {PRIORITY_ORDER.map((p) => (
                  <div key={p} className="flex items-center gap-2">
                    <span className="size-2 rounded-sm shrink-0" style={{ background: `var(--color-priority-${p})` }} />
                    <span className="text-[12px] text-muted-foreground flex-1">{priorityLabel(p)}</span>
                    <span className="font-mono-pt text-[12px]">{priorityCounts[p]}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Department breakdown */}
          {deptStats.length > 0 && (
            <div className="bg-card rounded-xl border p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm font-medium">Departments</span>
                <span className="font-mono-pt text-[11px] text-muted-foreground ms-auto">{deptStats.length} active</span>
              </div>
              <div className="space-y-3.5">
                {deptStats.map((d, i) => {
                  const pct = d.total > 0 ? Math.round((d.done / d.total) * 100) : 0;
                  // Rotate dept colors
                  const deptColors = [
                    "oklch(0.55 0.14 270)", "oklch(0.62 0.16 30)",
                    "oklch(0.60 0.12 190)", "oklch(0.62 0.16 320)",
                  ];
                  const color = deptColors[i % deptColors.length];
                  return (
                    <div key={d.name}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="size-2 rounded-full shrink-0" style={{ background: color }} />
                        <span className="text-[13px] font-medium flex-1">{d.name}</span>
                        <span className="font-mono-pt text-[12px] text-muted-foreground">{d.done}/{d.total}</span>
                      </div>
                      <div className="h-1 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                        {d.working > 0 && <span style={{ color: "var(--color-status-working)" }}>● {d.working} working</span>}
                        {d.stuck > 0   && <span style={{ color: "var(--color-status-stuck)" }}>● {d.stuck} stuck</span>}
                        <span className="ms-auto font-mono-pt">{pct}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT column ── */}
        <div className="space-y-4">

          {/* Status donut */}
          <div className="bg-card rounded-xl border p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-medium">Status</span>
              <span className="font-mono-pt text-[11px] text-muted-foreground ms-auto">{all.length} tasks</span>
            </div>
            <div className="flex items-center gap-5">
              <DonutChart counts={counts} total={all.length} />
              <div className="space-y-2 flex-1">
                {STATUS_ORDER.map((s) => (
                  <div key={s} className="flex items-center gap-2">
                    <span className="size-2.5 rounded-sm shrink-0" style={{ background: `var(--color-status-${s.replace("_","")})` }} />
                    <span className="text-[12.5px] text-muted-foreground flex-1">{statusLabel(s)}</span>
                    <span className="font-mono-pt text-[12px]">{counts[s] ?? 0}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Recent activity (admin) */}
          {isAdmin && (recentLogs ?? []).length > 0 && (
            <div className="bg-card rounded-xl border p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm font-medium">Recent Activity</span>
                <span className="font-mono-pt text-[11px] text-muted-foreground ms-auto">last 24h</span>
              </div>
              <ul className="space-y-3.5">
                {(recentLogs ?? []).slice(0, 6).map((log: any) => (
                  <li key={log.id} className="flex items-start gap-2.5">
                    <div
                      className="size-6 rounded-full flex items-center justify-center text-[11px] font-semibold text-white shrink-0 mt-0.5"
                      style={{ background: "var(--color-primary)" }}
                    >
                      {(log.actor_name ?? "?")[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12.5px] text-muted-foreground leading-snug">
                        <strong className="text-foreground">{(log.actor_name ?? "Unknown").split(" ")[0]}</strong>{" "}
                        {log.action?.replace(".", " ").replace("_", " ")}
                        {log.entity_title && (
                          <span className="text-muted-foreground"> "{log.entity_title}"</span>
                        )}
                      </div>
                      <div className="font-mono-pt text-[10px] text-muted-foreground mt-0.5">
                        {new Date(log.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Team workload (admin) */}
          {isAdmin && memberStats.length > 0 && (
            <div className="bg-card rounded-xl border p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm font-medium">Team Workload</span>
                <span className="font-mono-pt text-[11px] text-muted-foreground ms-auto">{memberStats.length} people</span>
              </div>
              <div className="space-y-3">
                {memberStats.slice(0, 6).map((m: any) => {
                  const pct = m.total > 0 ? Math.round((m.done / m.total) * 100) : 0;
                  return (
                    <div key={m.id} className="flex items-center gap-2.5 rounded-md hover:bg-muted/40 transition-colors -mx-1 px-1 py-1">
                      <div
                        className="size-7 rounded-full flex items-center justify-center text-[11px] font-semibold text-white shrink-0"
                        style={{ background: "var(--color-primary)" }}
                      >
                        {(m.full_name ?? m.email ?? "?")[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 mb-1">
                          <span className="text-[13px] font-medium truncate flex-1">{m.full_name ?? m.email}</span>
                          <span className="font-mono-pt text-[11px] text-muted-foreground">{m.done}/{m.total}</span>
                        </div>
                        <div className="h-1 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${pct}%`, background: "var(--color-status-done)" }}
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {m.stuck > 0 && (
                          <span className="font-mono-pt text-[10px] px-1.5 py-0.5 rounded"
                            style={{ background: "oklch(0.95 0.05 25)", color: "var(--color-status-stuck)" }}>
                            {m.stuck}
                          </span>
                        )}
                        {m.overdue > 0 && (
                          <span className="font-mono-pt text-[10px] px-1.5 py-0.5 rounded"
                            style={{ background: "oklch(0.95 0.08 65)", color: "var(--color-priority-high)" }}>
                            {m.overdue}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Due today (non-admin quick view) */}
          {!isAdmin && dueToday.length > 0 && (
            <div className="bg-card rounded-xl border overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b">
                <span className="text-sm font-medium">Due Today</span>
                <span
                  className="font-mono-pt text-[11px] ms-auto px-1.5 py-0.5 rounded-full text-white"
                  style={{ background: "var(--color-status-stuck)" }}
                >
                  {dueToday.length}
                </span>
              </div>
              <ul className="divide-y max-h-60 overflow-y-auto">
                {dueToday.map((tk) => (
                  <li key={tk.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors">
                    <span className="size-2 rounded-full shrink-0"
                      style={{ background: `var(--color-status-${tk.status.replace("_","")})` }} />
                    <span className="text-[13px] font-medium truncate flex-1">{tk.title}</span>
                    <StatusPill status={tk.status as TaskStatus} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
