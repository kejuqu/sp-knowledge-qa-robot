import { getSupabaseAdmin, camelRow } from "@kqa/db";
import { requireTeamManager, newApiKey } from "@/lib/team-api-key";
import { ImportError, readImportBody } from "@/lib/team-import-input";
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
async function handle(request?: Request) {
  try {
    const actor = await requireTeamManager();
    let body: Record<string, unknown> = {};
    if (request) {
      try {
        body = JSON.parse(new TextDecoder().decode(await readImportBody(request)));
      } catch (error) {
        if (error instanceof ImportError) throw error;
        throw new ImportError("无效 JSON");
      }
    }
    if (!body || typeof body !== "object") throw new ImportError("无效请求");
    const action = !request ? "list" : request.method === "POST" ? "create" : "revoke";
    if (
      action === "create" &&
      (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 100)
    )
      throw new ImportError("请输入 1–100 字的密钥名称");
    if (action === "revoke" && (typeof body.id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.id)))
      throw new ImportError("无效密钥 ID");
    const secret = action === "create" ? newApiKey() : null;
    const { data, error } = await getSupabaseAdmin().rpc("manage_api_key", {
      actor_id: actor.sub,
      team_id: actor.tenantId,
      action_name: action,
      key_data: secret
        ? { name: body.name, key_hash: secret.keyHash, prefix: secret.prefix }
        : { id: body.id },
    });
    if (error)
      throw new ImportError(
        error.message,
        error.code === "42501" ? 403 : error.code === "P0002" ? 404 : 409,
      );
    if (action === "list") return json({ keys: (data as unknown[]).map((row) => camelRow(row)) });
    return secret
      ? json({ ...camelRow<Record<string, unknown>>(data), key: secret.key }, 201)
      : json({ ok: true });
  } catch (error) {
    return json(
      { error: error instanceof ImportError ? error.message : "密钥操作失败，请稍后重试" },
      error instanceof ImportError ? error.status : 500,
    );
  }
}
export async function GET() {
  return handle();
}
export async function POST(request: Request) {
  return handle(request);
}
export async function DELETE(request: Request) {
  return handle(request);
}
