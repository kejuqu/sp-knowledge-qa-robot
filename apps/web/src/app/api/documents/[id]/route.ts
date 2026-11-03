import { hasPermission } from "@kqa/auth/permissions";
import { getSupabaseAdmin } from "@kqa/db";
import { getTenantUser } from "@/lib/tenant-user";
import { deleteDocumentObject } from "@/lib/object-storage";
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getTenantUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!hasPermission(user, "documents.delete"))
    return Response.json({ error: "没有删除权限" }, { status: 403 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "无效文档 ID" }, { status: 400 });
  const { data, error } = await getSupabaseAdmin().rpc("mutate_document", {
    actor_id: user.sub,
    team_id: user.tenantId,
    document_id: id,
    action_name: "delete",
  });
  if (error)
    return Response.json(
      { error: error.message },
      { status: error.code === "42501" ? 403 : error.code === "P0002" ? 404 : 409 },
    );
  // Soft deletion and vector cleanup are already committed, so failed physical cleanup cannot leak content.
  if (data.objectKey)
    await deleteDocumentObject(data.objectKey).catch(() =>
      console.error("Document storage cleanup failed", id),
    );
  return Response.json({ ok: true });
}
