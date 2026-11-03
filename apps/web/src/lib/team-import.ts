import { getSupabaseAdmin, result } from "@kqa/db";
import { hasLocalSmtp, sendLocalAuthEmail } from "@kqa/auth/mail";
import { canImport } from "./team-api-key";
import { ImportError, type EmployeeInput } from "./team-import-input";
type Actor = { tenantId: string; userId: string; keyId: string | null };
export async function importEmployees(actor: Actor, employees: EmployeeInput[]) {
  const admin = getSupabaseAdmin();
  // Validate the actor before sending invitations; the atomic RPC rechecks again before writes.
  const member = await result(
    admin
      .from("tenant_members")
      .select("role,status,permissions")
      .eq("tenant_id", actor.tenantId)
      .eq("user_id", actor.userId)
      .maybeSingle(),
  );
  if (!member || !canImport(member)) throw new ImportError("团队管理权限已失效", 403);
  if (actor.keyId) {
    const key = await result(
      admin
        .from("tenant_api_keys")
        .select("last_used_at")
        .eq("id", actor.keyId)
        .eq("tenant_id", actor.tenantId)
        .eq("created_by", actor.userId)
        .is("revoked_at", null)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle(),
    );
    if (!key) throw new ImportError("API Key 已失效", 401);
    if (key.last_used_at && Date.now() - Date.parse(key.last_used_at) < 1000)
      throw new ImportError("调用过于频繁", 429);
  }
  const prepared: Array<{ email: string; name: string; auth_id?: string; error?: string }> = [];
  const resolved = new Map<string, string>();
  for (const employee of employees) {
    const entry = { email: employee.email, name: employee.name };
    let authId = resolved.get(employee.email);
    if (!authId) {
      const existing = await result(
        admin.from("users").select("id").eq("email", employee.email).maybeSingle(),
      );
      authId = existing?.id;
      if (!authId) {
        if (hasLocalSmtp()) {
          try {
            authId = (await sendLocalAuthEmail({ type: "invite", email: employee.email })).id;
          } catch {
            prepared.push({ ...entry, error: "邀请邮件发送失败，请检查本地 SMTP 配置或稍后重试" });
            continue;
          }
        }
        const { data, error } = authId
          ? { data: { user: { id: authId } }, error: null }
          : await admin.auth.admin.inviteUserByEmail(employee.email, {
              redirectTo: `${process.env.AUTH_APP_URL ?? "http://auth.lvh.me:3001"}/auth/confirm`,
            });
        authId = data.user?.id;
        if (error && (error.code === "email_exists" || error.code === "user_already_exists")) {
          // An Auth account may exist before its profile/team transaction has completed.
          for (let page = 1; !authId; page++) {
            const { data: users, error: listError } = await admin.auth.admin.listUsers({
              page,
              perPage: 1000,
            });
            if (listError) break;
            authId = users.users.find((user) => user.email?.toLowerCase() === employee.email)?.id;
            if (users.users.length < 1000) break;
          }
        }
        if (!authId) {
          prepared.push({ ...entry, error: "邀请邮件发送失败，请检查 SMTP 配置或稍后重试" });
          continue;
        }
      }
      resolved.set(employee.email, authId);
    }
    prepared.push({ ...entry, auth_id: authId });
  }
  const { data, error } = await admin.rpc("import_team_members", {
    actor_id: actor.userId,
    team_id: actor.tenantId,
    key_id: actor.keyId,
    employees: prepared,
  });
  if (error)
    throw new ImportError(
      error.message,
      error.code === "42501" ? 403 : error.code === "P0429" ? 429 : 500,
    );
  return data;
}
