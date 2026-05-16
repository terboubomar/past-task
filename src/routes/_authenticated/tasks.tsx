import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import {
  Plus, MessageSquare, Trash2, Search, LayoutList,
  LayoutGrid, Pencil, CalendarClock, X, ChevronDown,
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
  not_started: "border-l-4 border-l-gray-400",
  working:     "border-l-4 border-l-blue-500",
  stuck:       "border-l-4 border-l-red-500",
  done:        "border-l-4 border-l-green-500",
};

function isOverdue(due: string | null, status: TaskStatus) {
  if (!due || status === "done") return false;
  return new Date(due) < new Date(new Date().toDateString());
}

function TasksPage() {
  const { user, isAdmin } = useAuth();
  const { t } = useI18n();
  const statusLabel = useStatusLabel();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [view, setView] = useState<"board" | "list">("board");

  // Filters
  const [search, setSearch] = useState("");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterAssignee, setFilterAssignee] = useState<string>("all");

  const { data: tasks } = useQuery({
    queryKey: ["tasks", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*, assignee:profiles!tasks_assignee_profile_fkey(id, full_name), department:departments(id, name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: members } = useQuery({
    queryKey: ["members"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name, email");
      return data ?? [];
    },
  });

  const { data: depts } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      const { data } = await supabase.from("departments").select("*").order("name");
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    return (tasks ?? []).filter((tk) => {
      if (search && !tk.title.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterPriority !== "all" && tk.priority !== filterPriority) return false;
      if (filterStatus !== "all" && tk.status !== filterStatus) return false;
      if (filterAssignee !== "all" && tk.assignee_id !== filterAssignee) return false;
      return true;
    });
  }, [tasks, search, filterPriority, filterStatus, filterAssignee]);

  const hasFilters = search || filterPriority !== "all" || filterStatus !== "all" || filterAssignee !== "all";

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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      setDetailId(null);
      toast.success(t("task_deleted"));
    },
  });

  const canEditTask = (tk: any) => isAdmin || tk.assignee_id === user?.id;
  const detailTask = tasks?.find((tk) => tk.id === detailId);
  const editTask = tasks?.find((tk) => tk.id === editId);

  const clearFilters = () => {
    setSearch(""); setFilterPriority("all"); setFilterStatus("all"); setFilterAssignee("all");
  };

  return (
    <div className="p-4 md:p-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-5 gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold tracking-tight">{t("tasks")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t("tasks_sub")}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* View toggle */}
          <div className="flex items-center border rounded-md overflow-hidden">
            <button
              onClick={() => setView("board")}
              className={cn("px-2.5 py-1.5 text-sm transition-colors",
                view === "board" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"
              )}
              title="Board view"
            >
              <LayoutGrid className="size-4" />
            </button>
            <button
              onClick={() => setView("list")}
              className={cn("px-2.5 py-1.5 text-sm transition-colors",
                view === "list" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"
              )}
              title="List view"
            >
              <LayoutList className="size-4" />
            </button>
          </div>
          {isAdmin && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="size-4" /><span className="hidden sm:inline">{t("new_task")}</span></Button>
              </DialogTrigger>
              <NewTaskDialog
                members={members ?? []}
                depts={depts ?? []}
                userId={user?.id ?? ""}
                onCreated={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["tasks"] }); }}
              />
            </Dialog>
          )}
        </div>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row gap-2 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("search_tasks")}
            className="pl-8"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-36 h-9 text-sm">
              <SelectValue placeholder={t("status")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("all_statuses")}</SelectItem>
              {STATUS_ORDER.map((s) => <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterPriority} onValueChange={setFilterPriority}>
            <SelectTrigger className="w-32 h-9 text-sm">
              <SelectValue placeholder={t("priority")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("all_priorities")}</SelectItem>
              {(Object.keys(PRIORITY_LABEL) as TaskPriority[]).map((p) => (
                <SelectItem key={p} value={p}>{PRIORITY_LABEL[p]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterAssignee} onValueChange={setFilterAssignee}>
            <SelectTrigger className="w-36 h-9 text-sm">
              <SelectValue placeholder={t("assignee")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("all_members")}</SelectItem>
              {(members ?? []).map((m) => <SelectItem key={m.id} value={m.id}>{m.full_name ?? m.email}</SelectItem>)}
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button variant="ghost" size="sm" className="h-9 px-2 text-muted-foreground" onClick={clearFilters}>
              <X className="size-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Results count */}
      {hasFilters && (
        <p className="text-xs text-muted-foreground mb-3">
          {filtered.length} {t("results")}
        </p>
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
                    <span className="text-xs text-muted-foreground ml-auto">{items.length}</span>
                  </div>
                  <div className="space-y-2 min-h-[80px]">
                    {items.map((tk) => (
                      <TaskCard key={tk.id} task={tk} onClick={() => setDetailId(tk.id)} />
                    ))}
                    {items.length === 0 && (
                      <div className="text-xs text-muted-foreground/50 italic px-1 py-4 text-center border border-dashed rounded-lg">
                        {t("empty")}
                      </div>
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
          {filtered.length === 0 && (
            <div className="py-16 text-center text-sm text-muted-foreground">{t("empty")}</div>
          )}
          {filtered.map((tk) => (
            <Card
              key={tk.id}
              onClick={() => setDetailId(tk.id)}
              className={cn(
                "px-4 py-3 cursor-pointer hover:shadow-sm transition-shadow flex items-center gap-3",
                STATUS_RING[tk.status as TaskStatus]
              )}
            >
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
                  <span>{tk.assignee?.full_name ?? t("unassigned")}</span>
                  {tk.due_date && <span>· {tk.due_date}</span>}
                </div>
              </div>
              {isAdmin && (
                <button
                  onClick={(e) => { e.stopPropagation(); setEditId(tk.id); }}
                  className="p-1.5 rounded hover:bg-muted text-muted-foreground shrink-0"
                >
                  <Pencil className="size-3.5" />
                </button>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Task Detail Dialog */}
      <Dialog open={!!detailId} onOpenChange={(o) => !o && setDetailId(null)}>
        {detailTask && (
          <TaskDetail
            task={detailTask}
            canEdit={canEditTask(detailTask)}
            isAdmin={isAdmin}
            userId={user?.id ?? ""}
            onStatusChange={(status) => updateStatus.mutate({ id: detailTask.id, status })}
            onDelete={() => deleteTask.mutate(detailTask.id)}
            onEdit={() => { setDetailId(null); setEditId(detailTask.id); }}
          />
        )}
      </Dialog>

      {/* Edit Task Dialog */}
      {editTask && (
        <Dialog open={!!editId} onOpenChange={(o) => !o && setEditId(null)}>
          <EditTaskDialog
            task={editTask}
            members={members ?? []}
            depts={depts ?? []}
            onSaved={() => { setEditId(null); qc.invalidateQueries({ queryKey: ["tasks"] }); }}
          />
        </Dialog>
      )}
    </div>
  );
}

// ─── Task Card (board) ─────────────────────────────────────────────────────────────

function TaskCard({ task, onClick }: { task: any; onClick: () => void }) {
  const { t } = useI18n();
  const overdue = isOverdue(task.due_date, task.status);
  return (
    <Card
      onClick={onClick}
      className="p-3 cursor-pointer hover:shadow-sm transition-shadow active:scale-[0.99]"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-medium leading-snug">{task.title}</div>
        {overdue && (
          <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4 shrink-0 whitespace-nowrap">
            <CalendarClock className="size-2.5 mr-0.5" />Overdue
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
        {task.department?.name ? ` · ${task.department.name}` : ""}
      </div>
    </Card>
  );
}

// ─── New Task Dialog ───────────────────────────────────────────────────────────

function NewTaskDialog({ members, depts, userId, onCreated }: {
  members: any[]; depts: any[]; userId: string; onCreated: () => void;
}) {
  const { t } = useI18n();
  const priorityLabel = usePriorityLabel();
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [assignee, setAssignee] = useState<string>("");
  const [dept, setDept] = useState<string>("");
  const [start, setStart] = useState("");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.from("tasks").insert({
      title, description: desc || null, priority,
      assignee_id: assignee || null,
      department_id: dept || null,
      start_date: start || null,
      due_date: due || null,
      created_by: userId,
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
      <TaskForm
        title={title} setTitle={setTitle}
        desc={desc} setDesc={setDesc}
        priority={priority} setPriority={setPriority}
        assignee={assignee} setAssignee={setAssignee}
        dept={dept} setDept={setDept}
        start={start} setStart={setStart}
        due={due} setDue={setDue}
        members={members} depts={depts}
        busy={busy}
        submitLabel={busy ? t("creating") : t("create_task")}
        onSubmit={submit}
      />
    </DialogContent>
  );
}

// ─── Edit Task Dialog ───────────────────────────────────────────────────────────

function EditTaskDialog({ task, members, depts, onSaved }: {
  task: any; members: any[]; depts: any[]; onSaved: () => void;
}) {
  const { t } = useI18n();
  const priorityLabel = usePriorityLabel();
  const [title, setTitle] = useState(task.title);
  const [desc, setDesc] = useState(task.description ?? "");
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [assignee, setAssignee] = useState<string>(task.assignee_id ?? "");
  const [dept, setDept] = useState<string>(task.department_id ?? "");
  const [start, setStart] = useState(task.start_date ?? "");
  const [due, setDue] = useState(task.due_date ?? "");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.from("tasks").update({
      title, description: desc || null, priority,
      assignee_id: assignee || null,
      department_id: dept || null,
      start_date: start || null,
      due_date: due || null,
    }).eq("id", task.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(t("task_updated"));
    onSaved();
  };

  return (
    <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>{t("edit_task")}</DialogTitle></DialogHeader>
      <TaskForm
        title={title} setTitle={setTitle}
        desc={desc} setDesc={setDesc}
        priority={priority} setPriority={setPriority}
        assignee={assignee} setAssignee={setAssignee}
        dept={dept} setDept={setDept}
        start={start} setStart={setStart}
        due={due} setDue={setDue}
        members={members} depts={depts}
        busy={busy}
        submitLabel={busy ? t("saving") : t("save_changes")}
        onSubmit={submit}
      />
    </DialogContent>
  );
}

// ─── Shared Task Form ────────────────────────────────────────────────────────────

function TaskForm({
  title, setTitle, desc, setDesc, priority, setPriority,
  assignee, setAssignee, dept, setDept, start, setStart, due, setDue,
  members, depts, busy, submitLabel, onSubmit,
}: any) {
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
          <Label>{t("department")}</Label>
          <Select value={dept} onValueChange={setDept}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              {depts.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
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

// ─── Task Detail ────────────────────────────────────────────────────────────────

function TaskDetail({
  task, canEdit, isAdmin, userId, onStatusChange, onDelete, onEdit,
}: {
  task: any; canEdit: boolean; isAdmin: boolean; userId: string;
  onStatusChange: (s: TaskStatus) => void;
  onDelete: () => void;
  onEdit: () => void;
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
        .eq("task_id", task.id)
        .order("created_at", { ascending: true });
      return data ?? [];
    },
  });

  const post = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("task_comments").insert({
        task_id: task.id, author_id: userId, content: comment,
      });
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
          <p className="text-sm text-muted-foreground whitespace-pre-wrap bg-muted/40 rounded-lg p-3">
            {task.description}
          </p>
        )}

        {/* Meta grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          <MetaCell label={t("status")}>
            {canEdit ? (
              <Select value={task.status} onValueChange={(v) => onStatusChange(v as TaskStatus)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_ORDER.map((s) => <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : <StatusPill status={task.status} />}
          </MetaCell>
          <MetaCell label={t("priority")}><PriorityPill priority={task.priority} /></MetaCell>
          <MetaCell label={t("assignee")}>{task.assignee?.full_name ?? t("unassigned")}</MetaCell>
          <MetaCell label={t("department")}>{task.department?.name ?? "—"}</MetaCell>
          <MetaCell label={t("start")}>{task.start_date ?? "—"}</MetaCell>
          <MetaCell label={t("due")}>
            <span className={overdue ? "text-destructive font-medium" : ""}>
              {task.due_date ?? "—"}
            </span>
          </MetaCell>
        </div>

        {/* Comments */}
        <div className="border-t pt-4">
          <div className="flex items-center gap-2 mb-3 text-sm font-medium">
            <MessageSquare className="size-4" />
            {t("updates")}
            {(comments ?? []).length > 0 && (
              <span className="ml-auto text-xs text-muted-foreground">{(comments ?? []).length}</span>
            )}
          </div>
          <div className="space-y-3 mb-3 max-h-48 overflow-y-auto">
            {(comments ?? []).map((c: any) => (
              <div key={c.id} className="text-sm bg-muted/40 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-xs">{c.author?.full_name ?? "User"}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(c.created_at).toLocaleString()}
                  </span>
                </div>
                <div className="text-muted-foreground mt-0.5 whitespace-pre-wrap text-sm">{c.content}</div>
              </div>
            ))}
            {(comments ?? []).length === 0 && (
              <div className="text-xs text-muted-foreground italic py-2">{t("no_updates")}</div>
            )}
          </div>
          <div className="flex gap-2">
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={t("post_update")}
              rows={2}
              maxLength={1000}
              className="text-sm resize-none"
            />
            <Button
              onClick={() => post.mutate()}
              disabled={!comment.trim() || post.isPending}
              className="self-end"
            >
              {t("post")}
            </Button>
          </div>
        </div>

        {/* Danger zone */}
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

function MetaCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div>{children}</div>
    </div>
  );
}
