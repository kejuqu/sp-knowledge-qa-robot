import { getSupabaseServerClient } from "@kqa/auth/next";
/** Accept an Auth invitation's fragment tokens; validate remotely before issuing httpOnly cookies. */
export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return Response.json({ error: "无效请求" }, { status: 400 });
  const body = await request.json().catch(() => null);
  if (typeof body?.access_token !== "string" || typeof body.refresh_token !== "string")
    return Response.json({ error: "无效邀请链接" }, { status: 400 });
  const client = await getSupabaseServerClient();
  const { error } = await client.auth.setSession({
    access_token: body.access_token,
    refresh_token: body.refresh_token,
  });

  if (error) return Response.json({ error: "邀请已过期，请联系管理员重新发送" }, { status: 400 });

  const {
    data: { user },
    error: authError,
  } = await client.auth.getUser();
  if (authError || !user?.email_confirmed_at) {
    await client.auth.signOut();
    return Response.json({ error: "邮箱尚未验证" }, { status: 403 });
  }
  return Response.json({ ok: true });
}
