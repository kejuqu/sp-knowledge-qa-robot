import { rows, result } from "@kqa/db";
import { getSupabaseServerClient } from "@kqa/auth/next";
import { getTenantUser } from "@/lib/tenant-user";
export async function GET() {
  const user = await getTenantUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const client = await getSupabaseServerClient();
  const response = await client
    .from("notifications")
    .select("*", { count: "exact" })
    .eq("tenant_id", user.tenantId)
    .eq("user_id", user.sub)
    .is("read_at", null)
    .order("created_at", { ascending: false })
    .limit(50);
  const items = await rows(Promise.resolve(response));
  return Response.json({ items, unreadCount: response.count ?? 0 });
}
export async function PATCH(request: Request) {
  const user = await getTenantUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (
    !body ||
    (body.id !== undefined && (typeof body.id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.id)))
  )
    return Response.json({ error: "无效通知" }, { status: 400 });
  const client = await getSupabaseServerClient();
  let query = client
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("tenant_id", user.tenantId)
    .eq("user_id", user.sub)
    .is("read_at", null);
  if (body.id) query = query.eq("id", body.id);
  await result(query);
  return Response.json({ ok: true });
}
