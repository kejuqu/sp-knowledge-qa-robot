import { getTenantUser } from "@/lib/tenant-user";
import { rows, type Document } from "@kqa/db";
import { getSupabaseServerClient } from "@kqa/auth/next";
import { getDocumentChunks } from "@kqa/ai";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getTenantUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const client = await getSupabaseServerClient();
  const [doc] = await rows<Document>(
    client
      .from("documents")
      .select("*")
      .eq("id", id)
      .eq("tenant_id", user.tenantId)
      .is("deleted_at", null)
      .limit(1),
  );

  if (!doc) return Response.json({ error: "文档不存在" }, { status: 404 });
  try {
    const chunks =
      doc.status === "ready" && doc.chunkCount > 0
        ? await getDocumentChunks(id, user.tenantId, client)
        : [];
    return Response.json(chunks, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error(`[chunks] failed to load ${id}:`, error);
    return Response.json({ error: "分块加载失败，请稍后重试" }, { status: 502 });
  }
}
