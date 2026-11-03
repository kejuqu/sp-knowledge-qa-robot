import { NextRequest, NextResponse } from "next/server";
import { assertSupabaseTarget } from "@kqa/db";
import { createServerClient } from "@supabase/ssr";

export async function proxy(request: NextRequest) {
  // Auth handlers validate their own inputs/session; anonymous users must reach them.
  const publicPaths = new Set([
    "/signin",
    "/signup",
    "/auth/confirm",
    "/api/signin",
    "/api/signup",
    "/api/signup/send-code",
    "/api/auth/session",
    "/api/auth/confirm",
    "/api/auth/callback",
  ]);

  if (publicPaths.has(request.nextUrl.pathname)) return NextResponse.next();
  if (
    request.method === "POST" &&
    request.nextUrl.pathname === "/api/team/import" &&
    request.headers.has("authorization")
  )
    return NextResponse.next();
  if (request.nextUrl.pathname === "/api/internal/ingest") return NextResponse.next();
  let response = NextResponse.next({ request });
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.json({ error: "Supabase 尚未配置" }, { status: 503 });
  assertSupabaseTarget(url);
  const client = createServerClient(url, key, {
    cookieOptions: {
      domain: process.env.COOKIE_DOMAIN || undefined,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
    },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values) {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const {
    data: { user },
  } = await client.auth.getUser();
  if (user?.email_confirmed_at) return response;
  const denied = request.nextUrl.pathname.startsWith("/api/")
    ? NextResponse.json({ error: "unauthorized" }, { status: 401 })
    : NextResponse.redirect(
        new URL("/signin", process.env.AUTH_APP_URL ?? "http://auth.lvh.me:3001"),
      );
  response.cookies.getAll().forEach((cookie) => denied.cookies.set(cookie));
  return denied;
}
export const config = {
  matcher: [
    // Public auth routes must never enter the auth gate, including on Vercel.
    // Keep exact boundaries so /api/signup/unknown stays protected.
    "/((?!signin$|signup$|auth/confirm$|api/signin$|api/signup$|api/signup/send-code$|api/auth/session$|api/auth/confirm$|api/auth/callback$|_next/|__nextjs_font/|favicon\\.ico$|icon\\.png$|robots\\.txt$|sitemap\\.xml$).*)",
  ],
};
