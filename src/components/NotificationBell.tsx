import { useState, useEffect } from "react";
import { Bell, Check, CheckCheck, X } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Notification {
  id: string;
  created_at: string;
  user_id: string;
  actor_id: string | null;
  actor_name: string | null;
  type: string;
  task_id: string | null;
  task_title: string | null;
  message: string;
  read: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff  = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins < 1)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

function dayKey(dateStr: string): string {
  const d         = new Date(dateStr);
  const today     = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString())     return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const TYPE_ICON: Record<string, string> = {
  "task.assigned":  "📋",
  "comment.posted": "💬",
  "mention":        "📣",
};

// ─── Component ────────────────────────────────────────────────────────────────

export function NotificationBell() {
  const { user } = useAuth();
  const qc       = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const { data: notifications } = useQuery({
    queryKey: ["notifications", user?.id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("notifications")
        .select("*")
        .eq("user_id", user?.id)
        .order("created_at", { ascending: false })
        .limit(50);
      return (data ?? []) as Notification[];
    },
    enabled: !!user?.id,
    refetchInterval: 60_000,
  });

  // Real-time: new notification for this user
  useEffect(() => {
    if (!user?.id) return;
    const name = `notif-${user.id}`;
    // Remove any stale channel with the same name before creating a new one
    supabase.getChannels().forEach((ch) => {
      if (ch.topic === `realtime:${name}`) supabase.removeChannel(ch);
    });
    const channel = supabase
      .channel(name)
      .on(
        "postgres_changes" as any,
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => qc.invalidateQueries({ queryKey: ["notifications", user.id] })
      )
      .subscribe((status: string, err?: Error) => {
        if (err) console.warn("[notifications realtime]", err.message);
      });
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, qc]);

  const unread = (notifications ?? []).filter(n => !n.read).length;

  // Mark one as read
  const markRead = useMutation({
    mutationFn: async (id: string) => {
      await (supabase as any).from("notifications").update({ read: true }).eq("id", id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications", user?.id] }),
  });

  // Mark all as read
  const markAllRead = useMutation({
    mutationFn: async () => {
      await (supabase as any)
        .from("notifications")
        .update({ read: true })
        .eq("user_id", user?.id)
        .eq("read", false);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications", user?.id] }),
  });

  // Delete one
  const deleteOne = useMutation({
    mutationFn: async (id: string) => {
      await (supabase as any).from("notifications").delete().eq("id", id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications", user?.id] }),
  });

  const handleClick = (n: Notification) => {
    if (!n.read) markRead.mutate(n.id);
    setOpen(false);
    navigate({ to: "/tasks" });
  };

  // Group by day
  const grouped: { day: string; items: Notification[] }[] = [];
  (notifications ?? []).forEach((n) => {
    const day  = dayKey(n.created_at);
    const last = grouped[grouped.length - 1];
    if (last && last.day === day) last.items.push(n);
    else grouped.push({ day, items: [n] });
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative p-2 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          aria-label="Notifications"
        >
          <Bell className="size-4" />
          {unread > 0 && (
            <span className="absolute top-1 end-1 size-4 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center leading-none">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-80 p-0 shadow-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <Bell className="size-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Notifications</span>
            {unread > 0 && (
              <span className="text-xs bg-destructive text-destructive-foreground rounded-full px-1.5 py-0.5 font-medium">
                {unread}
              </span>
            )}
          </div>
          {unread > 0 && (
            <button
              onClick={() => markAllRead.mutate()}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              title="Mark all read"
            >
              <CheckCheck className="size-3.5" />
              All read
            </button>
          )}
        </div>

        {/* List */}
        <div className="max-h-[420px] overflow-y-auto">
          {(notifications ?? []).length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <Bell className="size-8 mx-auto mb-2 opacity-20" />
              No notifications yet
            </div>
          ) : (
            grouped.map(({ day, items }) => (
              <div key={day}>
                {/* Day separator */}
                <div className="px-4 py-1.5 bg-muted/40 border-b">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                    {day}
                  </span>
                </div>

                {items.map((n) => (
                  <div
                    key={n.id}
                    onClick={() => handleClick(n)}
                    className={cn(
                      "flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors border-b last:border-b-0 group",
                      !n.read && "bg-primary/5"
                    )}
                  >
                    {/* Actor avatar */}
                    <div className="size-7 rounded-full bg-primary/15 flex items-center justify-center text-[11px] font-semibold text-primary shrink-0 mt-0.5">
                      {(n.actor_name ?? "?")[0].toUpperCase()}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs leading-snug text-foreground">
                        <span className="me-1">{TYPE_ICON[n.type] ?? "🔔"}</span>
                        {n.message}
                      </p>
                      {n.task_title && (
                        <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                          📋 {n.task_title}
                        </p>
                      )}
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {timeAgo(n.created_at)}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      {!n.read && (
                        <button
                          onClick={(e) => { e.stopPropagation(); markRead.mutate(n.id); }}
                          className="p-1 rounded hover:bg-muted text-muted-foreground"
                          title="Mark read"
                        >
                          <Check className="size-3" />
                        </button>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteOne.mutate(n.id); }}
                        className="p-1 rounded hover:bg-muted text-muted-foreground"
                        title="Dismiss"
                      >
                        <X className="size-3" />
                      </button>
                    </div>

                    {/* Unread dot */}
                    {!n.read && (
                      <div className="size-2 rounded-full bg-primary shrink-0 mt-1.5" />
                    )}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {(notifications ?? []).length > 0 && (
          <div className="px-4 py-2 border-t text-center">
            <button
              onClick={() => {
                (supabase as any)
                  .from("notifications")
                  .delete()
                  .eq("user_id", user?.id)
                  .eq("read", true)
                  .then(() => qc.invalidateQueries({ queryKey: ["notifications", user?.id] }));
              }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Clear read notifications
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
