import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useRef } from "react";
import {
  Plus, MessageSquare, Trash2, Search,
  LayoutGrid, LayoutList, Table2, Pencil, CalendarClock, X,
  ChevronDown, ChevronRight,
  Paperclip, Upload, FileText, FileImage, FileSpreadsheet, File, Download,
  Eye, Loader2,
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
  Sheet, SheetContent, SheetTitle,
} from "@/components/ui/sheet";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  STATUS_ORDER, STATUS_BG, PRIORITY_BG,
  PRIORITY_LABEL, PriorityPill, StatusPill,
  useStatusLabel, usePriorityLabel,
} from "@/components/task-pills";
import type { TaskStatus, TaskPriority } from "@/components/task-pills";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/tasks")({
  component: TasksPage,
});

// ─── Status colour maps ───────────────────────────────────────────────────────

const STATUS_SQUARE: Record<TaskStatus, string> = {
  not_started: "bg-gray-400",
  working:     "bg-blue-500",
  stuck:       "bg-red-500",
  done:        "bg-green-500",
};

const STATUS_LABEL_COLOR: Record<TaskStatus, string> = {
  not_started: "text-gray-600 dark:text-gray-400",
  working:     "text-blue-600 dark:text-blue-400",
  stuck:       "text-red-600 dark:text-red-400",
  done:        "text-green-600 dark:text-green-400",
};

const STATUS_LEFT_BAR: Record<TaskStatus, string> = {
  not_started: "bg-gray-400",
  working:     "bg-blue-500",
  stuck:       "bg-red-500",
  done:        "bg-green-500",
};

// ─── File helpers ─────────────────────────────────────────────────────────────

function getFileIcon(mime: string) {
  if (mime.startsWith("image/"))       return <FileImage className="size-4 text-blue-500" />;
  if (mime === "application/pdf")      return <FileText className="size-4 text-red-500" />;
  if (mime.includes("spreadsheet") || mime.includes("excel") || mime.includes("csv"))
    return <FileSpreadsheet className="size-4 text-green-600" />;
  if (mime.includes("word") || mime.includes("document"))
    return <FileText className="size-4 text-blue-700" />;
  return <File className="size-4 text-muted-foreground" />;
}

