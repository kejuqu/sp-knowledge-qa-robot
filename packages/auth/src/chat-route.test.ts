import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  failure: "",
  thinking: false,
  modelSignal: null as AbortSignal | null,
  owner: true,
  originalRole: "user",
  operations: [] as Array<{
    table: string;
    op: string;
    value?: Record<string, unknown>;
    filters: Record<string, unknown>;
  }>,
}));
vi.mock("@/lib/tenant-user", () => ({
  getTenantUser: async () => ({ sub: "alice", tenantId: "team" }),
}));
vi.mock("@/lib/model-config", () => ({ getModelConfigForTenant: async () => ({}) }));
vi.mock("@kqa/db", () => ({ result: async (query: unknown) => query }));
vi.mock("../../../packages/ai/src/index", () => ({
  streamRagAnswer: async (...args: unknown[]) => {
    const signal = args[5] as AbortSignal;
    state.modelSignal = signal;
    signal.throwIfAborted();
    if (state.failure) throw new Error(state.failure);
    if (state.thinking)
      await new Promise((_, reject) =>
        signal.addEventListener("abort", () => reject(signal.reason), { once: true }),
      );
    return {
      citations: [],
      stream: (async function* () {
        yield "新答案";
      })(),
    };
  },
}));
vi.mock("@kqa/auth/next", () => ({
  getSupabaseServerClient: async () => ({
    from(table: string) {
      let op = "select";
      let value: Record<string, unknown> | undefined;
      const filters: Record<string, unknown> = {};
      const query = {
        select() {
          return query;
        },
        eq(key: string, val: unknown) {
          filters[key] = val;
          return query;
        },
        gt() {
          return query;
        },
        order() {
          return query;
        },
        limit() {
          filters.limit = true;
          return query;
        },
        maybeSingle() {
          return query;
        },
        single() {
          return query;
        },
        insert(data: Record<string, unknown>) {
          op = "insert";
          value = data;
          return query;
        },
        update(data: Record<string, unknown>) {
          op = "update";
          value = data;
          return query;
        },
        delete() {
          op = "delete";
          return query;
        },
        then(resolve: (data: unknown) => unknown) {
          state.operations.push({ table, op, value, filters });
          if (table === "conversations")
            return Promise.resolve(resolve(state.owner ? { id: "conv" } : null));
          if (op === "select")
            return Promise.resolve(
              resolve(
                filters.limit
                  ? [{ id: "answer", role: "assistant", created_at: "2026-11-01T00:01:00Z" }]
                  : {
                      id: "question",
                      role: state.originalRole,
                      created_at: "2026-11-01T00:00:00Z",
                    },
              ),
            );
          return Promise.resolve(resolve({ id: "question" }));
        },
      };
      return query;
    },
  }),
}));
import { POST } from "../../../apps/web/src/app/api/chat/route";
const conv = "11111111-1111-4111-8111-111111111111";
const edit = "22222222-2222-4222-8222-222222222222";
const request = (signal?: AbortSignal) =>
  new Request("http://app.lvh.me/api/chat", {
    method: "POST",
    signal,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ conversationId: conv, editMessageId: edit, message: "修改后的问题" }),
  });
beforeEach(() => {
  state.failure = "";
  state.thinking = false;
  state.modelSignal = null;
  state.owner = true;
  state.originalRole = "user";
  state.operations = [];
});
it("replaces the question and its paired answer at the original position", async () => {
  const response = await POST(request());
  expect(await response.text()).toContain("新答案");
  expect(state.operations.find((x) => x.op === "update")?.value).toEqual({
    content: "修改后的问题",
  });
  expect(state.operations.some((x) => x.op === "delete" || x.op === "insert")).toBe(false);
  const answerUpdate = state.operations.find((x) => x.op === "update" && x.filters.id === "answer");
  expect(answerUpdate?.value).toEqual({ content: "新答案", citations: [] });
  expect(answerUpdate?.filters.conversation_id).toBe(conv);
});
it("rejects edits to another owner's conversation", async () => {
  state.owner = false;
  expect((await POST(request())).status).toBe(404);
  expect(state.operations.some((x) => x.op !== "select")).toBe(false);
});
it("rejects edits to assistant messages", async () => {
  state.originalRole = "assistant";
  expect((await POST(request())).status).toBe(404);
});

it("cancels model thinking without saving an unfinished answer", async () => {
  state.thinking = true;
  const response = await POST(request());
  const reader = response.body!.getReader();
  expect(new TextDecoder().decode((await reader.read()).value)).toContain("userMessageId");
  await reader.cancel();
  expect(state.modelSignal?.aborted).toBe(true);
  expect(state.operations.some((x) => x.op === "insert")).toBe(false);
});

it("delivers model format errors as a structured stream event", async () => {
  state.failure = "模型返回的答案状态无效，请重试";
  const response = await POST(request());
  const lines = (await response.text())
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  expect(lines[1]).toEqual({ type: "error", message: state.failure });
  expect(state.operations.some((x) => x.op === "insert")).toBe(false);
});
it("does not leak provider internals through the error event", async () => {
  state.failure = "provider internal error with sensitive details";
  const response = await POST(request());
  const body = await response.text();
  expect(body).toContain("生成回答失败，请稍后重试");
  expect(body).not.toContain("sensitive details");
});
