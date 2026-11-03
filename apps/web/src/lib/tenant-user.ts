import { getSupabaseServerClient, getSessionUser } from "@kqa/auth/next";
import { result } from "@kqa/db";
import { isPermissionList } from "@kqa/auth/permissions";
import { getAvatarUrl } from "./avatar-url";

export async function getTenantUser() {
  const user = await getSessionUser();
  if (!user) return null;
  const client = await getSupabaseServerClient();
  const member = await result(
    client
      .from("tenant_members")
      .select("role,status,permissions")
      .eq("tenant_id", user.tenantId)
      .eq("user_id", user.sub)
      .maybeSingle(),
  );
  if (!member || member.status !== "active") return null;
  const profile = await result(
    client.from("users").select("avatar_key,avatar_updated_at").eq("id", user.sub).single(),
  );
  return {
    ...user,
    role: member.role as "admin" | "member",
    permissions:
      member.permissions === null
        ? null
        : isPermissionList(member.permissions)
          ? member.permissions
          : [],
    avatarUrl: getAvatarUrl(
      user.sub,
      !!profile?.avatar_key,
      profile?.avatar_updated_at ? new Date(profile.avatar_updated_at) : null,
    ),
  };
}
