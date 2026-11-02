import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@kqa/auth/next";
import { getSupabaseAdmin } from "@kqa/db";
import { hasLocalSmtp, sendLocalAuthEmail, MailError } from "@kqa/auth/mail";
import { validateSignup } from "../../../lib/supabase-email";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!validateSignup(body)) return NextResponse.json({ error: "请填写团队和有效邮箱，密码须为 8–128 位，且两次输入一致" }, { status: 400 });
  const email = body.email.trim().toLowerCase();
  const metadata = { display_name: email.split("@")[0]!.slice(0, 100), team_name: body.tenantName.trim() };
  const client = await getSupabaseServerClient();

  if (process.env.APP_ENV !== "production") {
    try {
      if (hasLocalSmtp()) {
        await sendLocalAuthEmail({ type: "signup", email, password: body.password, data: metadata });
      } else {
        const { data, error } = await client.auth.signUp({ email, password: body.password, options: {
          data: metadata,
          emailRedirectTo: `${process.env.AUTH_APP_URL ?? "http://auth.lvh.me:3001"}/api/auth/callback`,
        } });
        if (error) return NextResponse.json({ error: "验证邮件发送失败，请稍后重试" }, { status: error.status === 429 ? 429 : 502 });
        if (data.session) {
          await client.auth.signOut();
          return NextResponse.json({ error: "请先开启本地 Supabase 邮箱确认" }, { status: 503 });
        }
      }
      return NextResponse.json({ requiresEmailConfirmation: true });
    } catch (error) {
      return NextResponse.json({ error: error instanceof MailError ? error.message : "邮箱服务暂时不可用" }, { status: error instanceof MailError ? error.status : 503 });
    }
  }

  // Production registration deliberately skips email delivery, using the server-only admin client.
  const { error: createError } = await getSupabaseAdmin().auth.admin.createUser({
    email, password: body.password, email_confirm: true, user_metadata: metadata,
  });
  if (createError && !["email_exists", "user_already_exists"].includes(createError.code ?? "")) {
    return NextResponse.json({ error: "注册失败，请稍后重试" }, { status: 400 });
  }
  // Password authentication also allows safe retries after a team setup failure.
  const { data: signedIn, error: signInError } = await client.auth.signInWithPassword({ email, password: body.password });
  if (signInError || !signedIn.user?.email_confirmed_at) return NextResponse.json({ error: "注册未完成或账号已存在，请登录或找回密码" }, { status: 400 });
  const { data, error } = await client.rpc("complete_signup", metadata);
  if (error) return NextResponse.json({ error: "账号已创建，但团队设置失败，请重试或登录后继续" }, { status: 503 });
  return NextResponse.json(data);
}
