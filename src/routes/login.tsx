import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { bootstrapCeo, hasAnyUsers } from "@/lib/admin-users.functions";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { session, loading } = useAuth();
  const nav = useNavigate();
  const checkUsers = useServerFn(hasAnyUsers);
  const bootstrap = useServerFn(bootstrapCeo);

  const { data: usersCheck } = useQuery({
    queryKey: ["has-any-users"],
    queryFn: () => checkUsers(),
  });

  useEffect(() => {
    if (!loading && session) nav({ to: "/dashboard" });
  }, [loading, session, nav]);

  const [mode, setMode] = useState<"login" | "bootstrap">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (usersCheck && !usersCheck.hasUsers) setMode("bootstrap");
    else setMode("login");
  }, [usersCheck]);

  const toEmail = (u: string) => `${u.trim().toLowerCase()}@past-task.local`;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "bootstrap") {
        await bootstrap({ data: { username: username.trim().toLowerCase(), password, full_name: fullName } });
        const { error } = await supabase.auth.signInWithPassword({ email: toEmail(username), password });
        if (error) throw error;
        toast.success("CEO account created");
        nav({ to: "/dashboard" });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: toEmail(username), password });
        if (error) throw error;
        nav({ to: "/dashboard" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-md p-8">
        <div className="mb-6">
          <div className="text-2xl font-semibold tracking-tight">Past-Task</div>
          <p className="text-sm text-muted-foreground mt-1">
            {mode === "bootstrap" ? "Create the CEO account to get started" : "Sign in to your account"}
          </p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          {mode === "bootstrap" && (
            <div className="space-y-1.5">
              <Label htmlFor="name">Full name</Label>
              <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="username">Username</Label>
            <Input id="username" autoCapitalize="none" autoCorrect="off" value={username} onChange={(e) => setUsername(e.target.value)} required minLength={3} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          </div>
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Please wait…" : mode === "bootstrap" ? "Create CEO account" : "Sign in"}
          </Button>
          {mode === "login" && (
            <p className="text-xs text-muted-foreground text-center">
              No public signup. Ask your admin to create your account.
            </p>
          )}
        </form>
      </Card>
    </div>
  );
}
