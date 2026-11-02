import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@kqa/auth/next";
export async function POST() {
  const client = await getSupabaseServerClient();
  const { error } = await client.auth.signOut();
  if (error) return NextResponse.json({ error: "退出失败，请重试" }, { status: 503 });
  const response = NextResponse.redirect(new URL("/signin",process.env.AUTH_APP_URL ?? "http://auth.lvh.me:3001"),303);
  response.cookies.set("kqa_session","",{ domain:process.env.COOKIE_DOMAIN,path:"/",maxAge:0 });
  return response;
}
