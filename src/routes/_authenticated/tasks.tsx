import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, MessageSquare, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/hooks/use-i18n";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  STATUS_ORDER, STATUS_BG,
  PRIORITY_LABEL, PriorityPill,
  useStatusLabel, usePriorityLabel,
} from "@/components/task-pills";
import type { TaskStatus, TaskPriority } from "@/components/task-pills";

export const Route = createFileRoute("/_authenticated/tasks")({
  component: TasksPage,
});

function TasksPage() {
  const { user, isAdmin } = useAuth();
  const { t } = useI18n();
  const statusLabel = useStatusLabel();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

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

  const canEditTask = (t: any) => isAdmin || t.assignee_id === user?.id;
  const detailTask = tasks?.find((t) => t.id === detailId);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("tasks")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("tasks_sub")}</p>
        </div>
        {isAdmin && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="size-4" />{t("new_task")}</Button>
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

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {STATUS_ORDER.map((s) => {
          const items = (tasks ?? []).filter((t) => t.status === s);
          return (
            <div key={s} className="flex flex-col">
              <div className="flex items-center gap-2 mb-3">
                <span className={`size-2.5 rounded-full ${STATUS_BG[s]}`} />
                <h3 className="text-sm font-medium">{statusLabel(s)}</h3>
                <span className="text-xs text-muted-foreground">{items.length}</span>
              </div>
              <div className="space-y-2 min-h-[100px]">
                {items.map((tk) => (
                  <Card
                    key={tk.id}
                    onClick={() => setDetailId(tk.id)}
                    className="p-3 cursor-pointer hover:shadow-sm transition-shadow"
                  >
                    <div className="text-sm font-medium leading-snug">{tk.title}</div>
                    <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                      <PriorityPill priority={tk.priority} />
                      {tk.due_date && <span>· {tk.due_date}</span>}
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground truncate">
                      {tk.assignee?.full_name ?? t("unassigned")} · {tk.department?.name ?? "—"}
                    </div>
                  </Card>
                ))}
                {items.length === 0 && (
                  <div className="text-xs text-muted-foreground/60 italic px-1">{t("empty")}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={!!detailId} onOpenChange={(o) => !o && setDetailId(null)}>
        {detailTask && (
          <TaskDetail
            task={detailTask}
            canEdit={canEditTask(detailTask)}
            isAdmin={isAdmin}
            userId={user?.id ?? ""}
            onStatusChange={(status) => updateStatus.mutate({ id: detailTask.id, status })}
            onDelete={() => deleteTask.mutate(detailTask.id)}
          />
        )}
      </Dialog>
    </div>
  );
}

function NewTaskDialog({
  members, depts, userId, onCreated,
}: {
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
  };

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader><DialogTitle>{t("new_task")}</DialogTitle></DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label>{t("title")}</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} />
        </div>
        <div className="space-y-1.5">
          <Label>{t("description")}</Label>
          <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} maxLength={2000} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>{t("priority")}</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
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
                {depts.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>{t("assignee")}</Label>
          <Select value={assignee} onValueChange={setAssignee}>
            <SelectTrigger><SelectValue placeholder={t("unassigned")} /></SelectTrigger>
            <SelectContent>
              {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.full_name ?? m.email}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>{t("start_date")}</Label>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("due_date")}</Label>
            <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
        </div>
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? t("creating") : t("create_task")}
        </Button>
      </form>
    </DialogContent>
  );
}

function TaskDetail({
  task, canEdit, isAdmin, userId, onStatusChange, onDelete,
}: {
  task: any; canEdit: boolean; isAdmin: boolean; userId: string;
  onStatusChange: (s: TaskStatus) => void; onDelete: () => void;
}) {
  const { t } = useI18n();
  const statusLabel = useStatusLabel();
  const qc = useQueryClient();
  const [comment, setComment] = useState("");

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
        <DialogTitle>{task.title}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        {task.description && (
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{task.description}</p>
        )}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-xs text-muted-foreground mb-1">{t("status")}</div>
            {canEdit ? (
              <Select value={task.status} onValueChange={(v) => onStatusChange(v as TaskStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_ORDER.map((s) => <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : <div>{statusLabel(task.status as TaskStatus)}</div>}
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">{t("priority")}</div>
            <PriorityPill priority={task.priority} />
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">{t("assignee")}</div>
            <div>{task.assignee?.full_name ?? t("unassigned")}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">{t("department")}</div>
            <div>{task.department?.name ?? "—"}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">{t("start")}</div>
            <div>{task.start_date ?? "—"}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">{t("due")}</div>
            <div>{task.due_date ?? "—"}</div>
          </div>
        </div>

        <div className="border-t pt-4">
          <div className="flex items-center gap-2 mb-3 text-sm font-medium">
            <MessageSquare className="size-4" /> {t("updates")}
          </div>
          <div className="space-y-3 mb-3">
            {(comments ?? []).map((c) => (
              <div key={c.id} className="text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{c.author?.full_name ?? "User"}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(c.created_at).toLocaleString()}
                  </span>
                </div>
                <div className="text-muted-foreground mt-0.5 whitespace-pre-wrap">{c.content}</div>
              </div>
            ))}
            {(comments ?? []).length === 0 && (
              <div className="text-xs text-muted-foreground italic">{t("no_updates")}</div>
            )}
          </div>
          <div className="flex gap-2">
            <Textarea value={comment} onChange={(e) => setComment(e.target.value)}
              placeholder={t("post_update")} rows={2} maxLength={1000} />
            <Button onClick={() => post.mutate()} disabled={!comment.trim() || post.isPending}>
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