function formatBytes(bytes: number) {
  if (bytes < 1024)             return `${bytes} B`;
  if (bytes < 1024 * 1024)     return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const ACCEPTED_TYPES = [
  "image/*", "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
].join(",");

const MAX_FILE_SIZE = 20 * 1024 * 1024;

function isOverdue(due: string | null, status: TaskStatus) {
  if (!due || status === "done") return false;
  return new Date(due) < new Date(new Date().toDateString());
}

type ViewMode = "table" | "board" | "list";

// ─── Main page ────────────────────────────────────────────────────────────────

function TasksPage() {
  const { user, isAdmin } = useAuth();
  const { t } = useI18n();
  const statusLabel = useStatusLabel();
  const qc = useQueryClient();

  const [newOpen, setNewOpen]   = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editId, setEditId]     = useState<string | null>(null);
  const [view, setView]         = useState<ViewMode>("table");

  const [search, setSearch]               = useState("");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterStatus, setFilterStatus]   = useState("all");
  const [filterAssignee, setFilterAssignee] = useState("all");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Quick-add state: which group + current title text
  const [quickAdd, setQuickAdd] = useState<{ status: TaskStatus; title: string } | null>(null);

  const { data: tasks } = useQuery({
    queryKey: ["tasks", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*, assignee:profiles!tasks_assignee_profile_fkey(id,full_name), department:departments(id,name)")
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

  const filtered = useMemo(() => (tasks ?? []).filter((tk) => {
    if (search         && !tk.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterPriority !== "all" && tk.priority    !== filterPriority)            return false;
    if (filterStatus   !== "all" && tk.status      !== filterStatus)              return false;
    if (filterAssignee !== "all" && tk.assignee_id !== filterAssignee)            return false;
    return true;
  }), [tasks, search, filterPriority, filterStatus, filterAssignee]);

  const hasFilters = search || filterPriority !== "all" || filterStatus !== "all" || filterAssignee !== "all";

  const grouped = useMemo(() => {
    const g: Record<TaskStatus, typeof filtered> = { not_started: [], working: [], stuck: [], done: [] };
    filtered.forEach((tk) => { if (g[tk.status as TaskStatus]) g[tk.status as TaskStatus].push(tk); });
    return g;
  }, [filtered]);

  // Generic patch mutation (status, priority, assignee all go through here)
  const updateField = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await supabase.from("tasks").update(patch).eq("id", id);
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

  const quickAddTask = useMutation({
    mutationFn: async ({ title, status }: { title: string; status: TaskStatus }) => {
      const { error } = await supabase.from("tasks").insert({
        title, status, priority: "medium", created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      setQuickAdd(null);
      toast.success(t("task_created"));
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleGroup = (s: string) => setCollapsedGroups((prev) => {
    const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n;
  });

  const detailTask = tasks?.find((tk) => tk.id === detailId);
  const editTask   = tasks?.find((tk) => tk.id === editId);
  const canEditTask = (tk: any) => isAdmin || tk.assignee_id === user?.id;
  const clearFilters = () => { setSearch(""); setFilterPriority("all"); setFilterStatus("all"); setFilterAssignee("all"); };

  const viewButtons = [
    { mode: "table" as ViewMode, icon: <Table2 className="size-4" />,     label: "Table" },
    { mode: "board" as ViewMode, icon: <LayoutGrid className="size-4" />, label: "Board" },
    { mode: "list"  as ViewMode, icon: <LayoutList className="size-4" />, label: "List"  },
  ];

  return (
    <div className="flex flex-col min-h-0 h-full">

      {/* ── Toolbar ────────────────────────────────────────────────────── */}
      <div className="px-4 md:px-6 pt-4 md:pt-6 pb-3 border-b space-y-3 shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-semibold tracking-tight">{t("tasks")}</h1>
            <p className="text-xs text-muted-foreground mt-0.5">{filtered.length} {t("results")}</p>
          </div>
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex items-center border rounded-md overflow-hidden">
              {viewButtons.map(({ mode, icon }) => (
                <button key={mode} onClick={() => setView(mode)}
                  className={cn("px-2.5 py-1.5 transition-colors",
                    view === mode
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted text-muted-foreground"
                  )}
                  aria-label={mode}
                >{icon}</button>
              ))}
            </div>
            {isAdmin && (
              <Dialog open={newOpen} onOpenChange={setNewOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="size-4" />
                    <span className="hidden sm:inline">{t("new_task")}</span>
                  </Button>
                </DialogTrigger>
                <NewTaskDialog
                  members={members ?? []} depts={depts ?? []} userId={user?.id ?? ""}
                  onCreated={() => { setNewOpen(false); qc.invalidateQueries({ queryKey: ["tasks"] }); }}
                />
              </Dialog>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("search_tasks")}
              className="ps-8 h-8 text-sm"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="h-8 text-xs w-36"><SelectValue placeholder={t("status")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("all_statuses")}</SelectItem>
                {STATUS_ORDER.map((s) => <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterPriority} onValueChange={setFilterPriority}>
              <SelectTrigger className="h-8 text-xs w-32"><SelectValue placeholder={t("priority")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("all_priorities")}</SelectItem>
                {(Object.keys(PRIORITY_LABEL) as TaskPriority[]).map((p) => (
                  <SelectItem key={p} value={p}>{PRIORITY_LABEL[p]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterAssignee} onValueChange={setFilterAssignee}>
              <SelectTrigger className="h-8 text-xs w-36"><SelectValue placeholder={t("assignee")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("all_members")}</SelectItem>
                {(members ?? []).map((m: any) => (
                  <SelectItem key={m.id} value={m.id}>{m.full_name ?? m.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {hasFilters && (
              <Button variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground" onClick={clearFilters}>
                <X className="size-3.5" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ── Views ──────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto px-4 md:px-6 py-4">

        {/* ── TABLE VIEW (Monday-style) ── */}
        {view === "table" && (
          <div className="rounded-lg border overflow-hidden">

            {/* Column headers */}
            <div className="hidden md:grid grid-cols-[2.5fr_1fr_1fr_1.2fr_1fr_1fr] bg-muted/50 border-b text-[11px] font-semibold text-muted-foreground uppercase tracking-wider select-none">
              <div className="px-4 py-2.5">{t("title")}</div>
              <div className="px-3 py-2.5">{t("status")}</div>
              <div className="px-3 py-2.5">{t("priority")}</div>
              <div className="px-3 py-2.5">{t("assignee")}</div>
              <div className="px-3 py-2.5">{t("department")}</div>
              <div className="px-3 py-2.5">{t("due_date")}</div>
            </div>

            {filtered.length === 0 && (
              <div className="py-20 text-center text-sm text-muted-foreground">{t("empty")}</div>
            )}

            {STATUS_ORDER.map((s) => {
              const rows = grouped[s];
              if (rows.length === 0 && hasFilters) return null;
              const collapsed = collapsedGroups.has(s);

              return (
                <div key={s}>
                  {/* Group header */}
                  <button
                    onClick={() => toggleGroup(s)}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 bg-muted/20 border-b hover:bg-muted/40 transition-colors text-left"
                  >
                    <span className={cn("size-3 rounded-sm shrink-0", STATUS_SQUARE[s])} />
                    <span className={cn("text-sm font-semibold", STATUS_LABEL_COLOR[s])}>
                      {statusLabel(s)}
                    </span>
                    <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                      {rows.length}
                    </span>
                    <span className="ms-auto text-muted-foreground">
                      {collapsed
                        ? <ChevronRight className="size-3.5" />
                        : <ChevronDown className="size-3.5" />
                      }
                    </span>
                  </button>

                  {!collapsed && (
                    <>
                      {rows.map((tk) => (
                        <MondayRow
                          key={tk.id}
                          task={tk}
                          members={members ?? []}
                          canEdit={canEditTask(tk)}
                          onClick={() => setDetailId(tk.id)}
                          onUpdate={(patch) => updateField.mutate({ id: tk.id, patch })}
                        />
                      ))}

                      {/* Quick-add row */}
                      {isAdmin && quickAdd?.status === s ? (
                        <div className="flex items-center gap-2 px-4 py-2 border-b bg-primary/5">
                          <span className={cn("w-1 self-stretch rounded-full shrink-0", STATUS_LEFT_BAR[s])} />
                          <Input
                            autoFocus
                            placeholder={`${t("title")}…`}
                            className="h-7 text-sm flex-1 border-none shadow-none bg-transparent focus-visible:ring-0 px-1"
                            value={quickAdd.title}
                            onChange={(e) => setQuickAdd({ ...quickAdd, title: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && quickAdd.title.trim()) {
                                quickAddTask.mutate({ title: quickAdd.title.trim(), status: s });
                              }
                              if (e.key === "Escape") setQuickAdd(null);
                            }}
                          />
                          <button
                            onClick={() => setQuickAdd(null)}
                            className="text-muted-foreground hover:text-foreground p-1 rounded"
                          >
                            <X className="size-3.5" />
                          </button>
                        </div>
                      ) : isAdmin && (
                        <button
                          onClick={() => setQuickAdd({ status: s, title: "" })}
                          className="w-full flex items-center gap-2 px-4 py-2 border-b last:border-b-0 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
                        >
                          <Plus className="size-3.5" />
                          {t("new_task")}
                        </button>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── BOARD VIEW ── */}
        {view === "board" && (
          <div className="-mx-4 md:mx-0">
            <div className="flex gap-3 overflow-x-auto px-4 md:px-0 pb-4 snap-x snap-mandatory md:grid md:grid-cols-4 md:overflow-visible">
              {STATUS_ORDER.map((s) => {
                const items = filtered.filter((tk) => tk.status === s);
                return (
                  <div key={s} className="flex flex-col shrink-0 w-72 md:w-auto snap-start">
                    <div className="flex items-center gap-2 mb-3">
                      <span className={cn("size-3 rounded-sm shrink-0", STATUS_SQUARE[s])} />
                      <span className={cn("text-sm font-semibold", STATUS_LABEL_COLOR[s])}>
                        {statusLabel(s)}
                      </span>
                      <span className="text-xs text-muted-foreground ms-auto">{items.length}</span>
                    </div>
                    <div className="space-y-2 min-h-[80px]">
                      {items.map((tk) => (
                        <BoardCard key={tk.id} task={tk} onClick={() => setDetailId(tk.id)} />
                      ))}
                      {items.length === 0 && (
                        <div className="text-xs text-muted-foreground/50 italic py-4 text-center border border-dashed rounded-lg">
                          {t("empty")}
                        </div>
                      )}
                    </div>
                    {isAdmin && (
                      <button
                        onClick={() => { setQuickAdd({ status: s, title: "" }); setView("table"); }}
                        className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1.5"
                      >
                        <Plus className="size-3.5" /> {t("new_task")}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── LIST VIEW ── */}
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
                  "border-s-4",
                  tk.status === "not_started" ? "border-s-gray-400" :
                  tk.status === "working"     ? "border-s-blue-500" :
                  tk.status === "stuck"       ? "border-s-red-500"  : "border-s-green-500"
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium truncate">{tk.title}</span>
                    {isOverdue(tk.due_date, tk.status) && (
                      <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4 shrink-0">
                        <CalendarClock className="size-2.5 me-0.5" />Overdue
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <PriorityPill priority={tk.priority} />
                    <StatusPill status={tk.status} />
                    <span className="text-xs text-muted-foreground">{tk.assignee?.full_name ?? t("unassigned")}</span>
                    {tk.due_date && (
                      <span className={cn("text-xs", isOverdue(tk.due_date, tk.status) ? "text-destructive font-medium" : "text-muted-foreground")}>
                        · {tk.due_date}
                      </span>
                    )}
                  </div>
                </div>
                {isAdmin && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditId(tk.id); }}
                    className="p-1.5 rounded hover:bg-muted text-muted-foreground shrink-0"
                    aria-label={t("edit_task")}
                  >
                    <Pencil className="size-3.5" />
                  </button>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* ── SIDE PANEL (Monday-style detail) ───────────────────────────── */}
      <Sheet open={!!detailId} onOpenChange={(o) => !o && setDetailId(null)}>
        {detailTask && (
          <SheetContent
            side="right"
            className="w-full sm:max-w-xl !p-0 flex flex-col overflow-hidden"
          >
            <TaskDetail
              task={detailTask}
              canEdit={canEditTask(detailTask)}
              isAdmin={isAdmin}
              userId={user?.id ?? ""}
              onStatusChange={(status) => updateField.mutate({ id: detailTask.id, patch: { status } })}
              onDelete={() => deleteTask.mutate(detailTask.id)}
              onEdit={() => { setDetailId(null); setEditId(detailTask.id); }}
            />
          </SheetContent>
        )}
      </Sheet>

      {/* Edit dialog */}
      {editTask && (
        <Dialog open={!!editId} onOpenChange={(o) => !o && setEditId(null)}>
          <EditTaskDialog
            task={editTask} members={members ?? []} depts={depts ?? []}
            onSaved={() => { setEditId(null); qc.invalidateQueries({ queryKey: ["tasks"] }); }}
          />
        </Dialog>
      )}
    </div>
  );
}

// ─── Monday-style table row ───────────────────────────────────────────────────

function MondayRow({ task, members, canEdit, onClick, onUpdate }: {
  task: any; members: any[]; canEdit: boolean;
  onClick: () => void; onUpdate: (patch: Record<string, unknown>) => void;
}) {
  const { t } = useI18n();
  const statusLabel = useStatusLabel();
  const overdue = isOverdue(task.due_date, task.status as TaskStatus);

  return (
    <div className="group grid grid-cols-1 md:grid-cols-[2.5fr_1fr_1fr_1.2fr_1fr_1fr] border-b last:border-b-0 hover:bg-muted/25 transition-colors">

      {/* Title */}
      <div className="px-4 py-2.5 flex items-center gap-2.5 cursor-pointer" onClick={onClick}>
        <span className={cn("w-1 self-stretch rounded-full shrink-0 opacity-70", STATUS_LEFT_BAR[task.status as TaskStatus])} />
        <span className="text-sm font-medium truncate flex-1">{task.title}</span>
        {overdue && (
          <Badge variant="destructive" className="text-[10px] px-1 py-0 h-4 shrink-0">
            <CalendarClock className="size-2.5" />
          </Badge>
        )}
      </div>

      {/* Status — inline popover */}
      <div className="hidden md:flex px-3 py-2.5 items-center" onClick={(e) => e.stopPropagation()}>
        {canEdit ? (
          <Popover>
            <PopoverTrigger asChild>
              <button className="hover:opacity-75 transition-opacity rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <StatusPill status={task.status} />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-38 p-1" align="start">
              <div className="space-y-0.5">
                {STATUS_ORDER.map((s) => (
                  <button
                    key={s}
                    onClick={() => onUpdate({ status: s })}
                    className={cn(
                      "w-full text-start px-2 py-1.5 rounded text-xs hover:bg-muted transition-colors flex items-center gap-2",
                      s === task.status && "bg-muted"
                    )}
                  >
                    <span className={cn("size-2 rounded-full shrink-0", STATUS_SQUARE[s as TaskStatus])} />
                    {statusLabel(s)}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        ) : <StatusPill status={task.status} />}
      </div>

      {/* Priority — inline popover */}
      <div className="hidden md:flex px-3 py-2.5 items-center" onClick={(e) => e.stopPropagation()}>
        {canEdit ? (
          <Popover>
            <PopoverTrigger asChild>
              <button className="hover:opacity-75 transition-opacity rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <PriorityPill priority={task.priority} />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-32 p-1" align="start">
              <div className="space-y-0.5">
                {(["critical", "high", "medium", "low"] as TaskPriority[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => onUpdate({ priority: p })}
                    className={cn(
                      "w-full text-start px-2 py-1.5 rounded text-xs hover:bg-muted transition-colors flex items-center gap-2",
                      p === task.priority && "bg-muted"
                    )}
                  >
                    <span className={cn("size-2 rounded-full shrink-0", PRIORITY_BG[p])} />
                    {PRIORITY_LABEL[p]}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        ) : <PriorityPill priority={task.priority} />}
      </div>

      {/* Assignee — inline popover */}
      <div className="hidden md:flex px-3 py-2.5 items-center" onClick={(e) => e.stopPropagation()}>
        {canEdit ? (
          <Popover>
            <PopoverTrigger asChild>
              <button className="text-sm text-muted-foreground hover:text-foreground transition-colors truncate max-w-[130px] text-start focus-visible:outline-none">
                {task.assignee?.full_name ?? (
                  <span className="italic text-muted-foreground/50">{t("unassigned")}</span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-1" align="start">
              <div className="space-y-0.5 max-h-52 overflow-y-auto">
                <button
                  onClick={() => onUpdate({ assignee_id: null })}
                  className={cn(
                    "w-full text-start px-2 py-1.5 rounded text-xs hover:bg-muted transition-colors italic text-muted-foreground",
                    !task.assignee_id && "bg-muted"
                  )}
                >
                  {t("unassigned")}
                </button>
                {members.map((m: any) => (
                  <button
                    key={m.id}
                    onClick={() => onUpdate({ assignee_id: m.id })}
                    className={cn(
                      "w-full text-start px-2 py-1.5 rounded text-xs hover:bg-muted transition-colors flex items-center gap-2",
                      m.id === task.assignee_id && "bg-muted"
                    )}
                  >
                    <span className="size-5 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-semibold shrink-0">
                      {(m.full_name ?? m.email ?? "?")[0].toUpperCase()}
                    </span>
                    <span className="truncate">{m.full_name ?? m.email}</span>
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        ) : (
          <span className="text-sm text-muted-foreground truncate">
            {task.assignee?.full_name ?? t("unassigned")}
          </span>
        )}
      </div>

      {/* Department */}
      <div className="hidden md:flex px-3 py-2.5 items-center cursor-pointer" onClick={onClick}>
        <span className="text-sm text-muted-foreground truncate">{task.department?.name ?? "—"}</span>
      </div>

      {/* Due date */}
      <div className="hidden md:flex px-3 py-2.5 items-center cursor-pointer" onClick={onClick}>
        <span className={cn("text-sm tabular-nums", overdue ? "text-destructive font-medium" : "text-muted-foreground")}>
          {task.due_date ?? "—"}
        </span>
      </div>

      {/* Mobile summary */}
      <div className="md:hidden px-4 pb-2.5 flex items-center gap-2 flex-wrap cursor-pointer" onClick={onClick}>
        <StatusPill status={task.status} />
        <PriorityPill priority={task.priority} />
        <span className="text-xs text-muted-foreground">{task.assignee?.full_name ?? t("unassigned")}</span>
        {task.due_date && (
          <span className={cn("text-xs", overdue ? "text-destructive font-medium" : "text-muted-foreground")}>
            · {task.due_date}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Board card ───────────────────────────────────────────────────────────────

function BoardCard({ task, onClick }: { task: any; onClick: () => void }) {
  const { t } = useI18n();
  const overdue = isOverdue(task.due_date, task.status);
  const topColor =
    task.status === "not_started" ? "#9ca3af" :
    task.status === "working"     ? "#3b82f6" :
    task.status === "stuck"       ? "#ef4444" : "#22c55e";

  return (
    <Card
      onClick={onClick}
      className="p-3 cursor-pointer hover:shadow-md transition-all active:scale-[0.99] border-t-2"
      style={{ borderTopColor: topColor }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-snug">{task.title}</p>
        {overdue && (
          <Badge variant="destructive" className="text-[10px] px-1 py-0 h-4 shrink-0">
            <CalendarClock className="size-2.5" />
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
      <p className="mt-1.5 text-xs text-muted-foreground truncate">
        {task.assignee?.full_name ?? t("unassigned")}
      </p>
    </Card>
  );
}

// ─── Task Detail (side-panel body) ───────────────────────────────────────────

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
      const { error } = await supabase.from("task_comments").insert({
        task_id: task.id, author_id: userId, content: comment,
      });
      if (error) throw error;
    },
    onSuccess: () => { setComment(""); qc.invalidateQueries({ queryKey: ["comments", task.id] }); },
    onError: (e) => toast.error(e.message),
  });

  const leftBarColor =
    task.status === "not_started" ? "border-s-gray-400" :
    task.status === "working"     ? "border-s-blue-500" :
    task.status === "stuck"       ? "border-s-red-500"  : "border-s-green-500";

  return (
    <>
      {/* Panel header */}
      <div className={cn("px-6 pt-10 pb-4 border-b border-s-4 shrink-0", leftBarColor)}>
        <div className="flex items-start justify-between gap-3 pe-2">
          <div className="flex-1 min-w-0">
            <SheetTitle className="text-base font-semibold leading-snug">{task.title}</SheetTitle>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <StatusPill status={task.status} />
              <PriorityPill priority={task.priority} />
              {overdue && (
                <Badge variant="destructive" className="text-xs">
                  <CalendarClock className="size-3 me-1" />Overdue
                </Badge>
              )}
            </div>
          </div>
          {isAdmin && (
            <Button variant="outline" size="sm" className="shrink-0 h-8 text-xs mt-1" onClick={onEdit}>
              <Pencil className="size-3.5" /> {t("edit_task")}
            </Button>
          )}
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

        {/* Description */}
        {task.description && (
          <p className="text-sm text-muted-foreground whitespace-pre-wrap bg-muted/40 rounded-lg p-3 leading-relaxed">
            {task.description}
          </p>
        )}

        {/* Meta grid */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
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
          <MetaCell label={t("assignee")}>
            <span className="font-medium">{task.assignee?.full_name ?? t("unassigned")}</span>
          </MetaCell>
          <MetaCell label={t("department")}>{task.department?.name ?? "—"}</MetaCell>
          <MetaCell label={t("start")}>{task.start_date ?? "—"}</MetaCell>
          <MetaCell label={t("due")}>
            <span className={overdue ? "text-destructive font-medium" : ""}>{task.due_date ?? "—"}</span>
          </MetaCell>
        </div>

        {/* Attachments */}
        <TaskAttachments taskId={task.id} userId={userId} canEdit={canEdit} />

        {/* Comments / Updates */}
        <div className="border-t pt-5">
          <div className="flex items-center gap-2 mb-3 text-sm font-medium">
            <MessageSquare className="size-4" />
            {t("updates")}
            {(comments ?? []).length > 0 && (
              <span className="ms-auto text-xs text-muted-foreground">{(comments ?? []).length}</span>
            )}
          </div>
          <div className="space-y-3 mb-3 max-h-52 overflow-y-auto">
            {(comments ?? []).map((c: any) => (
              <div key={c.id} className="text-sm bg-muted/40 rounded-lg px-3 py-2.5">
                <div className="flex items-center gap-2 mb-1">
                  <span className="size-5 rounded-full bg-primary/20 flex items-center justify-center text-[9px] font-bold shrink-0">
                    {(c.author?.full_name ?? "U")[0].toUpperCase()}
                  </span>
                  <span className="font-medium text-xs">{c.author?.full_name ?? "User"}</span>
                  <span className="text-xs text-muted-foreground ms-auto">
                    {new Date(c.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="text-muted-foreground text-xs leading-relaxed whitespace-pre-wrap">{c.content}</p>
              </div>
            ))}
            {(comments ?? []).length === 0 && (
              <p className="text-xs text-muted-foreground italic py-1">{t("no_updates")}</p>
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
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && comment.trim()) post.mutate();
              }}
            />
            <Button
              onClick={() => post.mutate()}
              disabled={!comment.trim() || post.isPending}
              className="self-end h-9"
            >
              {t("post")}
            </Button>
          </div>
        </div>

        {/* Danger zone */}
        {isAdmin && (
          <div className="border-t pt-4 flex justify-end pb-2">
            <Button variant="destructive" size="sm" onClick={onDelete}>
              <Trash2 className="size-4" /> {t("delete_task")}
            </Button>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Attachments ──────────────────────────────────────────────────────────────

type PreviewState = { att: any; url: string };

function AttachmentPreview({ preview, onClose }: { preview: PreviewState; onClose: () => void }) {
  const isImage  = preview.att.mime_type.startsWith("image/");
  const isPdf    = preview.att.mime_type === "application/pdf";
  // Office / CSV → Google Docs embedded viewer
  const viewerUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(preview.url)}&embedded=true`;

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col bg-black/90"
      onClick={onClose}
    >
      {/* Header bar */}
      <div
        className="flex items-center gap-3 px-4 py-3 bg-black/60 backdrop-blur shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm text-white font-medium truncate flex-1">{preview.att.file_name}</p>
        <button
          onClick={() => window.open(preview.url, "_blank", "noopener,noreferrer")}
          className="p-1.5 rounded hover:bg-white/10 text-white/70 hover:text-white transition-colors"
          title="Open / Download"
        >
          <Download className="size-4" />
        </button>
        <button
          onClick={onClose}
          className="p-1.5 rounded hover:bg-white/10 text-white/70 hover:text-white transition-colors"
          title="Close"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Preview area */}
      <div
        className="flex-1 flex items-center justify-center p-4 min-h-0"
        onClick={(e) => e.stopPropagation()}
      >
        {isImage && (
          <img
            src={preview.url}
            alt={preview.att.file_name}
            className="max-w-full max-h-full object-contain rounded shadow-2xl"
          />
        )}
        {isPdf && (
          <iframe
            src={preview.url}
            title={preview.att.file_name}
            className="w-full h-full rounded bg-white"
          />
        )}
        {!isImage && !isPdf && (
          <iframe
            src={viewerUrl}
            title={preview.att.file_name}
            className="w-full h-full rounded bg-white"
          />
        )}
      </div>
    </div>
  );
}

function TaskAttachments({ taskId, userId, canEdit }: { taskId: string; userId: string; canEdit: boolean }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null); // which att is being fetched

  const { data: attachments } = useQuery({
    queryKey: ["attachments", taskId],
    queryFn: async () => {
      const { data } = await supabase
        .from("task_attachments")
        .select("*, uploader:profiles!task_attachments_uploaded_by_fkey(full_name)")
        .eq("task_id", taskId)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (file.size > MAX_FILE_SIZE) {
      toast.error(`File too large. Max ${formatBytes(MAX_FILE_SIZE)}`);
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${taskId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("task-attachments").upload(path, file, { contentType: file.type });
      if (uploadError) throw uploadError;

      const { error: dbError } = await supabase.from("task_attachments").insert({
        task_id: taskId, uploaded_by: userId, file_name: file.name,
        file_size: file.size, mime_type: file.type, storage_path: path,
      });
      if (dbError) throw dbError;

      toast.success(t("attachment_uploaded"));
      qc.invalidateQueries({ queryKey: ["attachments", taskId] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const deleteAttachment = async (att: any) => {
    await supabase.storage.from("task-attachments").remove([att.storage_path]);
    await supabase.from("task_attachments").delete().eq("id", att.id);
    toast.success(t("attachment_deleted"));
    qc.invalidateQueries({ queryKey: ["attachments", taskId] });
  };

  const downloadAttachment = async (att: any) => {
    const { data } = await supabase.storage
      .from("task-attachments").createSignedUrl(att.storage_path, 60);
    if (data?.signedUrl) {
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    }
  };

  const openPreview = async (att: any) => {
    setLoadingId(att.id);
    const { data } = await supabase.storage
      .from("task-attachments").createSignedUrl(att.storage_path, 300); // 5-min URL for viewing
    setLoadingId(null);
    if (data?.signedUrl) setPreview({ att, url: data.signedUrl });
  };

  return (
    <>
    {preview && <AttachmentPreview preview={preview} onClose={() => setPreview(null)} />}
    <div className="border-t pt-4">
      <div className="flex items-center gap-2 mb-3">
        <Paperclip className="size-4" />
        <span className="text-sm font-medium">{t("attachments")}</span>
        {(attachments ?? []).length > 0 && (
          <span className="ms-auto text-xs text-muted-foreground">{(attachments ?? []).length}</span>
        )}
      </div>

      {/* Drop zone */}
      {canEdit && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            "border-2 border-dashed rounded-lg px-4 py-4 text-center cursor-pointer transition-colors mb-3",
            dragOver
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/50 hover:bg-muted/40"
          )}
        >
          <Upload className="size-4 mx-auto mb-1 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            {uploading ? t("uploading") : "Drop file or click to upload"}
          </p>
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">
            IMG · PDF · Word · Excel — max 20 MB
          </p>
          <input
            ref={fileInputRef} type="file" accept={ACCEPTED_TYPES} className="hidden"
            onChange={(e) => handleFiles(e.target.files)} disabled={uploading}
          />
        </div>
      )}

      {/* File list */}
      <div className="space-y-1.5">
        {(attachments ?? []).length === 0 && (
          <p className="text-xs text-muted-foreground italic py-1">{t("no_attachments")}</p>
        )}
        {(attachments ?? []).map((att: any) => (
          <div
            key={att.id}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-muted/40 hover:bg-muted/70 transition-colors group"
          >
            <div className="shrink-0">{getFileIcon(att.mime_type)}</div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{att.file_name}</p>
              <p className="text-[10px] text-muted-foreground">
                {formatBytes(att.file_size)}
                {att.uploader?.full_name && ` · ${att.uploader.full_name}`}
                {` · ${new Date(att.created_at).toLocaleDateString()}`}
              </p>
            </div>
            {/* Always-visible preview button on mobile; hover-reveal on desktop */}
            <div className="flex items-center gap-1 shrink-0 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => openPreview(att)}
                className="p-1 rounded hover:bg-background text-muted-foreground"
                title="Preview"
                disabled={loadingId === att.id}
              >
                {loadingId === att.id
                  ? <Loader2 className="size-3.5 animate-spin" />
                  : <Eye className="size-3.5" />
                }
              </button>
              <button
                onClick={() => downloadAttachment(att)}
                className="p-1 rounded hover:bg-background text-muted-foreground"
                title="Open / Download"
              >
                <Download className="size-3.5" />
              </button>
              {(canEdit || att.uploaded_by === userId) && (
                <button
                  onClick={() => deleteAttachment(att)}
                  className="p-1 rounded hover:bg-background text-destructive"
                  title="Delete"
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
    </>
  );
}

// ─── Shared task form ─────────────────────────────────────────────────────────

function TaskForm({ title, setTitle, desc, setDesc, priority, setPriority,
  assignee, setAssignee, dept, setDept, start, setStart, due, setDue,
  members, depts, busy, submitLabel, onSubmit }: any) {
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

// ─── New Task Dialog ──────────────────────────────────────────────────────────

function NewTaskDialog({ members, depts, userId, onCreated }: any) {
  const { t } = useI18n();
  const [title, setTitle] = useState("");     const [desc, setDesc] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [assignee, setAssignee] = useState(""); const [dept, setDept] = useState("");
  const [start, setStart] = useState("");       const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    const { error } = await supabase.from("tasks").insert({
      title, description: desc || null, priority,
      assignee_id: assignee || null, department_id: dept || null,
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
        dept={dept} setDept={setDept} start={start} setStart={setStart} due={due} setDue={setDue}
        members={members} depts={depts} busy={busy}
        submitLabel={busy ? t("creating") : t("create_task")} onSubmit={submit}
      />
    </DialogContent>
  );
}

// ─── Edit Task Dialog ─────────────────────────────────────────────────────────

function EditTaskDialog({ task, members, depts, onSaved }: any) {
  const { t } = useI18n();
  const [title, setTitle]       = useState(task.title);
  const [desc, setDesc]         = useState(task.description ?? "");
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [assignee, setAssignee] = useState(task.assignee_id ?? "");
  const [dept, setDept]         = useState(task.department_id ?? "");
  const [start, setStart]       = useState(task.start_date ?? "");
  const [due, setDue]           = useState(task.due_date ?? "");
  const [busy, setBusy]         = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    const { error } = await supabase.from("tasks").update({
      title, description: desc || null, priority,
      assignee_id: assignee || null, department_id: dept || null,
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
        dept={dept} setDept={setDept} start={start} setStart={setStart} due={due} setDue={setDue}
        members={members} depts={depts} busy={busy}
        submitLabel={busy ? t("saving") : t("save_changes")} onSubmit={submit}
      />
    </DialogContent>
  );
}

// ─── Meta cell (detail panel) ─────────────────────────────────────────────────

function MetaCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1 font-medium">{label}</div>
      <div className="text-sm">{children}</div>
    </div>
  );
}
