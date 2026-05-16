import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, KanbanSquare, Users, Building2, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, adminOnly: false },
  { to: "/tasks", label: "Tasks", icon: KanbanSquare, adminOnly: false },
  { to: "/users", label: "Users", icon: Users, adminOnly: true },
  { to: "/departments", label: "Departments", icon: Building2, adminOnly: true },
] as const;

export function AppLayout() {
  const { user, isAdmin, signOut } = useAuth();
  const loc = useLocation();
  const nav2 = useNavigate();

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <aside className="w-60 border-r border-sidebar-border bg-sidebar flex flex-col">
        <div className="px-5 py-5 border-b border-sidebar-border">
          <div className="text-lg font-semibold tracking-tight">Past-Task</div>
          <div className="text-xs text-muted-foreground mt-0.5">Team workflows</div>
        </div>
        <nav className="flex-1 px-2 py-4 space-y-0.5">
          {nav.filter(n => !n.adminOnly || isAdmin).map(n => {
            const active = loc.pathname.startsWith(n.to);
            return (
              <Link key={n.to} to={n.to}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors",
                  active
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}>
                <n.icon className="size-4" />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-sidebar-border">
          <div className="px-2 pb-2">
            <div className="text-sm font-medium truncate">{user?.user_metadata?.full_name ?? user?.email}</div>
            <div className="text-xs text-muted-foreground truncate">{user?.email}</div>
          </div>
          <Button variant="ghost" size="sm" className="w-full justify-start"
            onClick={async () => { await signOut(); nav2({ to: "/login" }); }}>
            <LogOut className="size-4" /> Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  );
}
