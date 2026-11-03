import { getTenantUser } from "@/lib/tenant-user";
import { NextResponse } from "next/server";
import { result } from "@kqa/db";
import { getSupabaseServerClient } from "@kqa/auth/next";
import { streamRagAnswer } from "@kqa/ai";
import { getModelConfigForTenant } from "@/lib/model-config";

/**
 * POST /api/chat
 * body: { conversationId?: string, message: string, documentIds?: string[] }
 * 响应：text/plain 流（首个 chunk 前先发一行 JSON 元信息：会话和用户消息 ID）
 */
export async function POST(request: Request) {
  const user = await getTenantUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const client = await getSupabaseServerClient();
  const { conversationId, message, documentIds, editMessageId } = await request.json();
  if (typeof message !== "string" || !message.trim() || message.length > 20000) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  if (editMessageId && !conversationId)
    return NextResponse.json({ error: "conversation is required for editing" }, { status: 400 });

  // 没有会话就新建，标题取问题前 20 字
  let convId = conversationId as string | undefined;
  if (convId) {
    if (
      typeof convId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(convId)
    ) {
      return NextResponse.json({ error: "invalid id" }, { status: 400 });
    }
    const conversation = await result(
      client
        .from("conversations")
        .select("id")
        .eq("id", convId)
        .eq("owner_id", user.sub)
        .maybeSingle(),
    );
    if (!conversation) return NextResponse.json({ error: "对话不存在" }, { status: 404 });
  }
  if (!convId) {
    const conv = await result(
      client
        .from("conversations")
        .insert({ owner_id: user.sub, title: message.slice(0, 20) })
        .select("id")
        .single(),
    );
    if (!conv) throw new Error("无法创建对话");
    convId = conv.id;
  }

  if (
    editMessageId &&
    (!convId || typeof editMessageId !== "string" || !/^[0-9a-f-]{36}$/i.test(editMessageId))
  ) {
    return NextResponse.json({ error: "invalid message id" }, { status: 400 });
  }
  const original = editMessageId
    ? await result(
        client
          .from("messages")
          .select("id,created_at,role")
          .eq("id", editMessageId)
          .eq("conversation_id", convId)
          .maybeSingle(),
      )
    : null;
  if (editMessageId && original?.role !== "user")
    return NextResponse.json({ error: "消息不存在" }, { status: 404 });
  let replacementMessageId: string | undefined;
  if (original) {
    const next = await result(
      client
        .from("messages")
        .select("id,role,created_at")
        .eq("conversation_id", convId)
        .gt("created_at", original.created_at)
        .order("created_at")
        .limit(1),
    );
    if (next?.[0]?.role === "assistant") replacementMessageId = next[0].id;
  }
  const userMessage = original
    ? await result(
        client
          .from("messages")
          .update({ content: message })
          .eq("id", original.id)
          .eq("conversation_id", convId)
          .select("id")
          .single(),
      )
    : await result(
        client
          .from("messages")
          .insert({ conversation_id: convId, role: "user", content: message })
          .select("id")
          .single(),
      );

  if (!userMessage) throw new Error("无法保存消息");
  const requestedDocumentIds = Array.isArray(documentIds)
    ? documentIds
        .filter((id): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id))
        .slice(0, 50)
    : [];
  const permittedDocumentIds = requestedDocumentIds.length
    ? (
        (await result(
          client
            .from("documents")
            .select("id")
            .eq("tenant_id", user.tenantId)
            .is("deleted_at", null)
            .eq("status", "ready")
            .in("id", requestedDocumentIds),
        )) ?? []
      ).map((document) => document.id)
    : [];
  const config = await getModelConfigForTenant(user.tenantId);
  const abort = new AbortController();
  const cancel = () => abort.abort();
  request.signal.addEventListener("abort", cancel, { once: true });
  if (request.signal.aborted) cancel();
  const metaLine = JSON.stringify({ conversationId: convId, userMessageId: userMessage.id }) + "\n";
  const encoder = new TextEncoder();
  const finalConvId = convId;

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(metaLine));
      let full = "";
      try {
        const { stream, citations } = await streamRagAnswer(
          message,
          user.tenantId,
          config,
          documentIds === undefined ? null : permittedDocumentIds,
          client,
          abort.signal,
        );
        for await (const chunk of stream) {
          abort.signal.throwIfAborted();
          full += chunk;
          controller.enqueue(
            encoder.encode(JSON.stringify({ type: "delta", content: chunk }) + "\n"),
          );
        }
        abort.signal.throwIfAborted();
        // Editing keeps the existing assistant message ID and position.
        const answerData = { content: full, citations };
        await result(
          replacementMessageId
            ? client
                .from("messages")
                .update(answerData)
                .eq("id", replacementMessageId)
                .eq("conversation_id", finalConvId)
            : client
                .from("messages")
                .insert({ conversation_id: finalConvId, role: "assistant", ...answerData }),
        );
      } catch (err) {
        if (!abort.signal.aborted) {
          const message =
            err instanceof Error && /^模型/.test(err.message)
              ? err.message
              : "生成回答失败，请稍后重试";
          controller.enqueue(encoder.encode(JSON.stringify({ type: "error", message }) + "\n"));
          controller.close();
        }
        return;
      } finally {
        request.signal.removeEventListener("abort", cancel);
      }
      controller.close();
    },
    cancel() {
      cancel();
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
  });
}
