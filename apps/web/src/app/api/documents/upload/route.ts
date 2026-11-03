import { hasPermission } from "@kqa/auth/permissions";
import { getSupabaseAdmin, result } from "@kqa/db";
import { isSupportedFile, SUPPORTED_EXTENSIONS } from "@kqa/ai";
import { getTenantUser } from "@/lib/tenant-user";
import { createDocumentObjectKey } from "@/lib/object-storage";
import { MAX_DOCUMENT_BYTES, signUploadTicket } from "@/lib/upload-ticket";

export async function POST(request: Request) {
  const user = await getTenantUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!hasPermission(user, "documents.upload"))
    return Response.json({ error: "没有上传文档权限" }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (
    typeof body?.filename !== "string" ||
    !body.filename ||
    body.filename.length > 255 ||
    !isSupportedFile(body.filename)
  ) {
    return Response.json(
      { error: `文件名不能超过 255 字，当前支持 ${SUPPORTED_EXTENSIONS.join(" / ")} 格式` },
      { status: 400 },
    );
  }
  if (!Number.isSafeInteger(body.size) || body.size <= 0 || body.size > MAX_DOCUMENT_BYTES) {
    return Response.json({ error: "文件不能为空且不能超过 20MB" }, { status: 400 });
  }
  const ticket = {
    id: crypto.randomUUID(),
    userId: user.sub,
    tenantId: user.tenantId,
    filename: body.filename as string,
    size: body.size as number,
    expiresAt: Date.now() + 15 * 60_000,
  };
  const objectKey = createDocumentObjectKey(user.tenantId, ticket.id, ticket.filename);
  try {
    const upload = await result(
      getSupabaseAdmin()
        .storage.from("kqa-documents")
        .createSignedUploadUrl(objectKey, { upsert: false }),
    );
    if (!upload) throw new Error("Missing upload URL");
    return Response.json(
      { uploadUrl: upload.signedUrl, ticket: signUploadTicket(ticket) },
      {
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch {
    return Response.json({ error: "无法创建上传凭证，请稍后重试" }, { status: 502 });
  }
}
