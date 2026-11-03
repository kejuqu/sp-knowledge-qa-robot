import { getSupabaseServerClient } from "@kqa/auth/next";

/** 浏览器通过 httpOnly Cookie 会话换取 Realtime(WebSocket) 可用的短期访问令牌。 */
export async function GET() {
  const client = await getSupabaseServerClient();
  const {
    data: { session },
  } = await client.auth.getSession();
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json({
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY,
    token: session.access_token,
    expiresIn: session.expires_at
      ? Math.max(60, Math.floor(new Date(session.expires_at).getTime() - Date.now()) / 1000)
      : 3600,
  });
}
