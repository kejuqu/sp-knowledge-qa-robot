import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: { sub: "alice", tenantId: "team-a" } as { sub: string; tenantId: string } | null,
  allowed: true, size: 5, existing: false,
  rpc: vi.fn(), download: vi.fn(), enqueue: vi.fn(),
}));
vi.mock("@/lib/tenant-user", () => ({ getTenantUser: async () => state.user }));
vi.mock("@kqa/auth/permissions", () => ({ hasPermission: () => state.allowed }));
vi.mock("@/lib/queue", () => ({ enqueueDocument: state.enqueue }));
vi.mock("@/lib/document-file", () => ({ documentSha256: () => "server-computed-hash" }));
vi.mock("@/lib/utils", () => ({ getDocumentMimeType: () => "text/plain" }));
vi.mock("@kqa/ai", () => ({ extractText: async () => "hello", isSupportedFile: () => true, SUPPORTED_EXTENSIONS: ["txt"] }));
vi.mock("@/lib/upload-ticket", async () => await import("../../../apps/web/src/lib/upload-ticket"));
vi.mock("@/lib/object-storage", () => ({
  createDocumentObjectKey: (tenant: string, id: string) => `${tenant}/${id}/original.txt`,
  createDocumentObjectUrl: (key: string) => `supabase://kqa-documents/${key}`,
  deleteDocumentObject: vi.fn(), uploadDocumentObject: vi.fn(),
}));
vi.mock("@kqa/auth/next", () => ({ getSupabaseServerClient: async () => ({ from: () => {
  const query = { select: () => query, eq: () => query, is: () => query,
    maybeSingle: async () => ({ data: state.existing ? { id: "existing" } : null, error: null }),
    limit: async () => ({ data: [], error: null }) };
  return query;
} }) }));
vi.mock("@kqa/db", () => ({
  result: async (promise: Promise<{ data: unknown; error: unknown }>) => {
    const response = await promise;
    if (response.error) throw response.error;
    return response.data;
  },
  rows: vi.fn(),
  getSupabaseAdmin: () => ({ rpc: state.rpc, storage: { from: () => ({
    info: async () => ({ data: { size: state.size }, error: null }), download: state.download,
  }) } }),
}));
import { POST } from "../../../apps/web/src/app/api/documents/route";
import { signUploadTicket } from "../../../apps/web/src/lib/upload-ticket";

const ticket = (userId = "alice", tenantId = "team-a") => signUploadTicket({
  id: "01234567-89ab-cdef-0123-456789abcdef", userId, tenantId,
  filename: "example.txt", size: 5, expiresAt: Date.now() + 60_000,
});
const request = (value = ticket()) => new Request("https://example.vercel.app/api/documents", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticket: value }),
});
beforeEach(() => {
  process.env.SUPABASE_SECRET_KEY = "test-server-secret";
  state.user = { sub: "alice", tenantId: "team-a" }; state.allowed = true; state.size = 5; state.existing = false;
  state.rpc.mockReset().mockResolvedValue({ data: "id", error: null });
  state.download.mockReset().mockResolvedValue({ data: new Blob(["hello"]), error: null });
  state.enqueue.mockClear();
});

describe("direct upload completion", () => {
  it("requires a current authenticated upload permission", async () => {
    state.user = null;
    expect((await POST(request())).status).toBe(401);
    state.user = { sub: "alice", tenantId: "team-a" }; state.allowed = false;
    expect((await POST(request())).status).toBe(403);
    expect(state.download).not.toHaveBeenCalled();
  });
  it("rejects forged or cross-team tickets before accessing storage", async () => {
    for (const value of ["forged", ticket("bob"), ticket("alice", "team-b")]) {
      expect((await POST(request(value))).status).toBe(400);
    }
    expect(state.download).not.toHaveBeenCalled();
  });
  it("checks actual stored size before downloading or creating a document", async () => {
    state.size = 6;
    expect((await POST(request())).status).toBe(400);
    expect(state.download).not.toHaveBeenCalled();
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it("parses the stored file and creates the document with server-controlled metadata", async () => {
    expect((await POST(request())).status).toBe(202);
    expect(state.rpc).toHaveBeenCalledWith("create_document", expect.objectContaining({
      actor_id: "alice", document_data: expect.objectContaining({
        tenant_id: "team-a", sha256: "server-computed-hash", source_text: "hello", size_bytes: 5,
      }),
    }));
    expect(state.enqueue).toHaveBeenCalledOnce();
  });
  it("allows completion retries without creating another document", async () => {
    state.existing = true;
    expect((await POST(request())).status).toBe(202);
    expect(state.download).not.toHaveBeenCalled();
    expect(state.rpc).not.toHaveBeenCalled();
  });
});
