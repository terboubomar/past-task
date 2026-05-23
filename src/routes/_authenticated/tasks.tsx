import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useRef, useEffect } from "react";
import {
  Plus, MessageSquare, Trash2, Search,
  LayoutGrid, LayoutList, Table2, Pencil, CalendarClock, X,
  ChevronDown, ChevronRight, ChevronLeft, CalendarDays,
  Paperclip, Upload, FileText, FileImage, FileSpreadsheet, File, Download,
  Eye, Loader2, CheckSquare, Square, CheckCheck,
} from "lucide-react";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent, type DragOverEvent, DragOverlay, type DragStartEvent,
} from "@dnd-kit/core";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/hooks/use-i18n";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import { logActivity } from "@/lib/activity-log";
import { createNotification, parseMentions } from "@/lib/notify";
import { TemplatesDialog } from "@/components/TaskTemplates";
import type { Template } from "@/components/TaskTemplates";

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

type ViewMode = "table" | "board" | "list" | "cal";

// ─── Main page ────────────────────────────────────────────────────────────────

function TasksPage() {
  const { user, isAdmin } = useAuth();
  const { t } = useI18n();
  const statusLabel = useStatusLabel();
  const qc = useQueryClient();

  const actorName = user?.user_metadata?.full_name ?? user?.email ?? "Unknown";

  const [newOpen, setNewOpen]   = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editId, setEditId]     = useState<string | null>(null);
  const [view, setView]         = useState<ViewMode>("table");

  const [search, setSearch]               = useState("");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterStatus, setFilterStatus]   = useState("all");
  const [filterAssignee, setFilterAssignee] = useState("all");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Quick-add state
  const [quickAdd, setQuickAdd] = useState<{ status: TaskStatus; title: string } | null>(null);

  // Template state — holds the template to pre-fill into NewTaskDialog
  const [activeTemplate, setActiveTemplate] = useState<Template | null>(null);

  // ── Bulk selection ──────────────────────────────────────────────────────────
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggleSelect = (id: string) => setSelected(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const selectAll = (ids: string[]) => setSelected(new Set(ids));
  const clearSelection = () => setSelected(new Set());

  // ── Drag state (board) ──────────────────────────────────────────────────────
  const [dragActiveId, setDragActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

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

  // ── Real-time: subscribe to task changes ────────────────────────────────────
  useEffect(() => {
    const name = "tasks-realtime";
    // Remove stale channel before re-subscribing (React StrictMode safe)
    supabase.getChannels().forEach((ch) => {
      if (ch.topic === `realtime:${name}`) supabase.removeChannel(ch);
    });
    const channel = supabase
      .channel(name)
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "tasks" }, () => {
        qc.invalidateQueries({ queryKey: ["tasks"] });
      })
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "task_comments" }, (payload: any) => {
        if (payload.new?.task_id) qc.invalidateQueries({ queryKey: ["comments", payload.new.task_id] });
        if (payload.old?.task_id) qc.invalidateQueries({ queryKey: ["comments", payload.old.task_id] });
      })
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "task_attachments" }, (payload: any) => {
        const id = payload.new?.task_id ?? payload.old?.task_id;
        if (id) qc.invalidateQueries({ queryKey: ["attachments", id] });
      })
      .subscribe((status: string, err?: Error) => {
        if (err) console.warn("[tasks realtime]", err.message);
      });
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

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

  // Generic patch mutation
  const updateField = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await supabase.from("tasks").update(patch as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { id, patch }) => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      const task = tasks?.find((t) => t.id === id);
      const base = { actorId: user?.id ?? "", actorName, entityType: "task" as const, entityId: id, entityName: task?.title };
      if ("status" in patch)
        logActivity({ ...base, action: "task.status_changed", meta: { to: patch.status } });
      else if ("priority" in patch)
        logActivity({ ...base, action: "task.priority_changed", meta: { to: patch.priority } });
      else if ("assignee_id" in patch) {
        const assignee = members?.find((m: any) => m.id === patch.assignee_id);
        logActivity({ ...base, action: "task.assignee_changed", meta: { to: assignee?.full_name ?? assignee?.email ?? "Unassigned" } });
        // Notify the new assignee
        if (patch.assignee_id && typeof patch.assignee_id === "string") {
          createNotification({
            userId: patch.assignee_id,
            actorId: user?.id ?? "",
            actorName,
            type: "task.assigned",
            taskId: id,
            taskTitle: task?.title,
            message: `${actorName} assigned you to "${task?.title}"`,
          });
        }
      } else {
        logActivity({ ...base, action: "task.updated" });
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteTask = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, id) => {
      const task = tasks?.find((t) => t.id === id);
      logActivity({ actorId: user?.id ?? "", actorName, action: "task.deleted", entityType: "task", entityId: id, entityName: task?.title });
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
      return { title };
    },
    onSuccess: (data) => {
      logActivity({ actorId: user?.id ?? "", actorName, action: "task.created", entityType: "task", entityName: data?.title });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      setQuickAdd(null);
      toast.success(t("task_created"));
    },
    onError: (e) => toast.error(e.message),
  });

  // ── Bulk mutations ──────────────────────────────────────────────────────────
  const bulkUpdate = useMutation({
    mutationFn: async ({ ids, patch }: { ids: string[]; patch: Record<string, unknown> }) => {
      const { error } = await supabase.from("tasks").update(patch as any).in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      clearSelection();
      toast.success("Updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const bulkDelete = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from("tasks").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      clearSelection();
      toast.success("Deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  // ── Drag handlers (board) ───────────────────────────────────────────────────
  const handleDragStart = (e: DragStartEvent) => {
    setDragActiveId(e.active.id as string);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setDragActiveId(null);
    const { active, over } = e;
    if (!over) return;
    // over.id is either a task id or a status group id (prefixed "group-")
    const overId = over.id as string;
    const newStatus = overId.startsWith("group-")
      ? overId.replace("group-", "") as TaskStatus
      : (tasks?.find(t => t.id === overId)?.status as TaskStatus);
    if (!newStatus) return;
    const activeTask = tasks?.find(t => t.id === active.id);
    if (!activeTask || activeTask.status === newStatus) return;
    updateField.mutate({ id: active.id as string, patch: { status: newStatus } });
  };

  const toggleGroup = (s: string) => setCollapsedGroups((prev) => {
    const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n;
  });

  const detailTask = tasks?.find((tk) => tk.id === detailId);
  const editTask   = tasks?.find((tk) => tk.id === editId);
  const dragTask   = tasks?.find((tk) => tk.id === dragActiveId);
  const canEditTask = (tk: any) => isAdmin || tk.assignee_id === user?.id;
  const clearFilters = () => { setSearch(""); setFilterPriority("all"); setFilterStatus("all"); setFilterAssignee("all"); };

  const viewButtons = [
    { mode: "table" as ViewMode, icon: <Table2 className="size-4" />,       label: "Table"    },
    { mode: "board" as ViewMode, icon: <LayoutGrid className="size-4" />,   label: "Board"    },
    { mode: "list"  as ViewMode, icon: <LayoutList className="size-4" />,   label: "List"     },
    { mode: "cal"   as ViewMode, icon: <CalendarDays className="size-4" />, label: "Calendar" },
  ];

  const selectedArr = Array.from(selected);

  return (
    <div className="flex flex-col min-h-0 h-full">

      {/* ── Toolbar ── */}
      <div className="px-4 md:px-6 pt-4 md:pt-6 pb-3 border-b space-y-3 shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-semibold tracking-tight">{t("tasks")}</h1>
            <p className="text-xs text-muted-foreground mt-0.5">{filtered.length} {t("results")}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center border rounded-md overflow-hidden">
              {viewButtons.map(({ mode, icon }) => (
                <button key={mode} onClick={() => { setView(mode); clearSelection(); }}
                  className={cn("px-2.5 py-1.5 transition-colors",
                    view === mode ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"
                  )} aria-label={mode}
                >{icon}</button>
              ))}
            </div>
            {isAdmin && (
              <Dialog open={newOpen} onOpenChange={(o) => { setNewOpen(o); if (!o) setActiveTemplate(null); }}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="size-4" />
                    <span className="hidden sm:inline">{t("new_task")}</span>
                  </Button>
                </DialogTrigger>
                <NewTaskDialog
                  members={members ?? []} depts={depts ?? []} userId={user?.id ?? ""} actorName={actorName}
                  template={activeTemplate}
                  onCreated={() => { setNewOpen(false); setActiveTemplate(null); qc.invalidateQueries({ queryKey: ["tasks"] }); }}
                />
              </Dialog>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder={t("search_tasks")} className="ps-8 h-8 text-sm" />
          </div>
          <div className="flex gap-2 flex-wrap">
            {isAdmin && (
              <TemplatesDialog
                members={members ?? []}
                depts={depts ?? []}
                onUse={(tpl) => { setActiveTemplate(tpl); setNewOpen(true); }}
              />
            )}
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

      {/* ── Bulk Action Bar ─────────────────────────────────────────────── */}
      {selected.size > 0 && (
        <div className="px-4 md:px-6 py-2 bg-primary/5 border-b flex items-center gap-3 flex-wrap shrink-0">
          <span className="text-sm font-medium text-primary">{selected.size} selected</span>
          <div className="flex items-center gap-2 flex-wrap ms-auto">
            {/* Status */}
            <Select onValueChange={(v) => bulkUpdate.mutate({ ids: selectedArr, patch: { status: v } })}>
              <SelectTrigger className="h-7 text-xs w-36"><SelectValue placeholder="Set status…" /></SelectTrigger>
              <SelectContent>
                {STATUS_ORDER.map(s => <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>)}
              </SelectContent>
            </Select>
            {/* Priority */}
            <Select onValueChange={(v) => bulkUpdate.mutate({ ids: selectedArr, patch: { priority: v } })}>
              <SelectTrigger className="h-7 text-xs w-36"><SelectValue placeholder="Set priority…" /></SelectTrigger>
              <SelectContent>
                {(["critical","high","medium","low"] as TaskPriority[]).map(p => (
                  <SelectItem key={p} value={p}>{PRIORITY_LABEL[p]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Assignee */}
            <Select onValueChange={(v) => bulkUpdate.mutate({ ids: selectedArr, patch: { assignee_id: v === "__none" ? null : v } })}>
              <SelectTrigger className="h-7 text-xs w-36"><SelectValue placeholder="Assign to…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Unassign</SelectItem>
                {(members ?? []).map((m: any) => (
                  <SelectItem key={m.id} value={m.id}>{m.full_name ?? m.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isAdmin && (
              <Button variant="destructive" size="sm" className="h-7 text-xs"
                onClick={() => { if (confirm(`Delete ${selected.size} tasks?`)) bulkDelete.mutate(selectedArr); }}>
                <Trash2 className="size-3" /> Delete
              </Button>
            )}
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={clearSelection}>
              <X className="size-3" /> Clear
            </Button>
          </div>
        </div>
      )}

      {/* ── Views ── */}
      <div className="flex-1 overflow-auto px-4 md:px-6 py-4">

        {/* ── TABLE VIEW ── */}
        {view === "table" && (
          <div className="rounded-lg border overflow-hidden">
            <div className="hidden md:grid grid-cols-[2rem_2.5fr_1fr_1fr_1.2fr_1fr_1fr] bg-muted/50 border-b text-[11px] font-semibold text-muted-foreground uppercase tracking-wider select-none">
              <div className="px-2 py-2.5 flex items-center">
                <Checkbox
                  checked={filtered.length > 0 && filtered.every(tk => selected.has(tk.id))}
                  onCheckedChange={(v) => v ? selectAll(filtered.map(tk => tk.id)) : clearSelection()}
                />
              </div>
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
                      {collapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
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
                          selected={selected.has(tk.id)}
                          onSelect={() => toggleSelect(tk.id)}
                          onClick={() => setDetailId(tk.id)}
                          onUpdate={(patch) => updateField.mutate({ id: tk.id, patch })}
                        />
                      ))}

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
                              if (e.key === "Enter" && quickAdd.title.trim())
                                quickAddTask.mutate({ title: quickAdd.title.trim(), status: s });
                              if (e.key === "Escape") setQuickAdd(null);
                            }}
                          />
                          <button onClick={() => setQuickAdd(null)} className="text-muted-foreground hover:text-foreground p-1 rounded">
                            <X className="size-3.5" />
                          </button>
                        </div>
                      ) : isAdmin && (
                        <button
                          onClick={() => setQuickAdd({ status: s, title: "" })}
                          className="w-full flex items-center gap-2 px-4 py-2 border-b last:border-b-0 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
                        >
                          <Plus className="size-3.5" /> {t("new_task")}
                        </button>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── BOARD VIEW (with DnD) ── */}
        {view === "board" && (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="-mx-4 md:mx-0">
              <div className="flex gap-3 overflow-x-auto px-4 md:px-0 pb-4 snap-x snap-mandatory md:grid md:grid-cols-4 md:overflow-visible">
                {STATUS_ORDER.map((s) => {
                  const items = filtered.filter((tk) => tk.status === s);
                  return (
                    <DroppableColumn key={s} status={s as TaskStatus} label={statusLabel(s)} count={items.length}>
                      {items.map((tk) => (
                        <DraggableBoardCard
                          key={tk.id}
                          task={tk}
                          isDragging={dragActiveId === tk.id}
                          onClick={() => setDetailId(tk.id)}
                        />
                      ))}
                      {items.length === 0 && (
                        <div className="text-xs text-muted-foreground/50 italic py-4 text-center border border-dashed rounded-lg">
                          {t("empty")}
                        </div>
                      )}
                      {isAdmin && (
                        <button
                          onClick={() => { setQuickAdd({ status: s as TaskStatus, title: "" }); setView("table"); }}
                          className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1.5"
                        >
                          <Plus className="size-3.5" /> {t("new_task")}
                        </button>
                      )}
                    </DroppableColumn>
                  );
                })}
              </div>
            </div>
            <DragOverlay>
              {dragTask && <BoardCard task={dragTask} onClick={() => {}} className="shadow-2xl rotate-1 opacity-95" />}
            </DragOverlay>
          </DndContext>
        )}

        {/* ── LIST VIEW ── */}
        {view === "list" && (
          <div className="space-y-2">
            {filtered.length === 0 && (
              <div className="py-16 text-center text-sm text-muted-foreground">{t("empty")}</div>
            )}
            {filtered.map((tk) => (
              <Card key={tk.id} onClick={() => setDetailId(tk.id)}
                className={cn(
                  "px-4 py-3 cursor-pointer hover:shadow-sm transition-shadow flex items-center gap-3 border-s-4",
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
                  <button onClick={(e) => { e.stopPropagation(); setEditId(tk.id); }}
                    className="p-1.5 rounded hover:bg-muted text-muted-foreground shrink-0">
                    <Pencil className="size-3.5" />
                  </button>
                )}
              </Card>
            ))}
          </div>
        )}
        {/* ── CALENDAR VIEW ── */}
        {view === "cal" && (
          <CalendarView tasks={filtered} onTaskClick={(id) => setDetailId(id)} />
        )}

      </div>

      {/* ── SIDE PANEL ── */}
      <Sheet open={!!detailId} onOpenChange={(o) => !o && setDetailId(null)}>
        {detailTask && (
          <SheetContent side="right" className="w-full sm:max-w-xl !p-0 flex flex-col overflow-hidden">
            <TaskDetail
              task={detailTask}
              canEdit={canEditTask(detailTask)}
              isAdmin={isAdmin}
              userId={user?.id ?? ""}
              actorName={actorName}
              members={members ?? []}
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

// ─── Droppable Board Column ───────────────────────────────────────────────────

import { useDroppable } from "@dnd-kit/core";

function DroppableColumn({ status, label, count, children }: {
  status: TaskStatus; label: string; count: number; children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `group-${status}` });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col shrink-0 w-72 md:w-auto snap-start rounded-lg transition-colors p-2",
        isOver && "bg-primary/5 ring-2 ring-primary/20"
      )}
    >
      <div className="flex items-center gap-2 mb-3 px-1">
        <span className={cn("size-3 rounded-sm shrink-0", STATUS_SQUARE[status])} />
        <span className={cn("text-sm font-semibold", STATUS_LABEL_COLOR[status])}>{label}</span>
        <span className="text-xs text-muted-foreground ms-auto">{count}</span>
      </div>
      <div className="space-y-2 min-h-[80px] flex-1">{children}</div>
    </div>
  );
}

// ─── Draggable Board Card ─────────────────────────────────────────────────────

import { useDraggable } from "@dnd-kit/core";

function DraggableBoardCard({ task, isDragging, onClick }: {
  task: any; isDragging: boolean; onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: task.id });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <BoardCard task={task} onClick={onClick} className={cn(isDragging && "opacity-40")} />
    </div>
  );
}

// ─── Board card ───────────────────────────────────────────────────────────────

function BoardCard({ task, onClick, className }: { task: any; onClick: () => void; className?: string }) {
  const { t } = useI18n();
  const overdue = isOverdue(task.due_date, task.status);
  const topColor =
    task.status === "not_started" ? "#9ca3af" :
    task.status === "working"     ? "#3b82f6" :
    task.status === "stuck"       ? "#ef4444" : "#22c55e";

  return (
    <Card
      onClick={onClick}
      className={cn("p-3 cursor-pointer hover:shadow-md transition-all active:scale-[0.99] border-t-2", className)}
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

// ─── Monday-style table row ───────────────────────────────────────────────────

function MondayRow({ task, members, canEdit, selected, onSelect, onClick, onUpdate }: {
  task: any; members: any[]; canEdit: boolean; selected: boolean;
  onSelect: () => void; onClick: () => void; onUpdate: (patch: Record<string, unknown>) => void;
}) {
  const { t } = useI18n();
  const statusLabel = useStatusLabel();
  const overdue = isOverdue(task.due_date, task.status as TaskStatus);

  return (
    <div className={cn(
      "group grid grid-cols-1 md:grid-cols-[2rem_2.5fr_1fr_1fr_1.2fr_1fr_1fr] border-b last:border-b-0 hover:bg-muted/25 transition-colors",
      selected && "bg-primary/5"
    )}>
      {/* Checkbox */}
      <div className="hidden md:flex px-2 py-2.5 items-center" onClick={(e) => e.stopPropagation()}>
        <Checkbox checked={selected} onCheckedChange={onSelect} />
      </div>

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

      {/* Status */}
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
                  <button key={s} onClick={() => onUpdate({ status: s })}
                    className={cn("w-full text-start px-2 py-1.5 rounded text-xs hover:bg-muted transition-colors flex items-center gap-2", s === task.status && "bg-muted")}
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

      {/* Priority */}
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
                {(["critical","high","medium","low"] as TaskPriority[]).map((p) => (
                  <button key={p} onClick={() => onUpdate({ priority: p })}
                    className={cn("w-full text-start px-2 py-1.5 rounded text-xs hover:bg-muted transition-colors flex items-center gap-2", p === task.priority && "bg-muted")}
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

      {/* Assignee */}
      <div className="hidden md:flex px-3 py-2.5 items-center" onClick={(e) => e.stopPropagation()}>
        {canEdit ? (
          <Popover>
            <PopoverTrigger asChild>
              <button className="text-sm text-muted-foreground hover:text-foreground transition-colors truncate max-w-[130px] text-start focus-visible:outline-none">
                {task.assignee?.full_name ?? <span className="italic text-muted-foreground/50">{t("unassigned")}</span>}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-1" align="start">
              <div className="space-y-0.5 max-h-52 overflow-y-auto">
                <button onClick={() => onUpdate({ assignee_id: null })}
                  className={cn("w-full text-start px-2 py-1.5 rounded text-xs hover:bg-muted transition-colors italic text-muted-foreground", !task.assignee_id && "bg-muted")}>
                  {t("unassigned")}
                </button>
                {members.map((m: any) => (
                  <button key={m.id} onClick={() => onUpdate({ assignee_id: m.id })}
                    className={cn("w-full text-start px-2 py-1.5 rounded text-xs hover:bg-muted transition-colors flex items-center gap-2", m.id === task.assignee_id && "bg-muted")}
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
        ) : <span className="text-sm text-muted-foreground truncate">{task.assignee?.full_name ?? t("unassigned")}</span>}
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

// ─── Task Detail (side-panel body) ───────────────────────────────────────────

function TaskDetail({ task, canEdit, isAdmin, userId, actorName, members, onStatusChange, onDelete, onEdit }: {
  task: any; canEdit: boolean; isAdmin: boolean; userId: string; actorName: string; members: any[];
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
    onSuccess: () => {
      logActivity({ actorId: userId, actorName, action: "comment.posted", entityType: "task", entityId: task.id, entityName: task.title });

      // Notify task assignee (if not the commenter)
      if (task.assignee_id && task.assignee_id !== userId) {
        createNotification({
          userId: task.assignee_id,
          actorId: userId,
          actorName,
          type: "comment.posted",
          taskId: task.id,
          taskTitle: task.title,
          message: `${actorName} commented on "${task.title}"`,
        });
      }

      // Notify @mentioned users
      const mentionedIds = parseMentions(comment, members);
      mentionedIds.forEach((mid) => {
        if (mid !== userId && mid !== task.assignee_id) { // avoid duplicates
          createNotification({
            userId: mid,
            actorId: userId,
            actorName,
            type: "mention",
            taskId: task.id,
            taskTitle: task.title,
            message: `${actorName} mentioned you in "${task.title}"`,
          });
        }
      });

      setComment("");
      qc.invalidateQueries({ queryKey: ["comments", task.id] });
    },
    onError: (e) => toast.error(e.message),
  });

  const leftBarColor =
    task.status === "not_started" ? "border-s-gray-400" :
    task.status === "working"     ? "border-s-blue-500" :
    task.status === "stuck"       ? "border-s-red-500"  : "border-s-green-500";

  return (
    <>
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

      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
        {task.description && (
          <p className="text-sm text-muted-foreground whitespace-pre-wrap bg-muted/40 rounded-lg p-3 leading-relaxed">
            {task.description}
          </p>
        )}

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
          <MetaCell label={t("assignee")}><span className="font-medium">{task.assignee?.full_name ?? t("unassigned")}</span></MetaCell>
          <MetaCell label={t("department")}>{task.department?.name ?? "—"}</MetaCell>
          <MetaCell label={t("start")}>{task.start_date ?? "—"}</MetaCell>
          <MetaCell label={t("due")}>
            <span className={overdue ? "text-destructive font-medium" : ""}>{task.due_date ?? "—"}</span>
          </MetaCell>
        </div>

        {/* ── Checklist ── */}
        <TaskChecklist taskId={task.id} canEdit={canEdit} />

        {/* Attachments */}
        <TaskAttachments taskId={task.id} userId={userId} actorName={actorName} canEdit={canEdit} />

        {/* Comments */}
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
                  <span className="text-xs text-muted-foreground ms-auto">{new Date(c.created_at).toLocaleString()}</span>
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
              value={comment} onChange={(e) => setComment(e.target.value)}
              placeholder={t("post_update")} rows={2} maxLength={1000}
              className="text-sm resize-none"
              onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && comment.trim()) post.mutate(); }}
            />
            <Button onClick={() => post.mutate()} disabled={!comment.trim() || post.isPending} className="self-end h-9">
              {t("post")}
            </Button>
          </div>
        </div>

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

// ─── Checklist ────────────────────────────────────────────────────────────────

function TaskChecklist({ taskId, canEdit }: { taskId: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const [newItem, setNewItem] = useState("");
  const [adding, setAdding]   = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: items } = useQuery({
    queryKey: ["checklist", taskId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("task_checklists")
        .select("*")
        .eq("task_id", taskId)
        .order("position", { ascending: true });
      return (data ?? []) as { id: string; text: string; completed: boolean; position: number }[];
    },
  });

  const done  = (items ?? []).filter(i => i.completed).length;
  const total = (items ?? []).length;
  const pct   = total > 0 ? Math.round((done / total) * 100) : 0;

  const addItem = async () => {
    if (!newItem.trim()) return;
    await (supabase as any).from("task_checklists").insert({
      task_id: taskId, text: newItem.trim(), completed: false, position: total,
    });
    setNewItem("");
    qc.invalidateQueries({ queryKey: ["checklist", taskId] });
  };

  const toggleItem = async (id: string, completed: boolean) => {
    await (supabase as any).from("task_checklists").update({ completed }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["checklist", taskId] });
  };

  const deleteItem = async (id: string) => {
    await (supabase as any).from("task_checklists").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["checklist", taskId] });
  };

  useEffect(() => { if (adding) inputRef.current?.focus(); }, [adding]);

  return (
    <div className="border-t pt-4">
      <div className="flex items-center gap-2 mb-2">
        <CheckSquare className="size-4" />
        <span className="text-sm font-medium">Checklist</span>
        {total > 0 && (
          <span className="ms-auto text-xs text-muted-foreground">{done}/{total}</span>
        )}
      </div>

      {total > 0 && (
        <div className="h-1.5 rounded-full bg-muted mb-3 overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", pct === 100 ? "bg-green-500" : "bg-primary")}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      <div className="space-y-1 mb-2">
        {(items ?? []).map((item) => (
          <div key={item.id} className="flex items-center gap-2 group px-1 py-0.5 rounded hover:bg-muted/40">
            <Checkbox
              checked={item.completed}
              onCheckedChange={(v) => toggleItem(item.id, !!v)}
              disabled={!canEdit}
            />
            <span className={cn("text-sm flex-1", item.completed && "line-through text-muted-foreground")}>
              {item.text}
            </span>
            {canEdit && (
              <button
                onClick={() => deleteItem(item.id)}
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-all"
              >
                <X className="size-3" />
              </button>
            )}
          </div>
        ))}
      </div>

      {canEdit && (
        adding ? (
          <div className="flex items-center gap-2">
            <Input
              ref={inputRef}
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              placeholder="Add item…"
              className="h-7 text-sm flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter") addItem();
                if (e.key === "Escape") { setAdding(false); setNewItem(""); }
              }}
            />
            <Button size="sm" className="h-7 text-xs px-2" onClick={addItem} disabled={!newItem.trim()}>Add</Button>
            <button onClick={() => { setAdding(false); setNewItem(""); }} className="text-muted-foreground hover:text-foreground p-1">
              <X className="size-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
          >
            <Plus className="size-3.5" /> Add item
          </button>
        )
      )}
    </div>
  );
}

// ─── Attachments ──────────────────────────────────────────────────────────────

type PreviewState = { att: any; url: string };

function AttachmentPreview({ preview, onClose }: { preview: PreviewState; onClose: () => void }) {
  const isImage  = preview.att.mime_type.startsWith("image/");
  const isPdf    = preview.att.mime_type === "application/pdf";
  const viewerUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(preview.url)}&embedded=true`;

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-black/90" onClick={onClose}>
      <div className="flex items-center gap-3 px-4 py-3 bg-black/60 backdrop-blur shrink-0" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm text-white font-medium truncate flex-1">{preview.att.file_name}</p>
        <button onClick={() => window.open(preview.url, "_blank", "noopener,noreferrer")}
          className="p-1.5 rounded hover:bg-white/10 text-white/70 hover:text-white transition-colors" title="Open / Download">
          <Download className="size-4" />
        </button>
        <button onClick={onClose} className="p-1.5 rounded hover:bg-white/10 text-white/70 hover:text-white transition-colors" title="Close">
          <X className="size-4" />
        </button>
      </div>
      <div className="flex-1 flex items-center justify-center p-4 min-h-0" onClick={(e) => e.stopPropagation()}>
        {isImage && <img src={preview.url} alt={preview.att.file_name} className="max-w-full max-h-full object-contain rounded shadow-2xl" />}
        {isPdf && <iframe src={preview.url} title={preview.att.file_name} className="w-full h-full rounded bg-white" />}
        {!isImage && !isPdf && <iframe src={viewerUrl} title={preview.att.file_name} className="w-full h-full rounded bg-white" />}
      </div>
    </div>
  );
}

function TaskAttachments({ taskId, userId, actorName, canEdit }: { taskId: string; userId: string; actorName: string; canEdit: boolean }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver]   = useState(false);
  const [preview, setPreview]     = useState<PreviewState | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const { data: attachments } = useQuery({
    queryKey: ["attachments", taskId],
    queryFn: async () => {
      const { data } = await supabase
        .from("task_attachments")
        .select("*, uploader:profiles!task_attachments_uploaded_by_fkey(full_name)")
        .eq("task_id", taskId).order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (file.size > MAX_FILE_SIZE) { toast.error(`File too large. Max ${formatBytes(MAX_FILE_SIZE)}`); return; }
    setUploading(true);
    try {
      const ext  = file.name.split(".").pop();
      const path = `${taskId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("task-attachments").upload(path, file, { contentType: file.type });
      if (uploadError) throw uploadError;
      const { error: dbError } = await supabase.from("task_attachments").insert({
        task_id: taskId, uploaded_by: userId, file_name: file.name,
        file_size: file.size, mime_type: file.type, storage_path: path,
      });
      if (dbError) throw dbError;
      logActivity({ actorId: userId, actorName, action: "attachment.uploaded", entityType: "attachment", entityId: taskId, meta: { file: file.name, task: taskId } });
      toast.success(t("attachment_uploaded"));
      qc.invalidateQueries({ queryKey: ["attachments", taskId] });
    } catch (e: any) { toast.error(e.message); }
    finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ""; }
  };

  const deleteAttachment = async (att: any) => {
    await supabase.storage.from("task-attachments").remove([att.storage_path]);
    await supabase.from("task_attachments").delete().eq("id", att.id);
    logActivity({ actorId: userId, actorName, action: "attachment.deleted", entityType: "attachment", entityId: taskId, meta: { file: att.file_name, task: taskId } });
    toast.success(t("attachment_deleted"));
    qc.invalidateQueries({ queryKey: ["attachments", taskId] });
  };

  const downloadAttachment = async (att: any) => {
    const { data } = await supabase.storage.from("task-attachments").createSignedUrl(att.storage_path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const openPreview = async (att: any) => {
    setLoadingId(att.id);
    const { data } = await supabase.storage.from("task-attachments").createSignedUrl(att.storage_path, 300);
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
          {(attachments ?? []).length > 0 && <span className="ms-auto text-xs text-muted-foreground">{(attachments ?? []).length}</span>}
        </div>
        {canEdit && (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "border-2 border-dashed rounded-lg px-4 py-4 text-center cursor-pointer transition-colors mb-3",
              dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/40"
            )}
          >
            <Upload className="size-4 mx-auto mb-1 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">{uploading ? t("uploading") : "Drop file or click to upload"}</p>
            <p className="text-[10px] text-muted-foreground/60 mt-0.5">IMG · PDF · Word · Excel — max 20 MB</p>
            <input ref={fileInputRef} type="file" accept={ACCEPTED_TYPES} className="hidden"
              onChange={(e) => handleFiles(e.target.files)} disabled={uploading} />
          </div>
        )}
        <div className="space-y-1.5">
          {(attachments ?? []).length === 0 && <p className="text-xs text-muted-foreground italic py-1">{t("no_attachments")}</p>}
          {(attachments ?? []).map((att: any) => (
            <div key={att.id} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-muted/40 hover:bg-muted/70 transition-colors group">
              <div className="shrink-0">{getFileIcon(att.mime_type)}</div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{att.file_name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {formatBytes(att.file_size)}
                  {att.uploader?.full_name && ` · ${att.uploader.full_name}`}
                  {` · ${new Date(att.created_at).toLocaleDateString()}`}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                <button onClick={() => openPreview(att)} className="p-1 rounded hover:bg-background text-muted-foreground" title="Preview" disabled={loadingId === att.id}>
                  {loadingId === att.id ? <Loader2 className="size-3.5 animate-spin" /> : <Eye className="size-3.5" />}
                </button>
                <button onClick={() => downloadAttachment(att)} className="p-1 rounded hover:bg-background text-muted-foreground" title="Open / Download">
                  <Download className="size-3.5" />
                </button>
                {(canEdit || att.uploaded_by === userId) && (
                  <button onClick={() => deleteAttachment(att)} className="p-1 rounded hover:bg-background text-destructive" title="Delete">
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

function NewTaskDialog({ members, depts, userId, actorName, template, onCreated }: any) {
  const { t } = useI18n();
  const qc = useQueryClient();

  // Pre-fill from template when it changes
  const offsetDate = (days: number | null) => {
    if (!days) return "";
    const d = new Date(); d.setDate(d.getDate() + days);
    return d.toISOString().split("T")[0];
  };

  const [title, setTitle]       = useState(template?.name ? `[${template.name}] ` : "");
  const [desc, setDesc]         = useState(template?.description ?? "");
  const [priority, setPriority] = useState<TaskPriority>(template?.priority ?? "medium");
  const [assignee, setAssignee] = useState(template?.assignee_id ?? "");
  const [dept, setDept]         = useState(template?.department_id ?? "");
  const [start, setStart]       = useState(offsetDate(template?.start_offset_days));
  const [due, setDue]           = useState(offsetDate(template?.due_offset_days));
  const [busy, setBusy]         = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    const { data, error } = await supabase.from("tasks").insert({
      title, description: desc || null, priority,
      assignee_id: assignee || null, department_id: dept || null,
      start_date: start || null, due_date: due || null, created_by: userId,
    }).select("id").single();
    setBusy(false);
    if (error) return toast.error(error.message);

    // Insert checklist items from template
    if (data?.id && template?.checklist_items?.length > 0) {
      await (supabase as any).from("task_checklists").insert(
        template.checklist_items.map((item: any, i: number) => ({
          task_id: data.id, text: item.text, completed: false, position: i,
        }))
      );
      qc.invalidateQueries({ queryKey: ["checklist", data.id] });
    }

    logActivity({ actorId: userId, actorName, action: "task.created", entityType: "task", entityName: title });
    if (assignee && assignee !== userId) {
      createNotification({
        userId: assignee, actorId: userId, actorName,
        type: "task.assigned", taskId: data?.id, taskTitle: title,
        message: `${actorName} assigned you to "${title}"`,
      });
    }
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

// ─── Calendar View ────────────────────────────────────────────────────────────

function getCalendarDays(year: number, month: number) {
  const firstDay   = new Date(year, month, 1);
  const lastDay    = new Date(year, month + 1, 0);
  const startPad   = firstDay.getDay(); // 0=Sun
  const days: { date: Date; current: boolean }[] = [];

  for (let i = startPad - 1; i >= 0; i--)
    days.push({ date: new Date(year, month, -i), current: false });
  for (let d = 1; d <= lastDay.getDate(); d++)
    days.push({ date: new Date(year, month, d), current: true });
  const remaining = 42 - days.length;
  for (let i = 1; i <= remaining; i++)
    days.push({ date: new Date(year, month + 1, i), current: false });

  return days;
}

function CalendarView({ tasks, onTaskClick }: { tasks: any[]; onTaskClick: (id: string) => void }) {
  const [year, setYear]   = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth());

  const days = useMemo(() => getCalendarDays(year, month), [year, month]);

  const tasksByDate = useMemo(() => {
    const map: Record<string, any[]> = {};
    tasks.forEach((tk) => {
      if (tk.due_date) {
        if (!map[tk.due_date]) map[tk.due_date] = [];
        map[tk.due_date].push(tk);
      }
    });
    return map;
  }, [tasks]);

  const today = new Date().toISOString().split("T")[0];

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  };
  const goToday = () => { setYear(new Date().getFullYear()); setMonth(new Date().getMonth()); };

  const monthLabel = new Date(year, month).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="space-y-3">
      {/* Month nav */}
      <div className="flex items-center justify-between">
        <button onClick={prevMonth} className="p-1.5 rounded hover:bg-muted transition-colors">
          <ChevronLeft className="size-4" />
        </button>
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold">{monthLabel}</span>
          <button
            onClick={goToday}
            className="text-xs text-muted-foreground hover:text-foreground border rounded px-2 py-0.5 transition-colors"
          >
            Today
          </button>
        </div>
        <button onClick={nextMonth} className="p-1.5 rounded hover:bg-muted transition-colors">
          <ChevronRight className="size-4" />
        </button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 text-center">
        {DAYS_OF_WEEK.map((d) => (
          <div key={d} className="text-[11px] font-semibold text-muted-foreground py-1">{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 border-l border-t rounded-lg overflow-hidden">
        {days.map(({ date, current }, i) => {
          const key      = date.toISOString().split("T")[0];
          const dayTasks = tasksByDate[key] ?? [];
          const isToday  = key === today;
          const isPast   = key < today && current;

          return (
            <div
              key={i}
              className={cn(
                "border-r border-b min-h-[90px] p-1.5",
                !current && "bg-muted/20",
                isToday  && "bg-primary/5"
              )}
            >
              {/* Day number */}
              <div className={cn(
                "text-xs font-medium mb-1 size-6 flex items-center justify-center rounded-full",
                isToday  ? "bg-primary text-primary-foreground" :
                !current ? "text-muted-foreground/40" :
                isPast   ? "text-muted-foreground" : "text-foreground"
              )}>
                {date.getDate()}
              </div>

              {/* Task chips */}
              <div className="space-y-0.5">
                {dayTasks.slice(0, 3).map((tk) => (
                  <button
                    key={tk.id}
                    onClick={() => onTaskClick(tk.id)}
                    className={cn(
                      "w-full text-start text-[10px] px-1.5 py-0.5 rounded truncate font-medium transition-opacity hover:opacity-80",
                      tk.status === "done"    ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400" :
                      isPast                  ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400" :
                      tk.status === "working" ? "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400" :
                      tk.status === "stuck"   ? "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400" :
                                               "bg-muted text-muted-foreground"
                    )}
                  >
                    {tk.title}
                  </button>
                ))}
                {dayTasks.length > 3 && (
                  <p className="text-[9px] text-muted-foreground px-1">+{dayTasks.length - 3} more</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-[10px] text-muted-foreground pt-1 flex-wrap">
        <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-blue-500 inline-block" /> Working</span>
        <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-green-500 inline-block" /> Done</span>
        <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-orange-400 inline-block" /> Stuck</span>
        <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-red-500 inline-block" /> Overdue</span>
        <span className="flex items-center gap-1"><span className="size-2 rounded bg-muted inline-block" /> Not started</span>
      </div>
    </div>
  );
}

// ─── Meta cell ────────────────────────────────────────────────────────────────

function MetaCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1 font-medium">{label}</div>
      <div className="text-sm">{children}</div>
    </div>
  );
}
