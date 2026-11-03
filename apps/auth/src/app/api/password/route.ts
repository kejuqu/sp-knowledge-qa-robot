import { getSupabaseServerClient } from "@kqa/auth/next";
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (typeof body?.password !== "string" || body.password.length < 8 || body.password.length > 128)
    return Response.json({ error: "密码须为 8–128 位" }, { status: 400 });
  const client = await getSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await client.auth.getUser();
  if (authError || !user?.email_confirmed_at)
    return Response.json({ error: "请先通过邮件验证邀请" }, { status: 401 });
  const { error } = await client.auth.updateUser({ password: body.password });
  if (error) return Response.json({ error: "密码保存失败，请稍后重试" }, { status: 400 });
  return Response.json({ ok: true, url: process.env.WEB_APP_URL ?? "http://app.lvh.me:3100" });
}
