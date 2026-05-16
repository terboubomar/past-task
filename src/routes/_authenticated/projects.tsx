import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Pencil, Trash2, FolderOpen, ArrowRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/hooks/use-i18n";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/projects")({
  component: ProjectsPage,
});

const COLORS = [
  { label: "Indigo",  value: "#6366f1" },
  { label: "Blue",    value: "#3b82f6" },
  { label: "Teal",    value: "#14b8a6" },
  { label: "Green",   value: "#22c55e" },
  { label: "Orange",  value: "#f97316" },
  { label: "Pink",    value: "#ec4899" },
  { label: "Red",     value: "#ef4444" },
  { label: "Purple",  value: "#a855f7" },
];

function ProjectsPage() {
  const { user, isAdmin } = useAuth();
  const { t } = useI18n();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editProject, setEditProject] = useState<any>(null);

  const { data: projects } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data } = await supabase
        .from("projects")
        .select("*, department:departments(id,name)")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: depts } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => (await supabase.from("departments").select("*").order("name")).data ?? [],
  });

  // Task counts per project
  const { data: taskCounts } = useQuery({
    queryKey: ["task-counts-by-project"],
    queryFn: async () => {
      const { data } = await supabase
        .from("tasks")
        .select("project_id, status")
        .not("project_id", "is", null);
      const map: Record<string, { total: number; done: number }> = {};
      (data ?? []).forEach((tk: any) => {
        if (!map[tk.project_id]) map[tk.project_id] = { total: 0, done: 0 };
        map[tk.project_id].total++;
        if (tk.status === "done") map[tk.project_id].done++;
      });
      return map;
    },
  });

  const deleteProject = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("projects").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success(t("project_deleted"));
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-start justify-between mb-6 gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold tracking-tight">{t("projects")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t("projects_sub")}</p>
        </div>
        {isAdmin && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="size-4" /><span className="hidden sm:inline">{t("new_project")}</span></Button>
            </DialogTrigger>
            <ProjectFormDialog
              depts={depts ?? []}
              userId={user?.id ?? ""}
              onSaved={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["projects"] }); }}
            />
          </Dialog>
        )}
      </div>

      {/* Grid */}
      {(projects ?? []).length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
          <FolderOpen className="size-12 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">{t("no_projects")}</p>
          {isAdmin && (
            <Button size="sm" onClick={() => setOpen(true)}><Plus className="size-4" />{t("new_project")}</Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(projects ?? []).map((p: any) => {
            const counts = taskCounts?.[p.id];
            const pct = counts && counts.total > 0
              ? Math.round((counts.done / counts.total) * 100)
              : 0;
            return (
              <Card key={p.id} className="p-0 overflow-hidden hover:shadow-md transition-shadow">
                {/* Color bar */}
                <div className="h-1.5 w-full" style={{ backgroundColor: p.color }} />
                <div className="p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="size-8 rounded-lg flex items-center justify-center text-white text-sm font-bold shrink-0"
                        style={{ backgroundColor: p.color }}
                      >
                        {p.name.charAt(0).toUpperCase()}
                      </span>
                      <div>
                        <div className="font-semibold text-sm leading-tight">{p.name}</div>
                        {p.department?.name && (
                          <div className="text-xs text-muted-foreground mt-0.5">{p.department.name}</div>
                        )}
                      </div>
                    </div>
                    {isAdmin && (
                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={() => setEditProject(p)}
                          className="p-1.5 rounded hover:bg-muted text-muted-foreground"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        <button
                          onClick={() => deleteProject.mutate(p.id)}
                          className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  {p.description && (
                    <p className="text-xs text-muted-foreground mt-3 line-clamp-2">{p.description}</p>
                  )}

                  {/* Progress */}
                  <div className="mt-4">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>{counts?.total ?? 0} tasks</span>
                      <span>{pct}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: p.color }}
                      />
                    </div>
                  </div>

                  <Link
                    to="/tasks"
                    search={{ project: p.id } as any}
                    className="mt-4 flex items-center gap-1 text-xs font-medium hover:underline"
                    style={{ color: p.color }}
                  >
                    View tasks <ArrowRight className="size-3" />
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Edit dialog */}
      {editProject && (
        <Dialog open={!!editProject} onOpenChange={(o) => !o && setEditProject(null)}>
          <ProjectFormDialog
            depts={depts ?? []}
            userId={user?.id ?? ""}
            project={editProject}
            onSaved={() => { setEditProject(null); qc.invalidateQueries({ queryKey: ["projects"] }); }}
          />
        </Dialog>
      )}
    </div>
  );
}

function ProjectFormDialog({
  depts, userId, project, onSaved,
}: {
  depts: any[]; userId: string; project?: any; onSaved: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(project?.name ?? "");
  const [desc, setDesc] = useState(project?.description ?? "");
  const [color, setColor] = useState(project?.color ?? "#6366f1");
  const [dept, setDept] = useState(project?.department_id ?? "");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    let error;
    if (project) {
      ({ error } = await supabase.from("projects").update({
        name, description: desc || null, color, department_id: dept || null,
      }).eq("id", project.id));
    } else {
      ({ error } = await supabase.from("projects").insert({
        name, description: desc || null, color, department_id: dept || null, created_by: userId,
      }));
    }
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(project ? t("project_updated") : t("project_created"));
    onSaved();
  };

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{project ? t("edit_project") : t("create_project")}</DialogTitle>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label>{t("project_name")}</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
        </div>
        <div className="space-y-1.5">
          <Label>{t("description")}</Label>
          <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} maxLength={500} />
        </div>
        <div className="space-y-1.5">
          <Label>{t("project_color")}</Label>
          <div className="flex gap-2 flex-wrap">
            {COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setColor(c.value)}
                className={cn(
                  "size-7 rounded-full border-2 transition-all",
                  color === c.value ? "border-foreground scale-110" : "border-transparent"
                )}
                style={{ backgroundColor: c.value }}
                title={c.label}
              />
            ))}
          </div>
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
        <Button type="submit" disabled={busy} className="w-full" style={{ backgroundColor: color }}>
          {busy ? t("saving") : project ? t("save_changes") : t("create_project")}
        </Button>
      </form>
    </DialogContent>
  );
}
