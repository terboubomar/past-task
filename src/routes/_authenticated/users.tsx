import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { adminCreateUser, adminDeleteUser } from "@/lib/admin-users.functions";

export const Route = createFileRoute("/_authenticated/users")({
  component: UsersPage,
});

function UsersPage() {
  const { isAdmin, loading } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const create = useServerFn(adminCreateUser);
  const del = useServerFn(adminDeleteUser);

  const { data: profiles } = useQuery({
    queryKey: ["profiles-roles"],
    queryFn: async () => {
      const { data: profs } = await supabase
        .from("profiles")
        .select("*, department:departments(id, name)")
        .order("created_at", { ascending: false });
      const { data: roles } = await supabase.from("user_roles").select("user_id, role");
      const rmap = new Map<string, string[]>();
      (roles ?? []).forEach((r) => {
        const arr = rmap.get(r.user_id) ?? [];
        arr.push(r.role);
        rmap.set(r.user_id, arr);
      });
      return (profs ?? []).map((p) => ({ ...p, roles: rmap.get(p.id) ?? [] }));
    },
    enabled: isAdmin,
  });

  const { data: depts } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => (await supabase.from("departments").select("*").order("name")).data ?? [],
  });

  const removeUser = useMutation({
    mutationFn: async (id: string) => del({ data: { user_id: id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["profiles-roles"] }); toast.success("User deleted"); },
    onError: (e: any) => toast.error(e.message),
  });

  if (!loading && !isAdmin) {
    throw redirect({ to: "/dashboard" });
  }

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
          <p className="text-sm text-muted-foreground mt-1">Create team members and assign them to departments.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="size-4" />New user</Button>
          </DialogTrigger>
          <NewUserDialog
            depts={depts ?? []}
            onCreated={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["profiles-roles"] }); }}
            create={create}
          />
        </Dialog>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="grid grid-cols-[1.5fr_2fr_1fr_1fr_auto] gap-4 px-6 py-3 border-b text-xs text-muted-foreground font-medium uppercase tracking-wide">
          <div>Name</div><div>Email</div><div>Department</div><div>Role</div><div></div>
        </div>
        <div className="divide-y">
          {(profiles ?? []).map((p) => (
            <div key={p.id} className="grid grid-cols-[1.5fr_2fr_1fr_1fr_auto] gap-4 px-6 py-3 items-center text-sm">
              <div className="font-medium truncate">{p.full_name ?? "—"}</div>
              <div className="text-muted-foreground truncate">{p.email}</div>
              <div>{p.department?.name ?? <span className="text-muted-foreground">—</span>}</div>
              <div className="flex gap-1">
                {p.roles.map((r) => (
                  <span key={r} className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary font-medium uppercase">
                    {r}
                  </span>
                ))}
              </div>
              <Button variant="ghost" size="icon" onClick={() => removeUser.mutate(p.id)}>
                <Trash2 className="size-4 text-muted-foreground" />
              </Button>
            </div>
          ))}
          {(profiles ?? []).length === 0 && (
            <div className="px-6 py-12 text-center text-sm text-muted-foreground">No users yet.</div>
          )}
        </div>
      </Card>
    </div>
  );
}

function NewUserDialog({ depts, onCreated, create }: { depts: any[]; onCreated: () => void; create: any }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"ceo" | "admin" | "member">("member");
  const [dept, setDept] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await create({ data: { username: username.trim().toLowerCase(), password, full_name: name, role, department_id: dept || null } });
      toast.success("User created");
      onCreated();
      setUsername(""); setPassword(""); setName(""); setDept(""); setRole("member");
    } catch (err: any) {
      toast.error(err.message);
    } finally { setBusy(false); }
  };

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Create user</DialogTitle></DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label>Full name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label>Username</Label>
          <Input autoCapitalize="none" autoCorrect="off" value={username} onChange={(e) => setUsername(e.target.value)} required minLength={3} pattern="[a-zA-Z0-9_.\-]+" />
        </div>
        <div className="space-y-1.5">
          <Label>Temporary password</Label>
          <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="ceo">CEO</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Department</Label>
            <Select value={dept} onValueChange={setDept}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {depts.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "Creating…" : "Create user"}
        </Button>
      </form>
    </DialogContent>
  );
}
