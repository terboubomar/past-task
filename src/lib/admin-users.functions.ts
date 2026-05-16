import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(40)
  .regex(/^[a-z0-9_.-]+$/, "Only letters, numbers, dot, underscore, hyphen");

const USERNAME_EMAIL_DOMAIN = "past-task.local";
const toEmail = (username: string) => `${username}@${USERNAME_EMAIL_DOMAIN}`;

const newUserSchema = z.object({
  username: usernameSchema,
  password: z.string().min(8).max(72),
  full_name: z.string().trim().min(1).max(120),
  department_id: z.string().uuid().nullable(),
  role: z.enum(["super_admin", "ceo", "admin", "member"]),
});

export const adminCreateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => newUserSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const isAdmin = roles?.some((r) => r.role === "ceo" || r.role === "admin" || r.role === "super_admin");
    if (!isAdmin) throw new Error("Forbidden");

    // Only super_admin can create another super_admin
    if (data.role === "super_admin") {
      const isSuperAdmin = roles?.some((r) => r.role === "super_admin");
      if (!isSuperAdmin) throw new Error("Only a Super Admin can create another Super Admin");
    }

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: toEmail(data.username),
      password: data.password,
      email_confirm: true,
      user_metadata: {
        full_name: data.full_name,
        username: data.username,
        department_id: data.department_id ?? "",
        role: data.role,
      },
    });
    if (error) throw new Error(error.message);
    return { id: created.user?.id };
  });

const bootstrapSchema = z.object({
  username: usernameSchema,
  password: z.string().min(8).max(72),
  full_name: z.string().trim().min(1).max(120),
});

// Open endpoint: only works when no users exist yet — creates first CEO.
export const bootstrapCeo = createServerFn({ method: "POST" })
  .inputValidator((d) => bootstrapSchema.parse(d))
  .handler(async ({ data }) => {
    const { count } = await supabaseAdmin
      .from("user_roles")
      .select("*", { count: "exact", head: true });
    if ((count ?? 0) > 0) throw new Error("Setup already complete");

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: toEmail(data.username),
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name, username: data.username, role: "ceo" },
    });
    if (error) throw new Error(error.message);
    return { id: created.user?.id };
  });

export const hasAnyUsers = createServerFn({ method: "GET" }).handler(async () => {
  const { count } = await supabaseAdmin
    .from("user_roles")
    .select("*", { count: "exact", head: true });
  return { hasUsers: (count ?? 0) > 0 };
});

export const adminDeleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ user_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: roles } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", userId);
    const isAdmin = roles?.some((r) => r.role === "ceo" || r.role === "admin" || r.role === "super_admin");
    if (!isAdmin) throw new Error("Forbidden");
    if (data.user_id === userId) throw new Error("Cannot delete yourself");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
