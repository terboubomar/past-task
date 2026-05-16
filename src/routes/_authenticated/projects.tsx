import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Pencil, Trash2, FolderKanban, ChevronRight } from "lucide-react";
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
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/projects")({
  component: ProjectsPage,
});

const PROJECT_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f43f5e",
  "#f97316", "#eab308", "#22c55e", "#06b6d4",
  "#3b82f6", "#64748b",
];

function ProjectsPage() {
  const { isAdmin } = useAuth();
  const { t } = useI18n();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editProject, setEditProject] = useState<any>(null);

  const { data: projects, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*, department:departments(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: taskCounts } = useQuery({
    queryKey: ["project-task-counts"],
    queryFn: async () => {
      const { data } = await supabase
        .from("tasks")
        .select("project_id, status")
        .not("project_id", "is", null);
      const counts: Record<string, { total: number; done: number }> = {};
      (data ?? []).forEach((t) => {
        if (!t.project_id) return;
        if (!counts[t.project_id]) counts[t.project_id] = { total: 0, done: 0 };
        counts[t.project_id].total++;
        if (t.status === "done") counts[t.project_id].done++;
      });
      return counts;
    },
  });

  const { data: depts } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => (await supabase.from("departments").select("*").order("name")).data ?? [],
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
    <div className="p-4 md:p-8 max-w-7xl">
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
              onSaved={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["projects"] }); }}
            />
          </Dialog>
        )}
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-36 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      )}

      {!isLoading && (projects ?? []).length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <FolderKanban className="size-12 text-muted-foreground/30 mb-4" />
          <p className="text-sm text-muted-foreground">{t("no_projects")}</p>
          {isAdmin && (
            <Button className="mt-4" size="sm" onClick={() => setOpen(true)}>
              <Plus className="size-4" /> {t("new_project")}
            </Button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {(projects ?? []).map((p) => {
          const counts = taskCounts?.[p.id];
          const total = counts?.total ?? 0;
          const done = counts?.done ?? 0;
          const pct = total > 0 ? Math.round((done / total) * 100) : 0;
          return (
            <Card key={p.id} className="p-5 flex flex-col gap-3 hover:shadow-md transition-shadow group">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="size-3 rounded-full shrink-0" style={{ background: p.color }} />
                  <span className="font-medium text-sm leading-snug">{p.name}</span>
                </div>
                {isAdmin && (
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => setEditProject(p)}
                      className="p-1 rounded hover:bg-muted text-muted-foreground">
                      <Pencil className="size-3.5" />
                    </button>
                    <button onClick={() => deleteProject.mutate(p.id)}
                      className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {p.description && (
                <p className="text-xs text-muted-foreground line-clamp-2">{p.description}</p>
              )}

              <div className="mt-auto space-y-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{done}/{total} {t("done")}</span>
                  <span>{pct}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${pct}%`, background: p.color }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-muted-foreground">
                  {p.department?.name ?? "—"}
                </span>
                <Link
                  to="/tasks"
                  search={{ project: p.id } as any}
                  className="flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  {t("nav_tasks")} <ChevronRight className="size-3" />
                </Link>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Edit Dialog */}
      {editProject && (
        <Dialog open={!!editProject} onOpenChange={(o) => !o && setEditProject(null)}>
          <ProjectFormDialog
            project={editProject}
            depts={depts ?? []}
            onSaved={() => { setEditProject(null); qc.invalidateQueries({ queryKey: ["projects"] }); }}
          />
        </Dialog>
      )}
    </div>
  );
}

function ProjectFormDialog({ project, depts, onSaved }: {
  project?: any; depts: any[]; onSaved: () => void;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const [name, setName] = useState(project?.name ?? "");
  const [desc, setDesc] = useState(project?.description ?? "");
  const [color, setColor] = useState(project?.color ?? PROJECT_COLORS[0]);
  const [dept, setDept] = useState(project?.department_id ?? "");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    let error;
    if (project?.id) {
      ({ error } = await supabase.from("projects").update({
        name, description: desc || null, color, department_id: dept || null,
      }).eq("id", project.id));
    } else {
      ({ error } = await supabase.from("projects").insert({
        name, description: desc || null, color,
        department_id: dept || null,
        created_by: user?.id,
      }));
    }
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(project?.id ? t("project_updated") : t("project_created"));
    onSaved();
  };

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{project?.id ? t("edit_project") : t("create_project")}</DialogTitle>
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
            {PROJECT_COLORS.map((c) => (
              <button
                key={c} type="button"
                onClick={() => setColor(c)}
                className={cn(
                  "size-7 rounded-full border-2 transition-transform hover:scale-110",
                  color === c ? "border-foreground scale-110" : "border-transparent"
                )}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>{t("department")}</Label>
          <Select value={dept} onValueChange={setDept}>
            <SelectTrigger><SelectValue placeholder="\u2014" /></SelectTrigger>
            <SelectContent>
              {depts.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? t("saving") : (project?.id ? t("save_changes") : t("create_project"))}
        </Button>
      </form>
    </DialogContent>
  );
}
