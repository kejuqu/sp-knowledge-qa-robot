import { getTenantUser } from "@/lib/tenant-user";
import { NextResponse } from "next/server";
import { rows, snakeRow, type Conversation } from "@kqa/db";
import { getSupabaseServerClient } from "@kqa/auth/next";

type Context = { params: Promise<{ id: string }> };
const validId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(request: Request, { params }: Context) {
  const user = await getTenantUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!validId.test(id)) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  const body = await request.json().catch(() => null);
  if (
    !body ||
    (body.title === undefined && body.pinned === undefined) ||
    (body.title !== undefined &&
      (typeof body.title !== "string" || !body.title.trim() || body.title.trim().length > 200)) ||
    (body.pinned !== undefined && typeof body.pinned !== "boolean")
  ) {
    return NextResponse.json(
      { error: "标题须为 1–200 个字符，固定状态须为布尔值" },
      { status: 400 },
    );
  }

  const client = await getSupabaseServerClient();
  const [updated] = await rows<Conversation>(
    client
      .from("conversations")
      .update(
        snakeRow({
          ...(body.title !== undefined ? { title: body.title.trim() } : {}),
          ...(body.pinned !== undefined ? { pinned: body.pinned } : {}),
        }),
      )
      .eq("id", id)
      .eq("owner_id", user.sub)
      .select(),
  );
  if (!updated) return NextResponse.json({ error: "对话不存在" }, { status: 404 });

  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, { params }: Context) {
  const user = await getTenantUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!validId.test(id)) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const client = await getSupabaseServerClient();
  const [deleted] = await rows<Conversation>(
    client.from("conversations").delete().eq("id", id).eq("owner_id", user.sub).select("id"),
  );
  if (!deleted) return NextResponse.json({ error: "对话不存在" }, { status: 404 });
  return new Response(null, { status: 204 });
}
