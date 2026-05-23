import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Pencil, CheckSquare, LayoutTemplate, X, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
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
import { PRIORITY_BG, PRIORITY_LABEL } from "@/components/task-pills";
import type { TaskPriority } from "@/components/task-pills";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChecklistItem { text: string }

export interface Template {
  id: string;
  created_at: string;
  name: string;
  description: string | null;
  priority: TaskPriority;
  department_id: string | null;
  assignee_id: string | null;
  checklist_items: ChecklistItem[];
  due_offset_days: number | null;
  start_offset_days: number | null;
}

interface Props {
  members: any[];
  depts: any[];
  onUse: (tpl: Template) => void;
}

// ─── Empty form state ─────────────────────────────────────────────────────────

const emptyForm = () => ({
  name: "",
  description: "",
  priority: "medium" as TaskPriority,
  department_id: "",
  assignee_id: "",
  due_offset_days: "",
  start_offset_days: "",
  checklist_items: [] as ChecklistItem[],
});

// ─── Component ────────────────────────────────────────────────────────────────

export function TemplatesDialog({ members, depts, onUse }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [view, setView]   = useState<"list" | "form">("list");
  const [editing, setEditing] = useState<Template | null>(null);
  const [form, setForm]   = useState(emptyForm());
  const [newItem, setNewItem] = useState("");

  const { data: templates } = useQuery({
    queryKey: ["templates"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("task_templates")
        .select("*")
        .order("created_at", { ascending: false });
      return (data ?? []) as Template[];
    },
    enabled: open,
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name:              form.name.trim(),
        description:       form.description.trim() || null,
        priority:          form.priority,
        department_id:     form.department_id || null,
        assignee_id:       form.assignee_id   || null,
        due_offset_days:   form.due_offset_days   ? Number(form.due_offset_days)   : null,
        start_offset_days: form.start_offset_days ? Number(form.start_offset_days) : null,
        checklist_items:   form.checklist_items,
        created_by:        user?.id ?? null,
      };
      if (editing) {
        const { error } = await (supabase as any).from("task_templates").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("task_templates").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["templates"] });
      toast.success(editing ? "Template updated" : "Template created");
      backToList();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("task_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["templates"] }); toast.success("Template deleted"); },
    onError: (e: any) => toast.error(e.message),
  });

  const backToList = () => { setView("list"); setEditing(null); setForm(emptyForm()); setNewItem(""); };

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setView("form"); };

  const openEdit = (tpl: Template) => {
    setEditing(tpl);
    setForm({
      name:              tpl.name,
      description:       tpl.description ?? "",
      priority:          tpl.priority,
      department_id:     tpl.department_id ?? "",
      assignee_id:       tpl.assignee_id   ?? "",
      due_offset_days:   tpl.due_offset_days   != null ? String(tpl.due_offset_days)   : "",
      start_offset_days: tpl.start_offset_days != null ? String(tpl.start_offset_days) : "",
      checklist_items:   tpl.checklist_items ?? [],
    });
    setView("form");
  };

  const addChecklistItem = () => {
    if (!newItem.trim()) return;
    setForm(f => ({ ...f, checklist_items: [...f.checklist_items, { text: newItem.trim() }] }));
    setNewItem("");
  };

  const removeChecklistItem = (i: number) =>
    setForm(f => ({ ...f, checklist_items: f.checklist_items.filter((_, idx) => idx !== i) }));

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) backToList(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <LayoutTemplate className="size-4" />
          <span className="hidden sm:inline">Templates</span>
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {view === "form" && (
              <button onClick={backToList} className="p-1 rounded hover:bg-muted text-muted-foreground">
                <ChevronRight className="size-4 rotate-180" />
              </button>
            )}
            {view === "list" ? "Task Templates" : editing ? "Edit Template" : "New Template"}
          </DialogTitle>
        </DialogHeader>

        {/* ── LIST ── */}
        {view === "list" && (
          <div className="space-y-3">
            <Button size="sm" className="w-full" onClick={openCreate}>
              <Plus className="size-4" /> Create Template
            </Button>

            {(templates ?? []).length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                <LayoutTemplate className="size-8 mx-auto mb-2 opacity-20" />
                No templates yet. Create one to get started.
              </div>
            ) : (
              <div className="space-y-2">
                {(templates ?? []).map((tpl) => (
                  <div key={tpl.id} className="rounded-lg border p-3 hover:bg-muted/30 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">{tpl.name}</span>
                          <span className={cn(
                            "text-[10px] font-semibold px-1.5 py-0.5 rounded-full",
                            PRIORITY_BG[tpl.priority],
                            "text-white"
                          )}>
                            {PRIORITY_LABEL[tpl.priority]}
                          </span>
                        </div>
                        {tpl.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">{tpl.description}</p>
                        )}
                        <div className="flex items-center gap-3 mt-1.5">
                          {(tpl.checklist_items ?? []).length > 0 && (
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <CheckSquare className="size-3" />
                              {tpl.checklist_items.length} items
                            </span>
                          )}
                          {tpl.due_offset_days != null && (
                            <span className="text-[10px] text-muted-foreground">
                              Due in {tpl.due_offset_days}d
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button size="sm" className="h-7 text-xs" onClick={() => { onUse(tpl); setOpen(false); }}>
                          Use
                        </Button>
                        <button onClick={() => openEdit(tpl)} className="p-1.5 rounded hover:bg-muted text-muted-foreground">
                          <Pencil className="size-3.5" />
                        </button>
                        <button
                          onClick={() => { if (confirm("Delete this template?")) del.mutate(tpl.id); }}
                          className="p-1.5 rounded hover:bg-muted text-destructive"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── FORM ── */}
        {view === "form" && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Template name *</Label>
              <Input
                placeholder="e.g. Bug Fix Process"
                value={form.name}
                onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                maxLength={100}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                placeholder="What is this template for?"
                value={form.description}
                onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                rows={2}
                maxLength={500}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Default priority</Label>
                <Select value={form.priority} onValueChange={(v) => setForm(f => ({ ...f, priority: v as TaskPriority }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(["critical","high","medium","low"] as TaskPriority[]).map(p => (
                      <SelectItem key={p} value={p}>{PRIORITY_LABEL[p]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Default department</Label>
                <Select value={form.department_id} onValueChange={(v) => setForm(f => ({ ...f, department_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {depts.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Default assignee</Label>
                <Select value={form.assignee_id} onValueChange={(v) => setForm(f => ({ ...f, assignee_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {members.map((m: any) => <SelectItem key={m.id} value={m.id}>{m.full_name ?? m.email}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Due in (days)</Label>
                <Input
                  type="number"
                  min={1}
                  placeholder="e.g. 7"
                  value={form.due_offset_days}
                  onChange={(e) => setForm(f => ({ ...f, due_offset_days: e.target.value }))}
                />
              </div>
            </div>

            {/* Checklist items */}
            <div className="space-y-2">
              <Label>Checklist items</Label>
              <div className="space-y-1">
                {form.checklist_items.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 bg-muted/40 px-3 py-1.5 rounded">
                    <CheckSquare className="size-3.5 text-muted-foreground shrink-0" />
                    <span className="text-sm flex-1">{item.text}</span>
                    <button onClick={() => removeChecklistItem(i)} className="text-muted-foreground hover:text-destructive">
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Add checklist item…"
                  value={newItem}
                  onChange={(e) => setNewItem(e.target.value)}
                  className="h-8 text-sm"
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addChecklistItem(); } }}
                />
                <Button size="sm" variant="outline" className="h-8" onClick={addChecklistItem} disabled={!newItem.trim()}>
                  <Plus className="size-3.5" />
                </Button>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={backToList}>Cancel</Button>
              <Button className="flex-1" onClick={() => save.mutate()} disabled={!form.name.trim() || save.isPending}>
                {save.isPending ? "Saving…" : editing ? "Update Template" : "Create Template"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
