import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, KanbanSquare, Users, Building2, LogOut, Languages, Menu, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/hooks/use-i18n";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";

export function AppLayout() {
  const { user, isAdmin, signOut } = useAuth();
  const { t, lang, toggle } = useI18n();
  const loc = useLocation();
  const nav2 = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close drawer on route change
  useEffect(() => { setDrawerOpen(false); }, [loc.pathname]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [drawerOpen]);

  const nav = [
    { to: "/dashboard", label: t("nav_dashboard"), icon: LayoutDashboard, adminOnly: false },
    { to: "/tasks",     label: t("nav_tasks"),     icon: KanbanSquare,    adminOnly: false },
    { to: "/users",     label: t("nav_users"),     icon: Users,           adminOnly: true  },
    { to: "/departments", label: t("nav_departments"), icon: Building2,   adminOnly: true  },
  ];

  const visibleNav = nav.filter(n => !n.adminOnly || isAdmin);

  const NavLinks = ({ onClick }: { onClick?: () => void }) => (
    <>
      {visibleNav.map(n => {
        const active = loc.pathname.startsWith(n.to);
        return (
          <Link
            key={n.to}
            to={n.to}
            onClick={onClick}
            className={cn(
              "flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm transition-colors",
              active
                ? "bg-primary/10 text-primary font-medium"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <n.icon className="size-4 shrink-0" />
            <span>{n.label}</span>
          </Link>
        );
      })}
    </>
  );

  return (
    <div className="min-h-screen flex bg-background text-foreground">

      {/* ─── Desktop Sidebar (hidden on mobile) ─── */}
      <aside className="hidden md:flex w-60 border-e border-sidebar-border bg-sidebar flex-col shrink-0">
        <div className="px-5 py-5 border-b border-sidebar-border">
          <div className="text-lg font-semibold tracking-tight">Past-Task</div>
          <div className="text-xs text-muted-foreground mt-0.5">{t("app_tagline")}</div>
        </div>
        <nav className="flex-1 px-2 py-4 space-y-0.5">
          <NavLinks />
        </nav>
        <div className="p-3 border-t border-sidebar-border space-y-1">
          <div className="px-2 pb-2">
            <div className="text-sm font-medium truncate">{user?.user_metadata?.full_name ?? user?.email}</div>
            <div className="text-xs text-muted-foreground truncate">{(user?.email ?? "").split("@")[0]}</div>
          </div>
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={toggle}>
            <Languages className="size-4" /> {lang === "ar" ? "English" : "العربية"}
          </Button>
          <Button variant="ghost" size="sm" className="w-full justify-start"
            onClick={async () => { await signOut(); nav2({ to: "/login" }); }}>
            <LogOut className="size-4" /> {t("sign_out")}
          </Button>
        </div>
      </aside>

      {/* ─── Main Content ─── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* ─── Mobile Top Bar ─── */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-background sticky top-0 z-30">
          <div className="text-base font-semibold tracking-tight">Past-Task</div>
          <button
            onClick={() => setDrawerOpen(true)}
            className="p-2 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Open menu"
          >
            <Menu className="size-5" />
          </button>
        </header>

        {/* ─── Page Content ─── */}
        <main className="flex-1 overflow-x-hidden pb-20 md:pb-0">
          <Outlet />
        </main>
      </div>

      {/* ─── Mobile Bottom Nav ─── */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-background border-t border-border flex items-stretch">
        {visibleNav.map(n => {
          const active = loc.pathname.startsWith(n.to);
          return (
            <Link
              key={n.to}
              to={n.to}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors min-h-[56px]",
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              <n.icon className={cn("size-5", active && "stroke-[2.5]")} />
              <span className="leading-none">{n.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* ─── Mobile Slide-in Drawer ─── */}
      {/* Backdrop */}
      <div
        className={cn(
          "md:hidden fixed inset-0 z-40 bg-black/50 transition-opacity duration-300",
          drawerOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={() => setDrawerOpen(false)}
      />
      {/* Drawer Panel */}
      <div
        className={cn(
          "md:hidden fixed top-0 z-50 h-full w-72 bg-sidebar flex flex-col transition-transform duration-300 ease-in-out shadow-xl",
          lang === "ar" ? "right-0" : "left-0",
          drawerOpen
            ? "translate-x-0"
            : lang === "ar" ? "translate-x-full" : "-translate-x-full"
        )}
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between px-5 py-5 border-b border-sidebar-border">
          <div>
            <div className="text-base font-semibold tracking-tight">Past-Task</div>
            <div className="text-xs text-muted-foreground mt-0.5">{t("app_tagline")}</div>
          </div>
          <button
            onClick={() => setDrawerOpen(false)}
            className="p-1.5 rounded-md text-muted-foreground hover:bg-muted transition-colors"
            aria-label="Close menu"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Drawer Nav */}
        <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
          <NavLinks onClick={() => setDrawerOpen(false)} />
        </nav>

        {/* Drawer Footer */}
        <div className="p-3 border-t border-sidebar-border space-y-1">
          <div className="px-2 pb-2">
            <div className="text-sm font-medium truncate">{user?.user_metadata?.full_name ?? user?.email}</div>
            <div className="text-xs text-muted-foreground truncate">{(user?.email ?? "").split("@")[0]}</div>
          </div>
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={toggle}>
            <Languages className="size-4" /> {lang === "ar" ? "English" : "العربية"}
          </Button>
          <Button variant="ghost" size="sm" className="w-full justify-start"
            onClick={async () => { await signOut(); nav2({ to: "/login" }); }}>
            <LogOut className="size-4" /> {t("sign_out")}
          </Button>
        </div>
      </div>

    </div>
  );
}
