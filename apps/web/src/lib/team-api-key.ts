import { createHash, randomBytes } from "node:crypto";
import { getSupabaseAdmin, rows, type TenantMember } from "@kqa/db";
import { hasPermission, isPermissionList } from "@kqa/auth/permissions";
import { getTenantUser } from "./tenant-user";
import { ImportError } from "./team-import-input";
export const hashApiKey = (key: string) => createHash("sha256").update(key).digest("hex");
export function newApiKey() {
  const key = `kqa_emp_${randomBytes(32).toString("hex")}`;
  return { key, keyHash: hashApiKey(key), prefix: key.slice(0, 16) };
}
export function canImport(member: {
  role: "admin" | "member";
  permissions: string[] | null;
  status: string;
}) {
  return (
    member.status === "active" &&
    hasPermission(
      {
        role: member.role,
        permissions:
          member.permissions === null
            ? null
            : isPermissionList(member.permissions)
              ? member.permissions
              : [],
      },
      "team.manage",
    )
  );
}
export async function requireTeamManager() {
  const user = await getTenantUser();
  if (!user) throw new ImportError("请先登录", 401);
  if (!hasPermission(user, "team.manage")) throw new ImportError("需要团队管理权限", 403);
  return user;
}
export async function importActor(request: Request) {
  if (request.headers.has("authorization")) {
    const header = request.headers.get("authorization")!;
    if (!/^Bearer kqa_emp_[a-f0-9]{64}$/i.test(header)) throw new ImportError("无效 API Key", 401);
    const admin = getSupabaseAdmin();
    const { data: key, error } = await admin
      .from("tenant_api_keys")
      .select("id,tenant_id,created_by")
      .eq("key_hash", hashApiKey(header.slice(7)))
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (error || !key) throw new ImportError("API Key 无效、已过期或已撤销", 401);
    const [member] = await rows<TenantMember>(
      admin
        .from("tenant_members")
        .select("*")
        .eq("tenant_id", key.tenant_id)
        .eq("user_id", key.created_by),
    );
    if (!member || !canImport(member)) throw new ImportError("API Key 创建者权限已失效", 403);
    return {
      tenantId: key.tenant_id as string,
      userId: key.created_by as string,
      keyId: key.id as string,
    };
  }
  const user = await requireTeamManager();
  return { tenantId: user.tenantId, userId: user.sub, keyId: null };
}
