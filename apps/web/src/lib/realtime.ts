"use client";
import { useEffect } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type RealtimeConfig = { url: string; key: string; token: string; expiresIn: number };
type ChangeTable = "notifications" | "tenant_members";

let clientPromise: Promise<SupabaseClient> | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

async function fetchConfig(): Promise<RealtimeConfig> {
  const response = await fetch("/api/realtime/token", { cache: "no-store" });
  if (!response.ok) throw new Error("realtime token unavailable");
  return response.json();
}

async function refreshAuth(client: SupabaseClient) {
  try {
    const config = await fetchConfig();
    client.realtime.setAuth(config.token);
    scheduleRefresh(client, config.expiresIn);
  } catch {
    // 会话 cookie 可能正在刷新，稍后重试；Realtime 断线期间由 refetchOnWindowFocus 兜底。
    refreshTimer = setTimeout(() => void refreshAuth(client), 30_000);
  }
}

function scheduleRefresh(client: SupabaseClient, expiresIn: number) {
  if (refreshTimer) clearTimeout(refreshTimer);
  const delay = Math.max(60_000, Math.min((expiresIn - 300) * 1000, 1_800_000));
  refreshTimer = setTimeout(() => void refreshAuth(client), delay);
}

function getClient(): Promise<SupabaseClient> {
  clientPromise ??= (async () => {
    const config = await fetchConfig();
    const client = createClient(config.url, config.key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    client.realtime.setAuth(config.token);
    scheduleRefresh(client, config.expiresIn);
    return client;
  })();
  return clientPromise;
}

/** 订阅表变更（RLS 在数据库侧生效），返回取消订阅函数。 */
export async function subscribeToTable(
  table: ChangeTable,
  filter: string | undefined,
  onChange: () => void,
): Promise<() => void> {
  const client = await getClient();
  const name = `changes:${table}:${filter ?? "all"}:${Math.random().toString(36).slice(2)}`;
  let retries = 0;
  const channel = client
    .channel(name)
    .on("postgres_changes", { event: "*", schema: "public", table, filter }, onChange)
    .subscribe((status) => {
      // 令牌过期或网络抖动时刷新令牌后重订阅。
      if ((status === "CHANNEL_ERROR" || status === "TIMED_OUT") && retries < 3) {
        retries += 1;
        void refreshAuth(client);
      }
    });
  return () => {
    void client.removeChannel(channel);
  };
}

/** 组件生命周期内订阅表变更，自动清理。filter 传 null 表示尚未就绪、不订阅；undefined 表示不加过滤。 */
export function useTableSubscription(
  table: ChangeTable,
  filter: string | null | undefined,
  onChange: () => void,
) {
  useEffect(() => {
    if (filter === null) return;
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    void subscribeToTable(table, filter, onChange)
      .then((dispose) => {
        if (cancelled) dispose();
        else unsubscribe = dispose;
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [table, filter, onChange]);
}
