import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { STATUS_LABEL, STATUS_ORDER, STATUS_BG, PriorityPill } from "@/components/task-pills";
import type { TaskStatus } from "@/components/task-pills";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const { user, isAdmin } = useAuth();

  const { data: tasks } = useQuery({
    queryKey: ["tasks", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*, assignee:profiles!tasks_assignee_profile_fkey(full_name), department:departments(name)")
        .order("due_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const myTasks = (tasks ?? []).filter((t) => t.assignee_id === user?.id);
  const counts = STATUS_ORDER.reduce((acc, s) => {
    acc[s] = (tasks ?? []).filter((t) => t.status === s).length;
    return acc;
  }, {} as Record<TaskStatus, number>);

  return (
    <div className="p-8 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isAdmin ? "Team-wide task progress at a glance." : "Your work and team status."}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {STATUS_ORDER.map((s) => (
          <Card key={s} className="p-5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className={`size-2 rounded-full ${STATUS_BG[s]}`} />
              {STATUS_LABEL[s]}
            </div>
            <div className="mt-2 text-3xl font-semibold">{counts[s] ?? 0}</div>
          </Card>
        ))}
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h2 className="font-medium">My tasks</h2>
        </div>
        {myTasks.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-muted-foreground">
            No tasks assigned to you.
          </div>
        ) : (
          <div className="divide-y">
            {myTasks.map((t) => (
              <div key={t.id} className="px-6 py-3 flex items-center gap-4 hover:bg-muted/40">
                <div className={`size-2 rounded-full ${STATUS_BG[t.status]}`} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{t.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {t.department?.name ?? "No department"} · {STATUS_LABEL[t.status]}
                  </div>
                </div>
                <PriorityPill priority={t.priority} />
                <div className="text-xs text-muted-foreground w-24 text-right">
                  {t.due_date ?? "—"}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
