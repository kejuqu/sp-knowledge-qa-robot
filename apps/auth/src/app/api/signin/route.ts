import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@kqa/auth/next";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (typeof body?.email !== "string" || typeof body.password !== "string" || !body.email.trim() || !body.password) return NextResponse.json({ error: "请输入邮箱和密码" }, { status: 400 });
  const client = await getSupabaseServerClient();
  const { data, error } = await client.auth.signInWithPassword({ email: body.email.trim().toLowerCase(), password: body.password });
  if (error?.code === "email_not_confirmed") {
    const {error:sendError}=await client.auth.resend({type:"signup",email:body.email.trim().toLowerCase(),options:{emailRedirectTo:`${process.env.AUTH_APP_URL??"http://auth.lvh.me:3001"}/auth/confirm`}});
    return NextResponse.json({error:sendError ? "邮箱尚未验证，验证邮件暂时无法发送，请联系管理员" : "邮箱尚未验证，已发送验证邮件，请点击邮件链接后登录"},{status:403});
  }
  if (error || !data.user?.email_confirmed_at) return NextResponse.json({ error: "邮箱或密码错误，或邮箱尚未验证" }, { status: 401 });
  const { data: member, error: memberError } = await client.from("tenant_members").select("status").eq("user_id",data.user.id).maybeSingle();
  if (memberError) return NextResponse.json({ error: "无法读取团队信息，请稍后重试" }, { status: 503 });
  return NextResponse.json({ ok: true, membershipStatus: member?.status ?? "incomplete" });
}
