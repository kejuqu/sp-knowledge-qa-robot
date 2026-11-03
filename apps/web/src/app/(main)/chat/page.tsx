"use client";
import { useI18n } from "@kqa/i18n";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageScroller, useMessageScroller } from "@shadcn/react/message-scroller";
import { TooltipHint } from "@kqa/ui/components/tooltip";
import { Skeleton } from "@kqa/ui/components/skeleton";
import { toast } from "@kqa/ui/components/sonner";
import { Button } from "@kqa/ui/components/button";
import { Textarea } from "@kqa/ui/components/textarea";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@kqa/ui/components/input-group";
import {
  ArrowDown,
  Pencil,
  Square,
  ArrowUp,
  ArrowUpRight,
  Bot,
  Check,
  Copy,
  FileText,
  Plus,
  Sparkles,
  User as UserIcon,
} from "lucide-react";
import { MessageMarkdown } from "@/components/chat/message-markdown";
import { CitationPanel, type CitationChunk } from "@/components/documents/document-preview";
import { formatMessageTime } from "@/lib/utils";
import { ModelSelector } from "@/components/chat/model-selector";
import {
  KnowledgeBaseSelector,
  type KnowledgeBaseDocument,
} from "@/components/chat/knowledge-base-selector";
import { usePermission } from "@/components/tenant-role";
import { ACCEPT_STRING, useDocumentUpload } from "@/components/documents/use-document-upload";
import { useChatStore } from "@/stores/chat-store";
import { useSidebar } from "@kqa/ui/components/sidebar";
import { cn } from "@kqa/ui/lib/utils";
interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
  citations?: CitationChunk[] | null;
}
interface PendingMessage {
  id: string;
  role: "user";
  content: string;
  conversationId: string | null;
  serverMessageId?: string;
}
interface ModelSettings {
  llmModel: string;
}
/** 点击引用来源时暂存的预览状态：整条消息的 citations + 选中的文档 */
interface ActiveCitation {
  citations: CitationChunk[];
  documentId: string;
  revision: number;
}
const PANEL_MIN_WIDTH = 280;
const PANEL_MAX_WIDTH = 800;
const PANEL_WIDTH_STORAGE_KEY = "kqa.citation-panel-width";
function readStoredPanelWidth() {
  if (typeof window === "undefined") return PANEL_MAX_WIDTH;
  const saved = Number(window.localStorage.getItem(PANEL_WIDTH_STORAGE_KEY));
  return Number.isFinite(saved)
    ? Math.min(Math.max(saved, PANEL_MIN_WIDTH), PANEL_MAX_WIDTH)
    : PANEL_MAX_WIDTH;
}
export default function ChatPage() {
  return (
    <Suspense fallback={<ChatHistorySkeleton />}>
      <ChatContent />
    </Suspense>
  );
}
function ChatContent() {
  const { t, locale } = useI18n();
  const canUpload = usePermission("documents.upload");
  const searchParams = useSearchParams();
  const activeConversationId = searchParams.get("id");
  const { setActiveConversation, streaming, setStreaming } = useChatStore();
  useEffect(() => {
    setActiveConversation(activeConversationId);
  }, [activeConversationId, setActiveConversation]);
  // 切换会话时收起文档预览面板
  useEffect(() => {
    setActiveCitations(null);
  }, [activeConversationId]);
  function openCitationPanel(citations: CitationChunk[], documentId: string) {
    setActiveCitations((previous) => ({
      citations,
      documentId,
      revision: (previous?.revision ?? 0) + 1,
    }));
  }
  function handlePanelResize(clientX: number) {
    const next = Math.min(Math.max(window.innerWidth - clientX, PANEL_MIN_WIDTH), PANEL_MAX_WIDTH);
    setPanelWidth(Math.round(next));
  }
  function handlePanelResizeEnd() {
    try {
      window.localStorage.setItem(PANEL_WIDTH_STORAGE_KEY, String(panelWidth));
    } catch {
      // localStorage 不可用时忽略
    }
  }
  const abortRequest = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      abortRequest.current?.abort();
    },
    [],
  );
  const [input, setInput] = useState("");
  const [liveAnswer, setLiveAnswer] = useState("");
  const renderIds = useRef(new Map<string, string>());
  const liveRenderId = useRef("live-answer");
  const [editingTurn, setEditingTurn] = useState<{
    questionId: string;
    answerId?: string;
    content: string;
  } | null>(null);
  const [highlightedAnswer, setHighlightedAnswer] = useState<{
    ids: string[];
    revision: number;
  } | null>(null);
  useEffect(() => {
    if (!highlightedAnswer) return;
    const timer = window.setTimeout(() => setHighlightedAnswer(null), 3000);
    return () => window.clearTimeout(timer);
  }, [highlightedAnswer]);
  const [pendingMessages, setPendingMessages] = useState<PendingMessage[]>([]);
  const [settledMessageAnchor, setSettledMessageAnchor] = useState<{
    id: string;
    conversationId: string;
  } | null>(null);
  const [selectedModel, setSelectedModel] = useState("");
  const [selectedKnowledgeBaseIds, setSelectedKnowledgeBaseIds] = useState<string[]>([]);
  const [activeCitations, setActiveCitations] = useState<ActiveCitation | null>(null);
  const [panelWidth, setPanelWidth] = useState(readStoredPanelWidth);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { upload, tasks: uploadTasks, error: uploadError } = useDocumentUpload();
  useEffect(() => {
    let animationFrame = 0;
    const focusInput = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => inputRef.current?.focus());
    };
    window.addEventListener("kqa:new-conversation", focusInput);
    if (!activeConversationId) focusInput();
    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("kqa:new-conversation", focusInput);
    };
  }, [activeConversationId]);
  const { data: modelSettings } = useQuery<ModelSettings>({
    queryKey: ["chat-model"],
    queryFn: () => fetch("/api/settings").then((response) => response.json()),
  });
  const { data: knowledgeBaseDocuments = [] } = useQuery<KnowledgeBaseDocument[]>({
    queryKey: ["documents"],
    queryFn: () => fetch("/api/documents").then((response) => response.json()),
  });
  const availableModels = useMemo(
    () => [
      {
        value: modelSettings?.llmModel || "default",
        label: modelSettings?.llmModel || t("默认模型"),
      },
    ],
    [modelSettings?.llmModel, locale],
  );
  const activeModel = availableModels.some((model) => model.value === selectedModel)
    ? selectedModel
    : availableModels[0].value;
  const {
    data: history = [],
    isLoading: isHistoryLoading,
    error: historyError,
  } = useQuery<Message[]>({
    queryKey: ["messages", activeConversationId],
    queryFn: () =>
      fetch(`/api/conversations/${activeConversationId}/messages`).then(async (r) => {
        if (!r.ok) throw new Error(t("加载对话失败"));
        return r.json();
      }),
    enabled: !!activeConversationId,
  });
  // 同一条用户消息一旦已从服务端历史中读到，就用服务端版本替换本地占位，避免重复。
  const visibleHistory = useMemo(() => {
    const hidden = new Set<string>();
    for (const pending of pendingMessages) {
      if (!pending.serverMessageId) continue;
      hidden.add(pending.serverMessageId);
      const index = history.findIndex((item) => item.id === pending.serverMessageId);
      if (index >= 0 && history[index + 1]?.role === "assistant") hidden.add(history[index + 1].id);
    }
    const items = history.filter((message) => !hidden.has(message.id));
    if (!editingTurn) return items;
    return items.flatMap((message): Message[] => {
      if (message.id === editingTurn.questionId) {
        const edited = { ...message, content: editingTurn.content };
        return editingTurn.answerId
          ? [edited]
          : [edited, { id: "live", role: "assistant", content: liveAnswer }];
      }
      if (message.id === editingTurn.answerId)
        return [{ ...message, content: liveAnswer, citations: null }];
      return [message];
    });
  }, [history, pendingMessages, editingTurn, liveAnswer]);
  const visiblePendingMessages = pendingMessages.filter(
    (pending) => !pending.conversationId || pending.conversationId === activeConversationId,
  );
  const hasVisibleMessages = visibleHistory.length > 0 || visiblePendingMessages.length > 0;
  async function send(editedContent?: string, editMessageId?: string) {
    const message = (editedContent ?? input).trim();
    if (!message || streaming) return;
    const abort = new AbortController();
    abortRequest.current = abort;
    const pendingId = `pending-${createPendingMessageId()}`;
    liveRenderId.current = `${pendingId}-answer`;
    const requestConversationId = activeConversationId;
    setSettledMessageAnchor(null);
    setInput("");
    if (editMessageId) setActiveCitations(null);
    if (editMessageId) {
      const index = history.findIndex((item) => item.id === editMessageId);
      const answer = history[index + 1];
      setEditingTurn({
        questionId: editMessageId,
        answerId: answer?.role === "assistant" ? answer.id : undefined,
        content: message,
      });
    }
    // Editing is rendered in place; only new questions append an optimistic bubble.
    if (!editMessageId)
      setPendingMessages((current) => [
        ...current,
        {
          id: pendingId,
          role: "user",
          content: message,
          conversationId: requestConversationId,
          serverMessageId: editMessageId,
        },
      ]);
    setStreaming(true);
    setLiveAnswer("");
    let resolvedConversationId = requestConversationId;
    let resolvedUserMessageId = editMessageId;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        signal: abort.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          editMessageId,
          conversationId: requestConversationId,
          message,
          // 未指定文档时省略筛选，检索全部可访问知识；空数组会让后端跳过召回。
          documentIds: selectedKnowledgeBaseIds.length ? selectedKnowledgeBaseIds : undefined,
        }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? t("发送失败，请稍后重试"));
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let metaParsed = false;
      let answer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // 第一个换行符之前是服务端发的 JSON 元信息（conversationId + userMessageId）。
        if (!metaParsed) {
          const idx = buffer.indexOf("\n");
          if (idx === -1) continue;
          const meta = JSON.parse(buffer.slice(0, idx)) as {
            conversationId: string;
            userMessageId: string;
          };
          buffer = buffer.slice(idx + 1);
          metaParsed = true;
          resolvedConversationId = meta.conversationId;
          resolvedUserMessageId = meta.userMessageId;
          if (!editMessageId) renderIds.current.set(meta.userMessageId, pendingId);
          if (editMessageId)
            void queryClient.invalidateQueries({ queryKey: ["messages", meta.conversationId] });
          setPendingMessages((current) =>
            current.map((pending) =>
              pending.id === pendingId
                ? {
                    ...pending,
                    conversationId: meta.conversationId,
                    serverMessageId: meta.userMessageId,
                  }
                : pending,
            ),
          );
          if (!requestConversationId) {
            window.history.replaceState(
              null,
              "",
              `/chat?id=${encodeURIComponent(meta.conversationId)}`,
            );
            setActiveConversation(meta.conversationId);
          }
        }
        let newline: number;
        while ((newline = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, newline);
          buffer = buffer.slice(newline + 1);
          if (!line.trim()) continue;
          const event = JSON.parse(line) as { type: string; content?: string; message?: string };
          if (event.type === "error") throw new Error(event.message || t("发送失败，请稍后重试"));
          if (event.type === "delta") {
            answer += event.content ?? "";
            setLiveAnswer(answer);
          }
        }
      }
      if (resolvedConversationId) {
        // 等历史记录已落库并重新取得后再移除占位，消息区不会在请求末尾闪空。
        await queryClient.invalidateQueries({
          queryKey: ["messages", resolvedConversationId],
        });
        const updated =
          queryClient.getQueryData<Message[]>(["messages", resolvedConversationId]) ?? [];
        const index = updated.findIndex((item) => item.id === resolvedUserMessageId);
        const replacement = index >= 0 ? updated[index + 1] : undefined;
        if (replacement?.role === "assistant") {
          if (!editMessageId) renderIds.current.set(replacement.id, liveRenderId.current);
          setSettledMessageAnchor({
            id: resolvedUserMessageId ?? replacement.id,
            conversationId: resolvedConversationId,
          });
          if (editMessageId)
            setHighlightedAnswer((previous) => ({
              ids: [editMessageId, replacement.id],
              revision: (previous?.revision ?? 0) + 1,
            }));
        } else if (resolvedUserMessageId) {
          setSettledMessageAnchor({
            id: resolvedUserMessageId,
            conversationId: resolvedConversationId,
          });
        }
      }
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      setPendingMessages((current) => current.filter((pending) => pending.id !== pendingId));
    } catch (error) {
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      if (!abort.signal.aborted)
        toast.error(
          t(
            error instanceof Error && error.message !== "network error"
              ? error.message
              : "发送失败，请稍后重试",
          ),
        );
      if (resolvedConversationId) {
        await queryClient.invalidateQueries({ queryKey: ["messages", resolvedConversationId] });
        if (resolvedUserMessageId)
          setSettledMessageAnchor({
            id: resolvedUserMessageId,
            conversationId: resolvedConversationId,
          });
      }
      // Keep the optimistic anchor until its persisted replacement has loaded.
      setPendingMessages((current) => current.filter((pending) => pending.id !== pendingId));
    } finally {
      if (abortRequest.current === abort) abortRequest.current = null;
      setStreaming(false);
      setLiveAnswer("");
      setEditingTurn(null);
    }
  }
  return (
    <div className="chat-page flex h-[calc(100dvh-4rem)] flex-col overflow-hidden md:h-dvh">
      <MobileNewConversationButton />
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <MessageScroller.Provider
            autoScroll={false}
            defaultScrollPosition="last-anchor"
            scrollPreviousItemPeek={0}
          >
            <ScrollToSentMessage
              messageId={
                streaming && editingTurn
                  ? (renderIds.current.get(editingTurn.questionId) ?? editingTurn.questionId)
                  : (visiblePendingMessages.at(-1)?.id ??
                    (settledMessageAnchor?.conversationId === activeConversationId
                      ? (renderIds.current.get(settledMessageAnchor.id) ?? settledMessageAnchor.id)
                      : undefined))
              }
              align="start"
              revision={editingTurn ? 0 : highlightedAnswer?.revision}
            />
            <MessageScroller.Root className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
              <MessageScroller.Viewport
                id="chat-messages"
                className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-8 sm:px-10"
                aria-label={t("问答消息")}
              >
                <MessageScroller.Content
                  className="mx-auto flex w-full max-w-3xl flex-col gap-7"
                  aria-busy={streaming}
                >
                  {historyError && (
                    <p role="alert" className="text-center text-sm text-destructive">
                      {t("无法加载对话，可能已被删除或暂时不可用。")}
                    </p>
                  )}
                  {/* 骨架屏只在没有其他内容可展示时出现，避免新会话首条消息回复期间闪烁 */}
                  {isHistoryLoading && !hasVisibleMessages && !streaming && (
                    <MessageScroller.Item messageId="history-loading">
                      <ChatHistorySkeleton />
                    </MessageScroller.Item>
                  )}
                  {!historyError && !isHistoryLoading && !hasVisibleMessages && !streaming && (
                    <MessageScroller.Item messageId="empty-state">
                      <div className="flex min-h-[50vh] flex-col items-center justify-center pb-20 text-center">
                        <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-card text-primary shadow-sm">
                          <Sparkles className="size-5" />
                        </div>
                        <p className="text-base font-medium text-foreground">
                          {t("从知识库开始一场对话")}
                        </p>
                        <p className="mt-1.5 text-sm text-muted-foreground">
                          {t("上传文档后，向我提问即可获得基于资料的回答")}
                        </p>
                      </div>
                    </MessageScroller.Item>
                  )}
                  {(!isHistoryLoading || visiblePendingMessages.length > 0) &&
                    (
                      [
                        ...visibleHistory,
                        ...visiblePendingMessages,
                        ...(streaming && !editingTurn
                          ? [{ id: "live", role: "assistant" as const, content: liveAnswer }]
                          : []),
                      ] as Message[]
                    ).map((message) => (
                      <MessageScroller.Item
                        key={
                          message.id === "live"
                            ? liveRenderId.current
                            : (renderIds.current.get(message.id) ?? message.id)
                        }
                        messageId={
                          message.id === "live"
                            ? liveRenderId.current
                            : (renderIds.current.get(message.id) ?? message.id)
                        }
                        scrollAnchor={message.role === "user"}
                      >
                        <MessageBubble
                          message={message}
                          highlightRevision={
                            editingTurn &&
                            (message.id === editingTurn.questionId ||
                              message.id === editingTurn.answerId ||
                              message.id === "live")
                              ? 0
                              : highlightedAnswer?.ids.includes(message.id)
                                ? highlightedAnswer.revision
                                : undefined
                          }
                          onEdit={streaming ? undefined : (content) => send(content, message.id)}
                          onPreviewCitations={openCitationPanel}
                        />
                      </MessageScroller.Item>
                    ))}
                </MessageScroller.Content>
              </MessageScroller.Viewport>
              <MessageScroller.Button className="absolute bottom-4 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full bg-background px-3 py-1.5 text-xs font-medium shadow-sm inert:hidden">
                <ArrowDown className="size-3" />
                {t("回到最新消息")}
              </MessageScroller.Button>
            </MessageScroller.Root>

            <div className="shrink-0 px-4 pb-5 pt-3 sm:px-10 sm:pb-6">
              <div className="mx-auto w-full max-w-3xl">
                <form
                  ref={formRef}
                  onSubmit={(event) => {
                    event.preventDefault();
                    void send();
                  }}
                >
                  {canUpload && (
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={ACCEPT_STRING}
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void upload(file);
                        event.target.value = "";
                      }}
                    />
                  )}
                  <InputGroup className="chat-composer h-36 gap-2 rounded-3xl border-0 p-4">
                    <InputGroupTextarea
                      ref={inputRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                          e.preventDefault();
                          formRef.current?.requestSubmit();
                        }
                      }}
                      placeholder={t("输入问题…")}
                      aria-label={t("输入问题")}
                      className="chat-composer-input min-h-0 p-0"
                    />
                    <InputGroupAddon align="block-end" className="gap-3 p-0">
                      {canUpload && (
                        <TooltipHint content={t("上传知识库")}>
                          <span
                            className="inline-flex shrink-0"
                            tabIndex={uploadTasks.length > 0 ? 0 : undefined}
                          >
                            <InputGroupButton
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              className="chat-composer-upload size-10 shrink-0 rounded-full"
                              onClick={() => fileInputRef.current?.click()}
                              disabled={uploadTasks.length > 0}
                              aria-label={t("上传知识库文档")}
                            >
                              <Plus data-icon="inline-start" />
                            </InputGroupButton>
                          </span>
                        </TooltipHint>
                      )}
                      <div className="ml-auto min-w-0">
                        <KnowledgeBaseSelector
                          documents={knowledgeBaseDocuments}
                          selectedIds={selectedKnowledgeBaseIds}
                          onSelectedIdsChange={setSelectedKnowledgeBaseIds}
                          disabled={streaming}
                        />
                      </div>
                      <div className="min-w-0">
                        <ModelSelector
                          models={availableModels}
                          value={activeModel}
                          onValueChange={setSelectedModel}
                          disabled={streaming}
                        />
                      </div>
                      <TooltipHint
                        content={
                          streaming
                            ? t("停止生成")
                            : !input.trim()
                              ? t("请输入文本")
                              : t("发送消息 · Enter 发送，Shift+Enter 换行")
                        }
                      >
                        <span
                          className="inline-flex shrink-0"
                          tabIndex={streaming || !input.trim() ? 0 : undefined}
                        >
                          <InputGroupButton
                            type={streaming ? "button" : "submit"}
                            onClick={streaming ? () => abortRequest.current?.abort() : undefined}
                            variant="default"
                            disabled={!streaming && !input.trim()}
                            size="icon-sm"
                            data-generating={streaming ? "true" : undefined}
                            className="chat-composer-send size-10 shrink-0 rounded-full shadow-none"
                            aria-label={streaming ? t("停止生成") : t("发送消息")}
                            aria-keyshortcuts="Enter"
                          >
                            {streaming ? (
                              <Square data-icon="inline-start" className="fill-current" />
                            ) : (
                              <ArrowUp data-icon="inline-start" />
                            )}
                          </InputGroupButton>
                        </span>
                      </TooltipHint>
                    </InputGroupAddon>
                  </InputGroup>
                </form>
                {(uploadTasks[0] || uploadError) && (
                  <p
                    className={
                      uploadError
                        ? "px-2 pt-1 text-xs text-destructive"
                        : "px-2 pt-1 text-xs text-muted-foreground"
                    }
                  >
                    {uploadError || t("正在上传知识库文档：{p0}", { p0: uploadTasks[0].name })}
                  </p>
                )}
              </div>
            </div>
          </MessageScroller.Provider>
        </div>

        {activeCitations && (
          <>
            <PanelResizeHandle onResize={handlePanelResize} onResizeEnd={handlePanelResizeEnd} />
            <CitationPanel
              key={activeCitations.revision}
              citations={activeCitations.citations}
              initialDocumentId={activeCitations.documentId}
              width={panelWidth}
              onClose={() => setActiveCitations(null)}
            />
          </>
        )}
      </div>
    </div>
  );
}
function MobileNewConversationButton() {
  const { t } = useI18n();
  const router = useRouter();
  const { isMobile, mobileOpen } = useSidebar();
  const { setActiveConversation, streaming } = useChatStore();
  if (!isMobile || mobileOpen) return null;
  return (
    <TooltipHint content={t("新建对话")} side="bottom">
      <button
        type="button"
        className="fixed right-3 top-3 z-30 flex size-10 items-center justify-center rounded-xl bg-card text-foreground shadow-md transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
        disabled={streaming}
        onClick={() => {
          setActiveConversation(null);
          router.push("/chat");
          window.dispatchEvent(new Event("kqa:new-conversation"));
        }}
        aria-label={t("新建对话")}
      >
        <Plus className="size-5" />
      </button>
    </TooltipHint>
  );
}
function createPendingMessageId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  // 仅用于浏览器内的乐观消息占位；服务端消息仍使用数据库生成的 UUID。
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
function MessageBubble({
  message,
  onPreviewCitations,
  onEdit,
  highlightRevision,
}: {
  message: Message;
  highlightRevision?: number;
  onEdit?: (content: string) => Promise<void>;
  onPreviewCitations: (citations: CitationChunk[], documentId: string) => void;
}) {
  const { t } = useI18n();
  const isUser = message.role === "user";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current);
    };
  }, []);
  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(message.content);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = message.content;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    setCopied(true);
    if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = window.setTimeout(() => setCopied(false), 1500);
  }
  return (
    <div className={`group/message flex gap-3.5 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`flex size-8 shrink-0 items-center justify-center rounded-full ${
          isUser ? "bg-primary text-primary-foreground shadow-sm" : "bg-card text-primary shadow-sm"
        }`}
      >
        {isUser ? <UserIcon className="size-4" /> : <Bot className="size-4" />}
      </div>
      <div
        className={cn(
          "flex min-w-0 flex-col",
          editing ? "w-full max-w-xl" : "max-w-[85%] sm:max-w-[80%]",
          isUser ? "items-end" : "items-start",
        )}
      >
        <div
          className={cn(
            "min-w-0 scroll-my-8 rounded-2xl text-sm leading-6 shadow-sm transition-shadow duration-500 motion-reduce:transition-none",
            highlightRevision !== undefined && "ring-2 ring-primary/60 shadow-lg shadow-primary/10",
            editing
              ? "w-full border border-border bg-card p-4 text-foreground"
              : isUser
                ? "rounded-tr-md bg-primary px-4 py-3 text-primary-foreground"
                : "rounded-tl-md bg-card px-4 py-3 text-foreground",
          )}
        >
          {editing ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Pencil className="size-3.5" aria-hidden="true" />
                {t("编辑问题")}
              </div>
              <Textarea
                autoFocus
                onKeyDown={(event) => {
                  if (event.key === "Escape") setEditing(false);
                }}
                aria-label={t("编辑问题")}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                maxLength={20000}
                rows={3}
                className="min-h-28 resize-y"
              />
              <div className="flex flex-col gap-3 border-t border-border pt-3">
                <p className="text-xs leading-5 text-muted-foreground">
                  {t("保存后将替换原问题并重新生成回答。")}
                </p>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                    {t("取消")}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!draft.trim() || !onEdit || draft.trim() === message.content.trim()}
                    onClick={() => {
                      setEditing(false);
                      void onEdit?.(draft.trim());
                    }}
                  >
                    <Check data-icon="inline-start" />
                    {t("保存并重新生成")}
                  </Button>
                </div>
              </div>
            </div>
          ) : isUser ? (
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
          ) : message.content ? (
            <MessageMarkdown content={message.content} />
          ) : (
            <ThinkingIndicator />
          )}
          {message.citations && message.citations.length > 0 && (
            <CitationPreview citations={message.citations} onSelect={onPreviewCitations} />
          )}
        </div>
        {message.id !== "live" && !editing && (
          <div className="mt-1 flex items-center gap-1.5 opacity-100 transition-opacity duration-200 md:opacity-0 md:group-hover/message:opacity-100 md:group-focus-within/message:opacity-100">
            {message.createdAt && (
              <span className="tabular-nums text-xs text-muted-foreground">
                {formatMessageTime(message.createdAt)}
              </span>
            )}
            <TooltipHint content={copied ? t("已复制") : t("复制消息")}>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7 rounded-lg text-muted-foreground/60 hover:text-muted-foreground"
                onClick={() => void copyMessage()}
                aria-label={copied ? t("消息已复制") : t("复制消息")}
              >
                {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
              </Button>
            </TooltipHint>
            {isUser && onEdit && (
              <TooltipHint content={t("编辑问题")}>
                <Button
                  type="button"
                  className="size-7 rounded-lg text-muted-foreground/60 hover:text-muted-foreground"
                  variant="ghost"
                  size="icon"
                  aria-label={t("编辑问题")}
                  onClick={() => {
                    setDraft(message.content);
                    setEditing(true);
                  }}
                >
                  <Pencil />
                </Button>
              </TooltipHint>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
/** 消息气泡里的引用来源列表：点击后在右侧预览面板打开对应文档。 */
/** 回答生成前显示多行骨架占位，并尊重减弱动效偏好。 */
function ThinkingIndicator() {
  const { t } = useI18n();
  return (
    <div
      className="flex w-[min(24rem,55vw)] flex-col gap-3 py-2"
      role="status"
      aria-label={t("正在思考")}
    >
      <div aria-hidden="true" className="flex flex-col gap-3">
        <Skeleton className="h-3 w-4/5 motion-reduce:animate-none" />
        <Skeleton className="h-3 w-full motion-reduce:animate-none" />
        <Skeleton className="h-3 w-3/5 motion-reduce:animate-none" />
      </div>
    </div>
  );
}
function CitationPreview({
  citations,
  onSelect,
}: {
  citations: CitationChunk[];
  onSelect: (citations: CitationChunk[], documentId: string) => void;
}) {
  const { t } = useI18n();
  // 引用按钮按文档去重；完整 citations 交给预览面板，面板内可切换文档
  const documentButtons = useMemo(() => {
    const seen = new Map<string, string>();
    for (const citation of citations) {
      if (!seen.has(citation.documentId)) seen.set(citation.documentId, citation.filename);
    }
    return [...seen.entries()].map(([documentId, filename]) => ({ documentId, filename }));
  }, [citations]);
  return (
    <div className="mt-2 flex flex-col items-start gap-1 pt-2 text-xs opacity-80">
      <p className="font-medium">{t("引用来源：")}</p>
      {documentButtons.map(({ documentId, filename }) => (
        <button
          key={documentId}
          type="button"
          className="group/citation inline-flex max-w-full cursor-pointer items-center gap-1 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-primary/10 hover:text-primary focus-visible:bg-primary/10 focus-visible:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          onClick={() => onSelect(citations, documentId)}
          title={t("预览引用文档")}
        >
          <FileText className="size-3 shrink-0" />
          <span className="truncate">{filename}</span>
          <ArrowUpRight
            aria-hidden="true"
            className="size-3.5 shrink-0 opacity-0 transition-opacity group-hover/citation:opacity-100 group-focus-visible/citation:opacity-100 [@media(hover:none)]:opacity-100"
          />
        </button>
      ))}
    </div>
  );
}
/**
 * 聊天区与文档预览面板之间的拖拽手柄。
 * hover 显示拖拽光标与细线高亮；拖拽期间通过 html[data-panel-resizing]
 * 让侧栏右缘联动高亮、全局切换 col-resize 光标并禁止文本选中（见 globals.css）。
 */
function PanelResizeHandle({
  onResize,
  onResizeEnd,
}: {
  onResize: (clientX: number) => void;
  onResizeEnd: () => void;
}) {
  const { t } = useI18n();
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (!dragging) return;
    document.documentElement.setAttribute("data-panel-resizing", "true");
    return () => document.documentElement.removeAttribute("data-panel-resizing");
  }, [dragging]);
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={t("调整文档预览宽度")}
      className={cn(
        "group/handle relative hidden w-2 shrink-0 cursor-col-resize touch-none transition-colors md:block",
        "hover:bg-primary/10",
        dragging && "bg-primary/20",
      )}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragging(true);
      }}
      onPointerMove={(event) => {
        if (dragging) onResize(event.clientX);
      }}
      onPointerUp={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        setDragging(false);
        onResizeEnd();
      }}
      onPointerCancel={() => setDragging(false)}
    >
      <div
        className={cn(
          "absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition-colors group-hover/handle:bg-primary/50",
          dragging && "bg-primary/60",
        )}
      />
    </div>
  );
}
function ChatHistorySkeleton() {
  const { t } = useI18n();
  const rows = ["user-one", "assistant-one", "user-two", "assistant-two", "user-three"] as const;
  return (
    <div className="flex flex-col gap-7" aria-label={t("正在加载消息")} role="status">
      {rows.map((row, index) => {
        const isUser = index % 2 === 0;
        return (
          <div key={row} className={`flex gap-3.5 ${isUser ? "flex-row-reverse" : ""}`}>
            <Skeleton className="size-8 shrink-0 rounded-full" />
            <div
              className={`flex flex-col gap-2 rounded-2xl p-4 ${isUser ? "w-2/5 rounded-tr-md" : "w-3/5 rounded-tl-md bg-card"}`}
            >
              <Skeleton className="h-4 w-full" />
              {!isUser && <Skeleton className="h-4 w-3/5" />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Explicit sends must re-enable scrolling even after the user browsed older messages. */
function ScrollToSentMessage({
  messageId,
  align = "start",
  revision,
}: {
  revision?: number;
  messageId?: string;
  align?: "start" | "nearest";
}) {
  const { scrollToMessage } = useMessageScroller();
  const lastTarget = useRef<{ messageId: string; align: string } | null>(null);
  useEffect(() => {
    if (!messageId) return;
    if (
      revision === undefined &&
      lastTarget.current?.messageId === messageId &&
      lastTarget.current.align === align
    )
      return;
    lastTarget.current = { messageId, align };
    const frame = window.requestAnimationFrame(() => {
      scrollToMessage(messageId, {
        align,
        scrollMargin: 24,
        behavior: "instant",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messageId, align, revision, scrollToMessage]);
  return null;
}
