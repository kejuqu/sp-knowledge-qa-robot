import { result } from "@kqa/db";
import { getSupabaseServerClient } from "@kqa/auth/next";
export async function GET() {
  const client = await getSupabaseServerClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const member = await result(
    client
      .from("tenant_members")
      .select("status,role,permissions,tenants(name)")
      .eq("user_id", user.id)
      .maybeSingle(),
  );
  if (!member)
    return Response.json({
      status: "incomplete",
      tenantName: "",
      error: "请返回注册页完成团队创建",
    });
  return Response.json({
    status: member.status,
    role: member.role,
    permissions: member.permissions,
    tenantName: (member.tenants as unknown as { name: string }).name,
    userId: user.id,
  });
}
