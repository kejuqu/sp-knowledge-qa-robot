import { expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ hasAnswer: false as unknown }));
vi.mock("../../../packages/ai/src/models", () => ({
  createChatModel: () =>
    Object.assign(async () => "回答正文", {
      withStructuredOutput: () => ({ invoke: async () => ({ hasAnswer: state.hasAnswer }) }),
    }),
}));
vi.mock("../../../packages/ai/src/vector-store", () => ({
  searchDocumentVectors: async () => [
    [
      {
        pageContent: "考勤制度",
        metadata: { documentId: "doc", filename: "制度.txt", chunkIndex: 0 },
      },
      0.8,
    ],
  ],
}));
import { streamRagAnswer } from "../../../packages/ai/src/rag";
import type { ModelConfig } from "../../../packages/ai/src/models";
import type { SupabaseClient } from "@kqa/db";
it.each([false, true])("controls citations with model hasAnswer=%s", async (flag) => {
  state.hasAnswer = flag;
  const result = await streamRagAnswer(
    "问题",
    "team",
    {} as ModelConfig,
    null,
    {} as SupabaseClient,
  );
  expect(result.hasAnswer).toBe(flag);
  expect(result.citations).toHaveLength(flag ? 1 : 0);
  let text = "";
  for await (const chunk of result.stream) text += chunk;
  expect(text).toBe(flag ? "回答正文" : "知识库中未找到相关内容。");
});

it("rejects invalid structured status rather than guessing from answer text", async () => {
  state.hasAnswer = "true";
  await expect(
    streamRagAnswer("问题", "team", {} as ModelConfig, null, {} as SupabaseClient),
  ).rejects.toThrow("模型未返回有效的知识判断");
});
it("honors cancellation before starting retrieval or inference", async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(
    streamRagAnswer(
      "问题",
      "team",
      {} as ModelConfig,
      null,
      {} as SupabaseClient,
      controller.signal,
    ),
  ).rejects.toThrow();
});
