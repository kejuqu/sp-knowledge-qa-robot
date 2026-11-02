import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type { SupabaseClient };
export function assertSupabaseTarget(url: string) {
  if (process.env.APP_ENV !== "production" && !["127.0.0.1", "localhost", "::1", "[::1]"].includes(new URL(url).hostname)) {
    throw new Error("本地模式拒绝访问远程 Supabase。生产部署需显式设置 APP_ENV=production。");
  }
}
export function createSupabaseClient(accessToken?: string): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY 未配置");
  assertSupabaseTarget(url);
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...(accessToken ? { global: { headers: { Authorization: `Bearer ${accessToken}` } } } : {}),
  });
}

let admin: SupabaseClient | undefined;
/** Only import in server modules. Never export this client to a browser bundle. */
export function getSupabaseAdmin(): SupabaseClient {
  if (typeof window !== "undefined") throw new Error("Supabase admin client is server-only");
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 未配置");
  assertSupabaseTarget(url);
  return admin ??= createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function result<T>(query: PromiseLike<{ data: T; error: { message: string; code?: string } | null }>): Promise<T> {
  const { data, error } = await query;
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  return data;
}

/** Map database columns only; JSON payloads such as citations/body remain untouched. */
export function camelRow<T>(row: unknown): T {
  return Object.fromEntries(Object.entries(row as Record<string, unknown>).map(([key, value]) => [
    key.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase()),
    /_at$/.test(key) && typeof value === "string" ? new Date(value) : value,
  ])) as T;
}
export function snakeRow(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [
    key.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`), value instanceof Date ? value.toISOString() : value,
  ]));
}
export async function rows<T>(query: PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>): Promise<T[]> {
  return ((await result(query)) as unknown[] ?? []).map((row) => camelRow<T>(row));
}
