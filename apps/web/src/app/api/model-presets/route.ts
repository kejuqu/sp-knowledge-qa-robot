import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@kqa/auth/next";
import { getTenantUser } from "@/lib/tenant-user";

export async function GET(request: Request) {
  const kind = new URL(request.url).searchParams.get("kind") ?? "llm";
  if (kind !== "llm" && kind !== "embedding") return NextResponse.json({ error: "无效的模型类型" }, { status: 400 });
  const user = await getTenantUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const client = await getSupabaseServerClient();
  const { data, error } = await client.from("model_presets").select("id,model,base_url").eq("kind", kind).order("created_at");
  if (error) return NextResponse.json({ error: "无法加载通用模型" }, { status: 500 });
  return NextResponse.json(data.map((row) => ({ id: row.id, model: row.model, baseUrl: row.base_url })));
}
