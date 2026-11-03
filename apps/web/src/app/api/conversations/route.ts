import { getTenantUser } from "@/lib/tenant-user";
import { getSupabaseServerClient } from "@kqa/auth/next";
import { rows, result, type Conversation } from "@kqa/db";
export async function GET(request: Request) {
  const user = await getTenantUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const requested = Number(params.get("limit") ?? 20);
  const limit = Number.isFinite(requested) ? Math.min(Math.max(Math.floor(requested), 1), 50) : 20;
  const cursor = params.get("cursor");
  const search = params.get("q")?.trim().slice(0, 100) ?? "";
  const client = await getSupabaseServerClient();
  let query = client.from("conversations").select("*").eq("owner_id", user.sub);
  if (search) query = query.ilike("title", `%${search.replace(/[\\%_]/g, "\\$&")}%`);
  if (cursor) {
    if (!/^[0-9a-f-]{36}$/i.test(cursor))
      return Response.json({ error: "invalid cursor" }, { status: 400 });
    const c = await result(
      client
        .from("conversations")
        .select("id,pinned,created_at")
        .eq("id", cursor)
        .eq("owner_id", user.sub)
        .maybeSingle(),
    );
    if (!c) return Response.json({ error: "invalid cursor" }, { status: 400 });
    query = query.or(
      `${c.pinned ? "pinned.eq.false," : ""}and(pinned.eq.${c.pinned},or(created_at.lt.${c.created_at},and(created_at.eq.${c.created_at},id.lt.${c.id})))`,
    );
  }
  const list = await rows<Conversation>(
    query
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1),
  );
  const items = list.slice(0, limit);
  return Response.json({
    items,
    nextCursor: list.length > limit ? (items.at(-1)?.id ?? null) : null,
  });
}
