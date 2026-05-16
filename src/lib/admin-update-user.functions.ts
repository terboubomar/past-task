import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const updateUserSchema = z.object({
  user_id: z.string().uuid(),
  full_name: z.string().trim().min(1).max(120),
  department_id: z.string().uuid().nullable(),
  role: z.enum(["super_admin", "ceo", "admin", "member"]),
  new_password: z.string().min(8).max(72).optional().or(z.literal("")),
});

export const adminUpdateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => updateUserSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: callerRoles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const isAdmin = callerRoles?.some((r) =>
      r.role === "ceo" || r.role === "admin" || r.role === "super_admin"
    );
    if (!isAdmin) throw new Error("Forbidden");
    if (data.role === "super_admin") {
      const isSuperAdmin = callerRoles?.some((r) => r.role === "super_admin");
      if (!isSuperAdmin)
        throw new Error("Only a Super Admin can assign Super Admin role");
    }
    // Update profile
    const { error: profErr } = await supabaseAdmin
      .from("profiles")
      .update({
        full_name: data.full_name,
        department_id: data.department_id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.user_id);
    if (profErr) throw new Error(profErr.message);
    // Replace role
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id);
    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.user_id, role: data.role });
    if (roleErr) throw new Error(roleErr.message);
    // Optionally reset password
    if (data.new_password && data.new_password.length >= 8) {
      const { error: pwErr } = await supabaseAdmin.auth.admin.updateUserById(
        data.user_id,
        { password: data.new_password }
      );
      if (pwErr) throw new Error(pwErr.message);
    }
    return { ok: true };
  });
