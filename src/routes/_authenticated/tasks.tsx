import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import {
  Plus, MessageSquare, Trash2, Search, LayoutList,
  LayoutGrid, Pencil, CalendarClock, X, Table2,
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
});

const STATUS_RING: Record<TaskStatus, string> = {
  not_started: "border-s-4 border-s-gray-400",
  working:     "border-s-4 border-s-blue-500",
  stuck:       "border-s-4 border-s-red-500",
  done:        "border-s-4 border-s-green-500",
};

const STATUS_ROW_BG: Record<TaskStatus, string> = {
  not_started: "hover:bg-muted/40",
  working:     "hover:bg-blue-50/40 dark:hover:bg-blue-950/20",
  stuck:       "hover:bg-red-50/40 dark:hover:bg-red-950/20",
  done:        "hover:bg-green-50/40 dark:hover:bg-green-950/20",
};

function isOverdue(due: string | null, status: TaskStatus) {
  if (!due || status === "done") return false;
  return new Date(due) < new Date(new Date().toDateString());
}

type ViewMode = "board" | "list" | "table";

function TasksPage() {
  const { user, isAdmin } = useAuth();
  const { t } = useI18n();
  const statusLabel = useStatusLabel();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("table");

  // Filters
  const [search, setSearch] = useState("");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterAssignee, setFilterAssignee] = useState<string>("all");
  const [filterProject, setFilterProject] = useState<string>("all");

  const { data: tasks } = useQuery({
    queryKey: ["tasks", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*, assignee:profiles!tasks_assignee_profile_fkey(id,full_name), department:departments(id,name), project:projects(id,name,color)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: members } = useQuery({
    queryKey: ["members"],
    queryFn: async () => (await supabase.from("profiles").select("id,full_name,email")).data ?? [],
  });

  const { data: depts } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => (await supabase.from("departments").select("*").order("name")).data ?? [],
  });

  const { data: projects } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => (await supabase.from("projects").select("id,name,color").order("name")).data ?? [],
  });

  const filtered = useMemo(() => {
    return (tasks ?? []).filter((tk) => {
      if (search && !tk.title.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterPriority !== "all" && tk.priority !== filterPriority) return false;
      if (filterStatus !== "all" && tk.status !== filterStatus) return false;
      if (filterAssignee !== "all" && tk.assignee_id !== filterAssignee) return false;
      if (filterProject !== "all" && tk.project_id !== filterProject) return false;
      return true;
    });
  }, [tasks, search, filterPriority, filterStatus, filterAssignee, filterProject]);

  const hasFilters = search || filterPriority !== "all" || filterStatus !== "all" || filterAssignee !== "all" || filterProject !== "all";

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
  const editTask   = tasks?.find((tk) => tk.id === editId);

  const clearFilters = () => {
    setSearch(""); setFilterPriority("all"); setFilterStatus("all");
    setFilterAssignee("all"); setFilterProject("all");
  };

  const viewButtons: { mode: ViewMode; icon: React.ReactNode; label: string }[] = [
    { mode: "table", icon: <Table2 className="size-4" />, label: "Table" },
    { mode: "board", icon: <LayoutGrid className="size-4" />, label: "Board" },
    { mode: "list",  icon: <LayoutList className="size-4" />, label: "List" },
  ];

  // Group tasks by status for table view
  const grouped = useMemo(() => {
    const g: Record<TaskStatus, typeof filtered> = { not_started: [], working: [], stuck: [], done: [] };
    filtered.forEach((tk) => { if (g[tk.status as TaskStatus]) g[tk.status as TaskStatus].push(tk); });
    return g;
  }, [filtered]);

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (s: string) => setCollapsedGroups((prev) => {
    const n = new Set(prev);
    n.has(s) ? n.delete(s) : n.add(s);
    return n;
  });

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-5 gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold tracking-tight">{t("tasks")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t("tasks_sub")}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* View toggle */}
          <div className="flex items-center border rounded-md overflow-hidden">
            {viewButtons.map(({ mode, icon }) => (
              <button key={mode} onClick={() => setView(mode)}
                className={cn("px-2.5 py-1.5 transition-colors",
                  view === mode ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"
                )}
              >{icon}</button>
            ))}
          </div>
          {isAdmin && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="size-4" /><span className="hidden sm:inline">{t("new_task")}</span></Button>
              </DialogTrigger>
              <NewTaskDialog
                members={members ?? []} depts={depts ?? []} projects={projects ?? []}
                userId={user?.id ?? ""}
                onCreated={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["tasks"] }); }}
              />
            </Dialog>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("search_tasks")} className="ps-8" />
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select value={filterProject} onValueChange={setFilterProject}>
            <SelectTrigger className="w-36 h-9 text-sm"><SelectValue placeholder={t("project")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("all_projects")}</SelectItem>
              {(projects ?? []).map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
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
              {(members ?? []).map((m: any) => <SelectItem key={m.id} value={m.id}>{m.full_name ?? m.email}</SelectItem>)}
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button variant="ghost" size="sm" className="h-9 px-2 text-muted-foreground" onClick={clearFilters}>
              <X className="size-4" />
            </Button>
          )}
        </div>
      </div>

      {hasFilters && <p className="text-xs text-muted-foreground mb-3">{filtered.length} {t("results")}</p>}

      {/* TABLE VIEW (Monday-style) */}
      {view === "table" && (
        <div className="rounded-lg border overflow-hidden">
          {/* Header row */}
          <div className="hidden md:grid grid-cols-[2.5fr_1fr_1fr_1fr_1.2fr_1fr] gap-0 bg-muted/60 border-b text-xs font-medium text-muted-foreground uppercase tracking-wide">
            <div className="px-4 py-2.5">{t("title")}</div>
            <div className="px-3 py-2.5">{t("status")}</div>
            <div className="px-3 py-2.5">{t("priority")}</div>
            <div className="px-3 py-2.5">{t("assignee")}</div>
            <div className="px-3 py-2.5">{t("due_date")}</div>
            <div className="px-3 py-2.5">{t("project")}</div>
          </div>

          {filtered.length === 0 && (
            <div className="py-16 text-center text-sm text-muted-foreground">{t("empty")}</div>
          )}

          {STATUS_ORDER.map((s) => {
            const rows = grouped[s];
            if (rows.length === 0) return null;
            const collapsed = collapsedGroups.has(s);
            return (
              <div key={s}>
                {/* Group header */}
                <button
                  onClick={() => toggleGroup(s)}
                  className="w-full flex items-center gap-2 px-4 py-2 bg-muted/30 border-b hover:bg-muted/50 transition-colors text-left"
                >
                  <span className={`size-2.5 rounded-full shrink-0 ${STATUS_BG[s]}`} />
                  <span className="text-sm font-medium">{statusLabel(s)}</span>
                  <span className="text-xs text-muted-foreground">({rows.length})</span>
                  <span className="ms-auto text-muted-foreground text-xs">{collapsed ? "▶" : "▼"}</span>
                </button>

                {!collapsed && rows.map((tk, i) => (
                  <div
                    key={tk.id}
                    onClick={() => setDetailId(tk.id)}
                    className={cn(
                      "grid grid-cols-1 md:grid-cols-[2.5fr_1fr_1fr_1fr_1.2fr_1fr] border-b last:border-b-0 cursor-pointer transition-colors",
                      STATUS_ROW_BG[tk.status as TaskStatus]
                    )}
                  >
                    {/* Title cell */}
                    <div className="px-4 py-3 flex items-center gap-2">
                      <span className={`hidden md:block w-0.5 h-4 rounded-full shrink-0 ${STATUS_BG[tk.status as TaskStatus]}`} />
                      <span className="text-sm font-medium truncate">{tk.title}</span>
                      {isOverdue(tk.due_date, tk.status) && (
                        <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4 shrink-0">
                          <CalendarClock className="size-2.5 me-0.5" />Overdue
                        </Badge>
                      )}
                    </div>
                    {/* Status */}
                    <div className="hidden md:flex px-3 py-3 items-center">
                      <StatusPill status={tk.status} />
                    </div>
                    {/* Priority */}
                    <div className="hidden md:flex px-3 py-3 items-center">
                      <PriorityPill priority={tk.priority} />
                    </div>
                    {/* Assignee */}
                    <div className="hidden md:flex px-3 py-3 items-center">
                      <span className="text-sm text-muted-foreground truncate">
                        {tk.assignee?.full_name ?? t("unassigned")}
                      </span>
                    </div>
                    {/* Due date */}
                    <div className="hidden md:flex px-3 py-3 items-center">
                      <span className={cn("text-sm", isOverdue(tk.due_date, tk.status) ? "text-destructive font-medium" : "text-muted-foreground")}>
                        {tk.due_date ?? "—"}
                      </span>
                    </div>
                    {/* Project */}
                    <div className="hidden md:flex px-3 py-3 items-center gap-1.5">
                      {tk.project ? (
                        <>
                          <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: tk.project.color }} />
                          <span className="text-sm text-muted-foreground truncate">{tk.project.name}</span>
                        </>
                      ) : <span className="text-sm text-muted-foreground">—</span>}
                    </div>
                    {/* Mobile inline summary */}
                    <div className="md:hidden px-4 pb-3 flex items-center gap-2 flex-wrap">
                      <StatusPill status={tk.status} />
                      <PriorityPill priority={tk.priority} />
                      <span className="text-xs text-muted-foreground">{tk.assignee?.full_name ?? t("unassigned")}</span>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* BOARD VIEW */}
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
                    <span className="text-xs text-muted-foreground ms-auto">{items.length}</span>
                  </div>
                  <div className="space-y-2 min-h-[80px]">
                    {items.map((tk) => <TaskCard key={tk.id} task={tk} onClick={() => setDetailId(tk.id)} />)}
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

      {/* LIST VIEW */}
      {view === "list" && (
        <div className="space-y-2">
          {filtered.length === 0 && <div className="py-16 text-center text-sm text-muted-foreground">{t("empty")}</div>}
          {filtered.map((tk) => (
            <Card key={tk.id} onClick={() => setDetailId(tk.id)}
              className={cn("px-4 py-3 cursor-pointer hover:shadow-sm transition-shadow flex items-center gap-3", STATUS_RING[tk.status as TaskStatus])}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium truncate">{tk.title}</span>
                  {isOverdue(tk.due_date, tk.status) && (
                    <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4 shrink-0"><CalendarClock className="size-2.5 me-0.5" />Overdue</Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                  <PriorityPill priority={tk.priority} />
                  <StatusPill status={tk.status} />
                  <span>{tk.assignee?.full_name ?? t("unassigned")}</span>
                  {tk.due_date && <span>· {tk.due_date}</span>}
                  {tk.project && (
                    <span className="flex items-center gap-1">
                      · <span className="size-2 rounded-full inline-block" style={{ backgroundColor: tk.project.color }} />
                      {tk.project.name}
                    </span>
                  )}
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

      {/* Detail dialog */}
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

      {/* Edit dialog */}
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

// ─── Task Card (board) ──────────────────────────────────────────────────────

function TaskCard({ task, onClick }: { task: any; onClick: () => void }) {
  const { t } = useI18n();
  const overdue = isOverdue(task.due_date, task.status);
  return (
    <Card onClick={onClick} className="p-3 cursor-pointer hover:shadow-sm transition-shadow active:scale-[0.99]">
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-medium leading-snug">{task.title}</div>
        {overdue && (
          <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4 shrink-0 whitespace-nowrap">
            <CalendarClock className="size-2.5 me-0.5" />Overdue
          </Badge>
        )}
      </div>
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
        {task.project ? (
          <span className="inline-flex items-center gap-1 ms-1">
            · <span className="size-1.5 rounded-full inline-block" style={{ backgroundColor: task.project.color }} />
            {task.project.name}
          </span>
        ) : ""}
      </div>
    </Card>
  );
}

// ─── Shared form ────────────────────────────────────────────────────────────

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
          <Select value={priority} onValueChange={(v: any) => setPriority(v as TaskPriority)}>
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
                  <span className="flex items-center gap-2">
                    <span className="size-2 rounded-full" style={{ backgroundColor: p.color }} />
                    {p.name}
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

// ─── New Task ────────────────────────────────────────────────────────────────

function NewTaskDialog({ members, depts, projects, userId, onCreated }: any) {
  const { t } = useI18n();
  const [title, setTitle] = useState(""); const [desc, setDesc] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [assignee, setAssignee] = useState(""); const [dept, setDept] = useState("");
  const [projectId, setProjectId] = useState("");
  const [start, setStart] = useState(""); const [due, setDue] = useState("");
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
    setTitle(""); setDesc(""); setAssignee(""); setDept(""); setProjectId(""); setStart(""); setDue(""); setPriority("medium");
  };

  return (
    <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>{t("new_task")}</DialogTitle></DialogHeader>
      <TaskForm title={title} setTitle={setTitle} desc={desc} setDesc={setDesc}
        priority={priority} setPriority={setPriority} assignee={assignee} setAssignee={setAssignee}
        dept={dept} setDept={setDept} projectId={projectId} setProjectId={setProjectId}
        start={start} setStart={setStart} due={due} setDue={setDue}
        members={members} depts={depts} projects={projects} busy={busy}
        submitLabel={busy ? t("creating") : t("create_task")} onSubmit={submit}
      />
    </DialogContent>
  );
}

// ─── Edit Task ────────────────────────────────────────────────────────────────

function EditTaskDialog({ task, members, depts, projects, onSaved }: any) {
  const { t } = useI18n();
  const [title, setTitle] = useState(task.title); const [desc, setDesc] = useState(task.description ?? "");
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [assignee, setAssignee] = useState(task.assignee_id ?? ""); const [dept, setDept] = useState(task.department_id ?? "");
  const [projectId, setProjectId] = useState(task.project_id ?? "");
  const [start, setStart] = useState(task.start_date ?? ""); const [due, setDue] = useState(task.due_date ?? "");
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
        submitLabel={busy ? t("saving") : t("save_changes")} onSubmit={submit}
      />
    </DialogContent>
  );
}

// ─── Task Detail ─────────────────────────────────────────────────────────────

function TaskDetail({ task, canEdit, isAdmin, userId, onStatusChange, onDelete, onEdit }: {
  task: any; canEdit: boolean; isAdmin: boolean; userId: string;
  onStatusChange: (s: TaskStatus) => void; onDelete: () => void; onEdit: () => void;
}) {
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
        <div className="flex items-start gap-2 pe-6">
          <div className="flex-1">
            <DialogTitle className="leading-snug">{task.title}</DialogTitle>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {overdue && (
                <Badge variant="destructive" className="text-xs">
                  <CalendarClock className="size-3 me-1" /> Overdue
                </Badge>
              )}
              {task.project && (
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="size-2 rounded-full" style={{ backgroundColor: task.project.color }} />
                  {task.project.name}
                </span>
              )}
            </div>
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
          <MetaCell label={t("status")}>
            {canEdit ? (
              <Select value={task.status} onValueChange={(v) => onStatusChange(v as TaskStatus)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{STATUS_ORDER.map((s) => <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>)}</SelectContent>
              </Select>
            ) : <StatusPill status={task.status} />}
          </MetaCell>
          <MetaCell label={t("priority")}><PriorityPill priority={task.priority} /></MetaCell>
          <MetaCell label={t("assignee")}>{task.assignee?.full_name ?? t("unassigned")}</MetaCell>
          <MetaCell label={t("department")}>{task.department?.name ?? "—"}</MetaCell>
          <MetaCell label={t("start")}>{task.start_date ?? "—"}</MetaCell>
          <MetaCell label={t("due")}>
            <span className={overdue ? "text-destructive font-medium" : ""}>{task.due_date ?? "—"}</span>
          </MetaCell>
        </div>

        <div className="border-t pt-4">
          <div className="flex items-center gap-2 mb-3 text-sm font-medium">
            <MessageSquare className="size-4" />{t("updates")}
            {(comments ?? []).length > 0 && <span className="ms-auto text-xs text-muted-foreground">{(comments ?? []).length}</span>}
          </div>
          <div className="space-y-3 mb-3 max-h-48 overflow-y-auto">
            {(comments ?? []).map((c: any) => (
              <div key={c.id} className="text-sm bg-muted/40 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-xs">{c.author?.full_name ?? "User"}</span>
                  <span className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleString()}</span>
                </div>
                <div className="text-muted-foreground mt-0.5 whitespace-pre-wrap">{c.content}</div>
              </div>
            ))}
            {(comments ?? []).length === 0 && <div className="text-xs text-muted-foreground italic py-2">{t("no_updates")}</div>}
          </div>
          <div className="flex gap-2">
            <Textarea value={comment} onChange={(e) => setComment(e.target.value)}
              placeholder={t("post_update")} rows={2} maxLength={1000} className="text-sm resize-none" />
            <Button onClick={() => post.mutate()} disabled={!comment.trim() || post.isPending} className="self-end">{t("post")}</Button>
          </div>
        </div>

        {isAdmin && (
          <div className="border-t pt-4 flex justify-end">
            <Button variant="destructive" size="sm" onClick={onDelete}><Trash2 className="size-4" /> {t("delete_task")}</Button>
          </div>
        )}
      </div>
    </DialogContent>
  );
}

function MetaCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div>{children}</div>
    </div>
  );
}
