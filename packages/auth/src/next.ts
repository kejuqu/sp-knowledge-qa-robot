import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { result, assertSupabaseTarget } from "@kqa/db";
import type { SessionPayload } from "./session";

export async function getSupabaseServerClient() {
  const store = await cookies();
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase Auth 未配置");
  assertSupabaseTarget(url);
  return createServerClient(url, key, {
    cookieOptions: {
      domain: process.env.COOKIE_DOMAIN || undefined,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
    },
    cookies: {
      getAll: () => store.getAll(),
      setAll: (values) => {
        try {
          values.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          /* Server Components cannot write cookies; proxy refreshes them. */
        }
      },
    },
  });
}

/** Validate with Auth server; permissions and membership always come from live database rows. */
export async function getSessionUser(): Promise<SessionPayload | null> {
  const client = await getSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user || !user.email_confirmed_at) return null;
  const membership = await result(
    client
      .from("tenant_members")
      .select("tenant_id,role,tenants(name)")
      .eq("user_id", user.id)
      .limit(1),
  );
  const member = membership?.[0];
  if (!member) return null;
  const profile = await result(client.from("users").select("name").eq("id", user.id).single());
  if (!profile) return null;
  return {
    sub: user.id,
    email: user.email ?? "",
    name: profile.name,
    tenantId: member.tenant_id,
    tenantName: (member.tenants as unknown as { name: string }).name,
    role: member.role,
  };
}
