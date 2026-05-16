import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
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
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/departments")({
  component: DeptPage,
});

function DeptPage() {
  const { isAdmin, loading } = useAuth();
  const { t } = useI18n();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");

  if (!loading && !isAdmin) throw redirect({ to: "/dashboard" });

  const { data: depts } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => (await supabase.from("departments").select("*").order("name")).data ?? [],
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("departments").insert({ name, description: desc || null });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["departments"] });
      setOpen(false); setName(""); setDesc("");
      toast.success(t("department_created"));
    },
    onError: (e) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("departments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["departments"] }),
  });

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("departments")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("departments_sub")}</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="size-4" />{t("new_department")}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{t("new_department")}</DialogTitle></DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="space-y-4">
              <div className="space-y-1.5">
                <Label>{t("name")}</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("description")}</Label>
                <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} maxLength={500} />
              </div>
              <Button type="submit" disabled={create.isPending} className="w-full">{t("create")}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {(depts ?? []).map((d) => (
          <Card key={d.id} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium truncate">{d.name}</div>
                {d.description && <div className="text-sm text-muted-foreground mt-1 line-clamp-2">{d.description}</div>}
              </div>
              <Button variant="ghost" size="icon" onClick={() => del.mutate(d.id)}>
                <Trash2 className="size-4 text-muted-foreground" />
              </Button>
            </div>
          </Card>
        ))}
        {(depts ?? []).length === 0 && (
          <div className="col-span-full text-center text-sm text-muted-foreground py-12">{t("no_departments")}</div>
        )}
      </div>
    </div>
  );
}
