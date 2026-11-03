import { NextResponse } from "next/server";
import { rows, result, getSupabaseAdmin } from "@kqa/db";
import { getSupabaseServerClient } from "@kqa/auth/next";
import { hasPermission, isPermissionList } from "@kqa/auth/permissions";
import { getTenantUser } from "@/lib/tenant-user";
import { getAvatarUrl } from "@/lib/avatar-url";
export async function GET() {
  const user = await getTenantUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!hasPermission(user, "team.manage") && !hasPermission(user, "roles.manage"))
    return NextResponse.json({ error: "没有查看成员的权限" }, { status: 403 });
  const client = await getSupabaseServerClient();
  const members = await result(
    client
      .from("tenant_members")
      .select(
        "id,user_id,role,status,permissions,created_at,reviewed_at,users!tenant_members_user_id_users_id_fk(name,email,avatar_key,avatar_updated_at)",
      )
      .eq("tenant_id", user.tenantId)
      .order("created_at", { ascending: false }),
  );
  return NextResponse.json({
    tenantName: user.tenantName,
    userId: user.sub,
    members: (members ?? []).map((m) => {
      const p = m.users as unknown as {
        name: string;
        email: string;
        avatar_key: string | null;
        avatar_updated_at: string | null;
      };
      return {
        id: m.id,
        userId: m.user_id,
        role: m.role,
        status: m.status,
        permissions: m.permissions,
        createdAt: m.created_at,
        reviewedAt: m.reviewed_at,
        name: p.name,
        email: p.email,
        avatarUrl: getAvatarUrl(
          m.user_id,
          !!p.avatar_key,
          p.avatar_updated_at ? new Date(p.avatar_updated_at) : null,
        ),
      };
    }),
  });
}
export async function PATCH(request: Request) {
  const user = await getTenantUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (
    !body ||
    typeof body.id !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(body.id) ||
    !["approve", "reject", "update"].includes(body.action) ||
    (body.role !== undefined && !["admin", "member"].includes(body.role)) ||
    (body.permissions !== undefined &&
      body.permissions !== null &&
      !isPermissionList(body.permissions))
  )
    return NextResponse.json({ error: "无效的审批或权限设置" }, { status: 400 });
  const { data, error } = await getSupabaseAdmin().rpc("manage_team", {
    actor_id: user.sub,
    team_id: user.tenantId,
    member_id: body.id,
    action_name: body.action,
    requested_role: body.role ?? null,
    requested_permissions: body.permissions ?? null,
    permissions_provided: body.permissions !== undefined,
  });
  if (error)
    return NextResponse.json(
      { error: error.message },
      { status: error.code === "42501" ? 403 : error.code === "P0002" ? 404 : 409 },
    );
  return NextResponse.json(data);
}
