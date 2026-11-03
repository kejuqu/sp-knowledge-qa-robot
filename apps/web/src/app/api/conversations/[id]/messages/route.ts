import { getTenantUser } from "@/lib/tenant-user";
import { NextResponse } from "next/server";
import { rows, result, type Message } from "@kqa/db";
import { getSupabaseServerClient } from "@kqa/auth/next";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getTenantUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  const client = await getSupabaseServerClient();
  const conversation = await result(
    client.from("conversations").select("id").eq("id", id).eq("owner_id", user.sub).maybeSingle(),
  );
  if (!conversation) return NextResponse.json({ error: "对话不存在" }, { status: 404 });
  const items = await rows<Message>(
    client.from("messages").select("*").eq("conversation_id", id).order("created_at"),
  );
  return NextResponse.json(items);
}
