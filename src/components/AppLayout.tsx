import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard, KanbanSquare, Users, Building2,
  LogOut, Languages, Menu, X, Activity, Bell, Search,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/hooks/use-i18n";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { NotificationBell } from "@/components/NotificationBell";

// ── Brand mark: 2×2 grid of status-colored squares ───────────────────────────
function BrandMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" aria-hidden="true" className="shrink-0">
      <rect x="0"  y="0"  width="10" height="10" rx="2" fill="var(--color-status-notstarted)" />
      <rect x="12" y="0"  width="10" height="10" rx="2" fill="var(--color-status-working)" />
      <rect x="0"  y="12" width="10" height="10" rx="2" fill="var(--color-status-stuck)" />
      <rect x="12" y="12" width="10" height="10" rx="2" fill="var(--color-status-done)" />
    </svg>
  );
}

// ── User initials avatar ───────────────────────────────────────────────────────
function UserAvatar({ name, size = 30 }: { name: string; size?: number }) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      className="rounded-full flex items-center justify-center font-semibold text-white shrink-0"
      style={{
        width: size, height: size,
        fontSize: size * 0.38,
        background: "var(--color-primary)",
      }}
    >
      {initials || "?"}
    </span>
  );
}

export function AppLayout() {
  const { user, isAdmin, signOut } = useAuth();
  const { t, lang, toggle } = useI18n();
  const loc = useLocation();
  const nav2 = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => { setDrawerOpen(false); }, [loc.pathname]);
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [drawerOpen]);

  const displayName = user?.user_metadata?.full_name ?? user?.email ?? "User";
  const emailSlug   = (user?.email ?? "").split("@")[0];

  // ── Navigation groups ──────────────────────────────────────────────────────
  const workNav = [
    { to: "/dashboard", label: t("nav_dashboard"), icon: LayoutDashboard },
    { to: "/tasks",     label: t("nav_tasks"),     icon: KanbanSquare },
  ];
  const manageNav = [
    { to: "/users",       label: t("nav_users"),       icon: Users },
    { to: "/departments", label: t("nav_departments"), icon: Building2 },
    { to: "/logs",        label: "Logs",               icon: Activity },
  ];
  const bottomNavItems = workNav; // mobile bottom bar — non-admin only

  // ── Sidebar content ────────────────────────────────────────────────────────
  const SidebarContent = ({ onLinkClick }: { onLinkClick?: () => void }) => (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-4 py-4 border-b border-sidebar-border">
        <BrandMark size={22} />
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-semibold tracking-tight leading-none">past-task</div>
          <div
            className="font-mono-pt text-[10px] text-muted-foreground tracking-widest uppercase mt-0.5"
            style={{ letterSpacing: "0.08em" }}
          >
            {lang === "ar" ? "الفريق الداخلي" : "Internal · Team"}
          </div>
        </div>
        {/* Close btn only inside drawer */}
        {onLinkClick && (
          <button
            onClick={onLinkClick}
            className="p-1.5 rounded-md text-muted-foreground hover:bg-muted transition-colors"
            aria-label="Close menu"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-4 overflow-y-auto">
        {/* Work group */}
        <div>
          <div
            className="font-mono-pt text-[10px] text-muted-foreground px-2 pb-1.5 uppercase tracking-widest"
            style={{ letterSpacing: "0.1em" }}
          >
            {lang === "ar" ? "العمل" : "Work"}
          </div>
          <div className="space-y-0.5">
            {workNav.map((n) => {
              const active = loc.pathname.startsWith(n.to);
              return (
                <Link
                  key={n.to} to={n.to}
                  onClick={onLinkClick}
                  className={cn(
                    "flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] transition-colors",
                    active
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <n.icon className="size-4 shrink-0" strokeWidth={active ? 2 : 1.6} />
                  <span>{n.label}</span>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Manage group (admin only) */}
        {isAdmin && (
          <div>
            <div
              className="font-mono-pt text-[10px] text-muted-foreground px-2 pb-1.5 uppercase tracking-widest"
              style={{ letterSpacing: "0.1em" }}
            >
              {lang === "ar" ? "الإدارة" : "Manage"}
            </div>
            <div className="space-y-0.5">
              {manageNav.map((n) => {
                const active = loc.pathname.startsWith(n.to);
                return (
                  <Link
                    key={n.to} to={n.to}
                    onClick={onLinkClick}
                    className={cn(
                      "flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] transition-colors",
                      active
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <n.icon className="size-4 shrink-0" strokeWidth={active ? 2 : 1.6} />
                    <span>{n.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-sidebar-border space-y-1">
        <div className="flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-muted/60 transition-colors">
          <UserAvatar name={displayName} size={30} />
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium truncate leading-snug">{displayName}</div>
            <div className="font-mono-pt text-[10px] text-muted-foreground leading-none mt-0.5">
              {isAdmin ? "Admin · " : ""}{emailSlug}
            </div>
          </div>
          <NotificationBell />
        </div>

        <Button variant="ghost" size="sm" className="w-full justify-start text-[13px] text-muted-foreground" onClick={toggle}>
          <Languages className="size-4" strokeWidth={1.6} />
          {lang === "ar" ? "English" : "العربية"}
        </Button>
        <Button
          variant="ghost" size="sm"
          className="w-full justify-start text-[13px] text-muted-foreground"
          onClick={async () => { await signOut(); nav2({ to: "/login" }); }}
        >
          <LogOut className="size-4" strokeWidth={1.6} /> {t("sign_out")}
        </Button>
      </div>
    </div>
  );

  // Current page title for topbar breadcrumb
  const pageTitle = (() => {
    if (loc.pathname.startsWith("/dashboard"))   return t("nav_dashboard");
    if (loc.pathname.startsWith("/tasks"))       return t("nav_tasks");
    if (loc.pathname.startsWith("/users"))       return t("nav_users");
    if (loc.pathname.startsWith("/departments")) return t("nav_departments");
    if (loc.pathname.startsWith("/logs"))        return "Logs";
    return "Past-Task";
  })();

  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div className="min-h-screen flex bg-background text-foreground">

      {/* ── Desktop Sidebar ── */}
      <aside className="hidden md:flex w-[232px] border-e border-sidebar-border bg-sidebar flex-col shrink-0 sticky top-0 h-screen">
        <SidebarContent />
      </aside>

      {/* ── Main column ── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Desktop Topbar */}
        <header className="hidden md:flex items-center gap-4 px-6 py-3 border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-30">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-semibold tracking-tight text-foreground">{pageTitle}</span>
            <span className="text-muted-foreground">·</span>
            <span className="font-mono-pt text-[11px] text-muted-foreground uppercase tracking-wider">{todayStr}</span>
          </div>

          {/* Global search */}
          <div className="flex-1 max-w-xs">
            <div className="flex items-center gap-2 px-3 h-8 bg-muted/60 border border-border rounded-md text-muted-foreground hover:border-primary/40 transition-colors cursor-text">
              <Search className="size-3.5 shrink-0" strokeWidth={1.6} />
              <span className="text-xs flex-1 text-muted-foreground/70">Search anything…</span>
              <kbd className="font-mono-pt text-[10px] border border-border rounded px-1 py-0.5 bg-background">⌘K</kbd>
            </div>
          </div>

          <div className="ms-auto flex items-center gap-1" />
        </header>

        {/* Mobile Top Bar */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-background sticky top-0 z-30">
          <div className="flex items-center gap-2">
            <BrandMark size={20} />
            <span className="text-[15px] font-semibold tracking-tight">past-task</span>
          </div>
          <div className="flex items-center gap-1">
            <NotificationBell />
            <button
              onClick={() => setDrawerOpen(true)}
              className="p-2 rounded-md text-muted-foreground hover:bg-muted transition-colors"
              aria-label="Open menu"
            >
              <Menu className="size-5" />
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-x-hidden pb-20 md:pb-0">
          <Outlet />
        </main>
      </div>

      {/* ── Mobile Bottom Nav ── */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-background border-t border-border flex items-stretch">
        {bottomNavItems.map((n) => {
          const active = loc.pathname.startsWith(n.to);
          return (
            <Link
              key={n.to} to={n.to}
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

      {/* ── Drawer Backdrop ── */}
      <div
        className={cn(
          "md:hidden fixed inset-0 z-40 bg-black/50 transition-opacity duration-300",
          drawerOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={() => setDrawerOpen(false)}
      />

      {/* ── Drawer Panel ── */}
      <div
        className={cn(
          "md:hidden fixed top-0 z-50 h-full w-72 bg-sidebar flex flex-col transition-transform duration-300 ease-in-out shadow-xl",
          lang === "ar" ? "right-0" : "left-0",
          drawerOpen
            ? "translate-x-0"
            : lang === "ar" ? "translate-x-full" : "-translate-x-full"
        )}
      >
        <SidebarContent onLinkClick={() => setDrawerOpen(false)} />
      </div>
    </div>
  );
}
