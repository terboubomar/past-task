import { createFileRoute, useSearch, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import {
  Plus, MessageSquare, Trash2, Search, LayoutList,
  LayoutGrid, Pencil, CalendarClock, X, ChevronDown, ChevronRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/hooks/use-i18n";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  STATUS_ORDER, STATUS_BG,
  PRIORITY_LABEL, PriorityPill, StatusPill,
  useStatusLabel, usePriorityLabel,
} from "@/components/task-pills";
import type { TaskStatus, TaskPriority } from "@/components/task-pills";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/tasks")({
  component: TasksPage,
  validateSearch: (s: Record<string, unknown>) => ({
    project: typeof s.project === "string" ? s.project : undefined,
  }),
});

const STATUS_RING: Record<TaskStatus, string> = {
  not_started: "border-l-4 border-l-gray-400",
  working:     "border-l-4 border-l-blue-500",
  stuck:       "border-l-4 border-l-red-500",
  done:        "border-l-4 border-l-green-500",
};

const COL_WIDTHS = "grid-cols-[minmax(200px,2fr)_120px_100px_140px_110px_110px_32px]";

function isOverdue(due: string | null, status: TaskStatus) {
  if (!due || status === "done") return false;
  return new Date(due) < new Date(new Date().toDateString());
}

function TasksPage() {
  const { user, isAdmin } = useAuth();
  const { t } = useI18n();
  const statusLabel = useStatusLabel();
  const qc = useQueryClient();
  const search = useSearch({ from: "/_authenticated/tasks" });
  const nav = useNavigate();

  const [open, setOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [view, setView] = useState<"board" | "list" | "table">("table");
  const [searchText, setSearchText] = useState("");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterAssignee, setFilterAssignee] = useState<string>("all");
  const [filterProject, setFilterProject] = useState<string>(search.project ?? "all");
  const [collapsed, setCollapsed] = useState<Record<TaskStatus, boolean>>({} as any);

  const { data: tasks } = useQuery({
    queryKey: ["tasks", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*, assignee:profiles!tasks_assignee_profile_fkey(id, full_name), department:departments(id, name), project:projects(id, name, color)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: members } = useQuery({
    queryKey: ["members"],
    queryFn: async () => (await supabase.from("profiles").select("id, full_name, email")).data ?? [],
  });

  const { data: depts } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => (await supabase.from("departments").select("*").order("name")).data ?? [],
  });

  const { data: projects } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => (await supabase.from("projects").select("id, name, color").order("name")).data ?? [],
  });

  const filtered = useMemo(() => {
    return (tasks ?? []).filter((tk) => {
      if (searchText && !tk.title.toLowerCase().includes(searchText.toLowerCase())) return false;
      if (filterPriority !== "all" && tk.priority !== filterPriority) return false;
      if (filterStatus !== "all" && tk.status !== filterStatus) return false;
      if (filterAssignee !== "all" && tk.assignee_id !== filterAssignee) return false;
      if (filterProject !== "all" && tk.project_id !== filterProject) return false;
      return true;
    });
  }, [tasks, searchText, filterPriority, filterStatus, filterAssignee, filterProject]);

  const hasFilters = searchText || filterPriority !== "all" || filterStatus !== "all" || filterAssignee !== "all" || filterProject !== "all";

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TaskStatus }) => {
      const { error } = await supabase.from("tasks").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
    onError: (e) => toast.error(e.message),
  });

  const deleteTask = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tasks"] }); setDetailId(null); toast.success(t("task_deleted")); },
  });

  const canEditTask = (tk: any) => isAdmin || tk.assignee_id === user?.id;
  const detailTask = tasks?.find((tk) => tk.id === detailId);
  const editTask = tasks?.find((tk) => tk.id === editId);

  const clearFilters = () => {
    setSearchText(""); setFilterPriority("all"); setFilterStatus("all");
    setFilterAssignee("all"); setFilterProject("all");
  };

  const toggleCollapse = (s: TaskStatus) =>
    setCollapsed((prev) => ({ ...prev, [s]: !prev[s] }));

  // Active project label
  const activeProject = projects?.find((p) => p.id === filterProject);

  return (
    <div className="p-4 md:p-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-5 gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold tracking-tight flex items-center gap-2">
            {activeProject && (
              <span className="size-3 rounded-full shrink-0" style={{ background: activeProject.color }} />
            )}
            {activeProject ? activeProject.name : t("tasks")}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t("tasks_sub")}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* View toggle */}
          <div className="flex items-center border rounded-md overflow-hidden">
            {(["table", "board", "list"] as const).map((v) => (
              <button key={v} onClick={() => setView(v)}
                className={cn("px-2.5 py-1.5 text-sm transition-colors",
                  view === v ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"
                )}
                title={v.charAt(0).toUpperCase() + v.slice(1) + " view"}
              >
                {v === "table" && <LayoutList className="size-4" />}
                {v === "board" && <LayoutGrid className="size-4" />}
                {v === "list" && <span className="text-xs font-medium px-0.5">≡</span>}
              </button>
            ))}
          </div>
          {isAdmin && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="size-4" /><span className="hidden sm:inline">{t("new_task")}</span></Button>
              </DialogTrigger>
              <NewTaskDialog
                members={members ?? []} depts={depts ?? []} projects={projects ?? []}
                userId={user?.id ?? ""} defaultProject={filterProject !== "all" ? filterProject : ""}
                onCreated={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["tasks"] }); }}
              />
            </Dialog>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <Input value={searchText} onChange={(e) => setSearchText(e.target.value)}
            placeholder={t("search_tasks")} className="pl-8" />
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select value={filterProject} onValueChange={setFilterProject}>
            <SelectTrigger className="w-36 h-9 text-sm"><SelectValue placeholder={t("project")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("all_projects")}</SelectItem>
              {(projects ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  <span className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full shrink-0" style={{ background: p.color }} />
                    {p.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-36 h-9 text-sm"><SelectValue placeholder={t("status")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("all_statuses")}</SelectItem>
              {STATUS_ORDER.map((s) => <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterPriority} onValueChange={setFilterPriority}>
            <SelectTrigger className="w-32 h-9 text-sm"><SelectValue placeholder={t("priority")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("all_priorities")}</SelectItem>
              {(Object.keys(PRIORITY_LABEL) as TaskPriority[]).map((p) => (
                <SelectItem key={p} value={p}>{PRIORITY_LABEL[p]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterAssignee} onValueChange={setFilterAssignee}>
            <SelectTrigger className="w-36 h-9 text-sm"><SelectValue placeholder={t("assignee")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("all_members")}</SelectItem>
              {(members ?? []).map((m) => <SelectItem key={m.id} value={m.id}>{m.full_name ?? m.email}</SelectItem>)}
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button variant="ghost" size="sm" className="h-9 px-2" onClick={clearFilters}>
              <X className="size-4" />
            </Button>
          )}
        </div>
      </div>

      {hasFilters && (
        <p className="text-xs text-muted-foreground mb-3">{filtered.length} {t("results")}</p>
      )}

      {/* ===== TABLE VIEW (Monday-style) ===== */}
      {view === "table" && (
        <div className="rounded-xl border overflow-hidden">
          {/* Header row */}
          <div className={cn("hidden md:grid gap-0 bg-muted/60 border-b text-xs font-medium text-muted-foreground uppercase tracking-wide", COL_WIDTHS)}>
            <div className="px-4 py-2.5">{t("title")}</div>
            <div className="px-3 py-2.5">{t("status")}</div>
            <div className="px-3 py-2.5">{t("priority")}</div>
            <div className="px-3 py-2.5">{t("assignee")}</div>
            <div className="px-3 py-2.5">{t("due_date")}</div>
            <div className="px-3 py-2.5">{t("project")}</div>
            <div className="px-3 py-2.5" />
          </div>

          {/* Grouped by status */}
          {STATUS_ORDER.map((s) => {
            const rows = filtered.filter((tk) => tk.status === s);
            if (rows.length === 0 && filterStatus !== "all") return null;
            const isCollapsed = collapsed[s];
            return (
              <div key={s}>
                {/* Group header */}
                <button
                  onClick={() => toggleCollapse(s)}
                  className="w-full flex items-center gap-2 px-4 py-2 bg-muted/30 hover:bg-muted/50 transition-colors border-b text-sm font-medium"
                >
                  <span className={`size-2.5 rounded-full ${STATUS_BG[s]}`} />
                  <span>{statusLabel(s)}</span>
                  <span className="text-xs text-muted-foreground">({rows.length})</span>
                  <ChevronDown className={cn("size-3.5 ml-auto text-muted-foreground transition-transform", isCollapsed && "-rotate-90")} />
                </button>

                {/* Task rows */}
                {!isCollapsed && (
                  <div className="divide-y">
                    {rows.map((tk) => (
                      <TableRow
                        key={tk.id}
                        task={tk}
                        canEdit={canEditTask(tk)}
                        isAdmin={isAdmin}
                        colWidths={COL_WIDTHS}
                        onOpen={() => setDetailId(tk.id)}
                        onEdit={() => setEditId(tk.id)}
                        onStatusChange={(status) => updateStatus.mutate({ id: tk.id, status })}
                      />
                    ))}
                    {rows.length === 0 && (
                      <div className="px-4 py-3 text-xs text-muted-foreground italic">{t("empty")}</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div className="py-16 text-center text-sm text-muted-foreground">{t("empty")}</div>
          )}
        </div>
      )}

      {/* ===== BOARD VIEW ===== */}
      {view === "board" && (
        <div className="-mx-4 md:mx-0">
          <div className="flex gap-3 overflow-x-auto px-4 md:px-0 pb-4 snap-x snap-mandatory md:grid md:grid-cols-4 md:overflow-visible">
            {STATUS_ORDER.map((s) => {
              const items = filtered.filter((tk) => tk.status === s);
              return (
                <div key={s} className="flex flex-col shrink-0 w-72 md:w-auto snap-start">
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`size-2.5 rounded-full ${STATUS_BG[s]}`} />
                    <h3 className="text-sm font-medium">{statusLabel(s)}</h3>
                    <span className="text-xs text-muted-foreground ml-auto">{items.length}</span>
                  </div>
                  <div className="space-y-2 min-h-[80px]">
                    {items.map((tk) => (
                      <TaskCard key={tk.id} task={tk} onClick={() => setDetailId(tk.id)} />
                    ))}
                    {items.length === 0 && (
                      <div className="text-xs text-muted-foreground/50 italic px-1 py-4 text-center border border-dashed rounded-lg">{t("empty")}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ===== LIST VIEW ===== */}
      {view === "list" && (
        <div className="space-y-2">
          {filtered.length === 0 && (
            <div className="py-16 text-center text-sm text-muted-foreground">{t("empty")}</div>
          )}
          {filtered.map((tk) => (
            <Card key={tk.id} onClick={() => setDetailId(tk.id)}
              className={cn("px-4 py-3 cursor-pointer hover:shadow-sm transition-shadow flex items-center gap-3", STATUS_RING[tk.status as TaskStatus])}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium truncate">{tk.title}</span>
                  {isOverdue(tk.due_date, tk.status) && (
                    <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4 shrink-0">
                      <CalendarClock className="size-2.5 mr-0.5" /> Overdue
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                  <PriorityPill priority={tk.priority} />
                  <StatusPill status={tk.status} />
                  {tk.project && (
                    <span className="flex items-center gap-1">
                      <span className="size-1.5 rounded-full" style={{ background: tk.project.color }} />
                      {tk.project.name}
                    </span>
                  )}
                  <span>{tk.assignee?.full_name ?? t("unassigned")}</span>
                  {tk.due_date && <span>· {tk.due_date}</span>}
                </div>
              </div>
              {isAdmin && (
                <button onClick={(e) => { e.stopPropagation(); setEditId(tk.id); }}
                  className="p-1.5 rounded hover:bg-muted text-muted-foreground shrink-0">
                  <Pencil className="size-3.5" />
                </button>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Task Detail */}
      <Dialog open={!!detailId} onOpenChange={(o) => !o && setDetailId(null)}>
        {detailTask && (
          <TaskDetail
            task={detailTask} canEdit={canEditTask(detailTask)} isAdmin={isAdmin} userId={user?.id ?? ""}
            onStatusChange={(status) => updateStatus.mutate({ id: detailTask.id, status })}
            onDelete={() => deleteTask.mutate(detailTask.id)}
            onEdit={() => { setDetailId(null); setEditId(detailTask.id); }}
          />
        )}
      </Dialog>

      {/* Edit Task */}
      {editTask && (
        <Dialog open={!!editId} onOpenChange={(o) => !o && setEditId(null)}>
          <EditTaskDialog
            task={editTask} members={members ?? []} depts={depts ?? []} projects={projects ?? []}
            onSaved={() => { setEditId(null); qc.invalidateQueries({ queryKey: ["tasks"] }); }}
          />
        </Dialog>
      )}
    </div>
  );
}

// ─── Table Row ─────────────────────────────────────────────────────────────

function TableRow({ task, canEdit, isAdmin, colWidths, onOpen, onEdit, onStatusChange }: any) {
  const { t } = useI18n();
  const statusLabel = useStatusLabel();
  const overdue = isOverdue(task.due_date, task.status);
  return (
    <div
      className={cn(
        "group hover:bg-muted/30 transition-colors cursor-pointer",
        "flex flex-col md:grid gap-0",
        "md:" + colWidths
      )}
      onClick={onOpen}
    >
      {/* Mobile layout */}
      <div className="flex md:hidden items-start gap-3 px-4 py-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{task.title}</span>
            {overdue && (
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">
                <CalendarClock className="size-2.5 mr-0.5" />Overdue
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <StatusPill status={task.status} />
            <PriorityPill priority={task.priority} />
            <span className="text-xs text-muted-foreground">{task.assignee?.full_name ?? t("unassigned")}</span>
            {task.due_date && <span className={cn("text-xs", overdue ? "text-destructive" : "text-muted-foreground")}>{task.due_date}</span>}
          </div>
        </div>
        {isAdmin && (
          <button onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground">
            <Pencil className="size-3.5" />
          </button>
        )}
      </div>

      {/* Desktop cells */}
      <div className="hidden md:contents">
        <div className="px-4 py-2.5 flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium truncate">{task.title}</span>
          {overdue && (
            <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4 shrink-0">
              <CalendarClock className="size-2.5 mr-0.5" />Overdue
            </Badge>
          )}
        </div>
        <div className="px-3 py-2.5 flex items-center">
          {canEdit ? (
            <Select value={task.status} onValueChange={(v) => { onStatusChange(v); }}
              onOpenChange={(o) => o && event?.stopPropagation?.()}>
              <SelectTrigger
                className="h-7 text-xs border-0 bg-transparent p-0 shadow-none focus:ring-0 gap-1 w-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_ORDER.map((s) => <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : <StatusPill status={task.status} />}
        </div>
        <div className="px-3 py-2.5 flex items-center"><PriorityPill priority={task.priority} /></div>
        <div className="px-3 py-2.5 flex items-center text-sm text-muted-foreground truncate">{task.assignee?.full_name ?? "—"}</div>
        <div className={cn("px-3 py-2.5 flex items-center text-sm", overdue ? "text-destructive font-medium" : "text-muted-foreground")}>
          {task.due_date ?? "—"}
        </div>
        <div className="px-3 py-2.5 flex items-center gap-1.5 min-w-0">
          {task.project ? (
            <>
              <span className="size-2 rounded-full shrink-0" style={{ background: task.project.color }} />
              <span className="text-xs text-muted-foreground truncate">{task.project.name}</span>
            </>
          ) : <span className="text-xs text-muted-foreground">—</span>}
        </div>
        <div className="px-2 py-2.5 flex items-center justify-center">
          {isAdmin && (
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-muted text-muted-foreground transition-opacity"
            >
              <Pencil className="size-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Task Card (board) ──────────────────────────────────────────────────────

function TaskCard({ task, onClick }: { task: any; onClick: () => void }) {
  const { t } = useI18n();
  const overdue = isOverdue(task.due_date, task.status);
  return (
    <Card onClick={onClick} className="p-3 cursor-pointer hover:shadow-sm transition-shadow active:scale-[0.99]">
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-medium leading-snug">{task.title}</div>
        {overdue && (
          <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4 shrink-0">
            <CalendarClock className="size-2.5 mr-0.5" />Overdue
          </Badge>
        )}
      </div>
      {task.project && (
        <div className="flex items-center gap-1 mt-1.5">
          <span className="size-1.5 rounded-full" style={{ background: task.project.color }} />
          <span className="text-xs text-muted-foreground">{task.project.name}</span>
        </div>
      )}
      <div className="mt-2 flex items-center gap-2 flex-wrap">
        <PriorityPill priority={task.priority} />
        {task.due_date && (
          <span className={cn("text-xs", overdue ? "text-destructive font-medium" : "text-muted-foreground")}>
            {task.due_date}
          </span>
        )}
      </div>
      <div className="mt-2 text-xs text-muted-foreground truncate">
        {task.assignee?.full_name ?? t("unassigned")}
      </div>
    </Card>
  );
}

// ─── Shared Task Form ───────────────────────────────────────────────────────

function TaskForm({ title, setTitle, desc, setDesc, priority, setPriority,
  assignee, setAssignee, dept, setDept, start, setStart, due, setDue,
  projectId, setProjectId, members, depts, projects, busy, submitLabel, onSubmit }: any) {
  const { t } = useI18n();
  const priorityLabel = usePriorityLabel();
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label>{t("title")}</Label>
        <Input value={title} onChange={(e: any) => setTitle(e.target.value)} required maxLength={200} />
      </div>
      <div className="space-y-1.5">
        <Label>{t("description")}</Label>
        <Textarea value={desc} onChange={(e: any) => setDesc(e.target.value)} rows={3} maxLength={2000} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>{t("priority")}</Label>
          <Select value={priority} onValueChange={(v: any) => setPriority(v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(PRIORITY_LABEL) as TaskPriority[]).map((p) => (
                <SelectItem key={p} value={p}>{priorityLabel(p)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>{t("project")}</Label>
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              {projects.map((p: any) => (
                <SelectItem key={p.id} value={p.id}>
                  <span className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full" style={{ background: p.color }} />{p.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>{t("department")}</Label>
          <Select value={dept} onValueChange={setDept}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              {depts.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>{t("assignee")}</Label>
          <Select value={assignee} onValueChange={setAssignee}>
            <SelectTrigger><SelectValue placeholder={t("unassigned")} /></SelectTrigger>
            <SelectContent>
              {members.map((m: any) => <SelectItem key={m.id} value={m.id}>{m.full_name ?? m.email}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>{t("start_date")}</Label>
          <Input type="date" value={start} onChange={(e: any) => setStart(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>{t("due_date")}</Label>
          <Input type="date" value={due} onChange={(e: any) => setDue(e.target.value)} />
        </div>
      </div>
      <Button type="submit" disabled={busy} className="w-full">{submitLabel}</Button>
    </form>
  );
}

function NewTaskDialog({ members, depts, projects, userId, defaultProject, onCreated }: any) {
  const { t } = useI18n();
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [assignee, setAssignee] = useState("");
  const [dept, setDept] = useState("");
  const [projectId, setProjectId] = useState(defaultProject ?? "");
  const [start, setStart] = useState("");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    const { error } = await supabase.from("tasks").insert({
      title, description: desc || null, priority,
      assignee_id: assignee || null, department_id: dept || null,
      project_id: projectId || null,
      start_date: start || null, due_date: due || null, created_by: userId,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(t("task_created"));
    onCreated();
    setTitle(""); setDesc(""); setAssignee(""); setDept(""); setStart(""); setDue(""); setPriority("medium");
  };

  return (
    <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>{t("new_task")}</DialogTitle></DialogHeader>
      <TaskForm title={title} setTitle={setTitle} desc={desc} setDesc={setDesc}
        priority={priority} setPriority={setPriority} assignee={assignee} setAssignee={setAssignee}
        dept={dept} setDept={setDept} projectId={projectId} setProjectId={setProjectId}
        start={start} setStart={setStart} due={due} setDue={setDue}
        members={members} depts={depts} projects={projects} busy={busy}
        submitLabel={busy ? t("creating") : t("create_task")} onSubmit={submit} />
    </DialogContent>
  );
}

function EditTaskDialog({ task, members, depts, projects, onSaved }: any) {
  const { t } = useI18n();
  const [title, setTitle] = useState(task.title);
  const [desc, setDesc] = useState(task.description ?? "");
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [assignee, setAssignee] = useState(task.assignee_id ?? "");
  const [dept, setDept] = useState(task.department_id ?? "");
  const [projectId, setProjectId] = useState(task.project_id ?? "");
  const [start, setStart] = useState(task.start_date ?? "");
  const [due, setDue] = useState(task.due_date ?? "");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    const { error } = await supabase.from("tasks").update({
      title, description: desc || null, priority,
      assignee_id: assignee || null, department_id: dept || null,
      project_id: projectId || null,
      start_date: start || null, due_date: due || null,
    }).eq("id", task.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(t("task_updated"));
    onSaved();
  };

  return (
    <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>{t("edit_task")}</DialogTitle></DialogHeader>
      <TaskForm title={title} setTitle={setTitle} desc={desc} setDesc={setDesc}
        priority={priority} setPriority={setPriority} assignee={assignee} setAssignee={setAssignee}
        dept={dept} setDept={setDept} projectId={projectId} setProjectId={setProjectId}
        start={start} setStart={setStart} due={due} setDue={setDue}
        members={members} depts={depts} projects={projects} busy={busy}
        submitLabel={busy ? t("saving") : t("save_changes")} onSubmit={submit} />
    </DialogContent>
  );
}

// ─── Task Detail ────────────────────────────────────────────────────────────

function TaskDetail({ task, canEdit, isAdmin, userId, onStatusChange, onDelete, onEdit }: any) {
  const { t } = useI18n();
  const statusLabel = useStatusLabel();
  const qc = useQueryClient();
  const [comment, setComment] = useState("");
  const overdue = isOverdue(task.due_date, task.status);

  const { data: comments } = useQuery({
    queryKey: ["comments", task.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("task_comments")
        .select("*, author:profiles!task_comments_author_profile_fkey(full_name)")
        .eq("task_id", task.id).order("created_at", { ascending: true });
      return data ?? [];
    },
  });

  const post = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("task_comments").insert({ task_id: task.id, author_id: userId, content: comment });
      if (error) throw error;
    },
    onSuccess: () => { setComment(""); qc.invalidateQueries({ queryKey: ["comments", task.id] }); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <div className="flex items-start gap-2 pr-6">
          <div className="flex-1">
            {task.project && (
              <div className="flex items-center gap-1.5 mb-1">
                <span className="size-2 rounded-full" style={{ background: task.project.color }} />
                <span className="text-xs text-muted-foreground">{task.project.name}</span>
              </div>
            )}
            <DialogTitle className="leading-snug">{task.title}</DialogTitle>
            {overdue && (
              <Badge variant="destructive" className="mt-1 text-xs">
                <CalendarClock className="size-3 mr-1" /> Overdue
              </Badge>
            )}
          </div>
          {isAdmin && (
            <Button variant="outline" size="sm" className="shrink-0" onClick={onEdit}>
              <Pencil className="size-3.5" /> {t("edit_task")}
            </Button>
          )}
        </div>
      </DialogHeader>

      <div className="space-y-4">
        {task.description && (
          <p className="text-sm text-muted-foreground whitespace-pre-wrap bg-muted/40 rounded-lg p-3">{task.description}</p>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          {([
            { label: t("status"), content: canEdit ? (
              <Select value={task.status} onValueChange={(v) => onStatusChange(v as TaskStatus)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{STATUS_ORDER.map((s) => <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>)}</SelectContent>
              </Select>
            ) : <StatusPill status={task.status} /> },
            { label: t("priority"), content: <PriorityPill priority={task.priority} /> },
            { label: t("assignee"), content: task.assignee?.full_name ?? t("unassigned") },
            { label: t("department"), content: task.department?.name ?? "—" },
            { label: t("start"), content: task.start_date ?? "—" },
            { label: t("due"), content: <span className={overdue ? "text-destructive font-medium" : ""}>{task.due_date ?? "—"}</span> },
          ]).map(({ label, content }) => (
            <div key={label}>
              <div className="text-xs text-muted-foreground mb-1">{label}</div>
              <div>{content}</div>
            </div>
          ))}
        </div>

        <div className="border-t pt-4">
          <div className="flex items-center gap-2 mb-3 text-sm font-medium">
            <MessageSquare className="size-4" /> {t("updates")}
            {(comments ?? []).length > 0 && <span className="ml-auto text-xs text-muted-foreground">{(comments ?? []).length}</span>}
          </div>
          <div className="space-y-2 mb-3 max-h-48 overflow-y-auto">
            {(comments ?? []).map((c: any) => (
              <div key={c.id} className="text-sm bg-muted/40 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-xs">{c.author?.full_name ?? "User"}</span>
                  <span className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleString()}</span>
                </div>
                <div className="text-muted-foreground mt-0.5 whitespace-pre-wrap text-sm">{c.content}</div>
              </div>
            ))}
            {!(comments ?? []).length && (
              <div className="text-xs text-muted-foreground italic py-2">{t("no_updates")}</div>
            )}
          </div>
          <div className="flex gap-2">
            <Textarea value={comment} onChange={(e) => setComment(e.target.value)}
              placeholder={t("post_update")} rows={2} maxLength={1000} className="text-sm resize-none" />
            <Button onClick={() => post.mutate()} disabled={!comment.trim() || post.isPending} className="self-end">
              {t("post")}
            </Button>
          </div>
        </div>

        {isAdmin && (
          <div className="border-t pt-4 flex justify-end">
            <Button variant="destructive" size="sm" onClick={onDelete}>
              <Trash2 className="size-4" /> {t("delete_task")}
            </Button>
          </div>
        )}
      </div>
    </DialogContent>
  );
}
