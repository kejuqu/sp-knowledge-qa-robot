"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { create } from "zustand";
import { usePathname, useRouter } from "next/navigation";
import { Compass, ArrowRight, X } from "lucide-react";
import { useI18n } from "@kqa/i18n";
import { Button } from "@kqa/ui/components/button";
import { TooltipHint } from "@kqa/ui/components/tooltip";
import { useSidebar } from "@kqa/ui/components/sidebar";
import { usePermission } from "@/components/tenant-role";
import { useChatStore } from "@/stores/chat-store";

const useGuideStore = create<{
  open: boolean;
  width: number;
  tourStep: number | null;
  setTourStep: (step: number | null) => void;
  setOpen: (open: boolean) => void;
  setWidth: (width: number) => void;
}>((set) => ({
  open: false,
  width: 420,
  tourStep: null,
  setTourStep: (tourStep) => set({ tourStep }),
  setOpen: (open) => set({ open }),
  setWidth: (width) => set({ width: Math.min(720, Math.max(320, width)) }),
}));

export function ProductGuide() {
  const { t } = useI18n();
  const { collapsed, isMobile, setMobileOpen, setCollapsed } = useSidebar();
  const { open, setOpen, setTourStep } = useGuideStore();
  const claimRequest = useRef<Promise<boolean> | null>(null);
  useEffect(() => {
    let active = true;
    // Preview mode bypasses the account's one-time registration marker.
    claimRequest.current ??=
      new URLSearchParams(window.location.search).get("tour") === "1"
        ? Promise.resolve(true)
        : fetch("/api/onboarding/tour", { method: "POST" })
            .then(async (response) => response.ok && (await response.json()).showTour === true)
            .catch(() => false);
    void claimRequest.current.then((showTour) => {
      if (!active || !showTour) return;
      setOpen(true);
      setTourStep(0);
      setCollapsed(false);
      setMobileOpen(false);
    });
    return () => {
      active = false;
    };
  }, [setOpen, setTourStep, setCollapsed, setMobileOpen]);
  return (
    <TooltipHint content={t("使用指南")} side="right" hidden={!collapsed}>
      <Button
        variant="ghost"
        size={collapsed ? "icon" : "default"}
        className={collapsed ? "self-center" : "w-full justify-start"}
        aria-label={t("使用指南")}
        aria-expanded={open}
        aria-controls="product-guide"
        onClick={() => {
          setOpen(true);
          setCollapsed(false);
          if (isMobile) setMobileOpen(false);
        }}
      >
        <Compass data-icon="inline-start" />
        {!collapsed && t("使用指南")}
      </Button>
    </TooltipHint>
  );
}

export function ProductGuidePanel() {
  const { t } = useI18n();
  const router = useRouter();
  const { isMobile, setMobileOpen } = useSidebar();
  const canManageSettings = usePermission("settings.manage");
  const streaming = useChatStore((state) => state.streaming);
  const { open, width, setOpen, setWidth, setTourStep } = useGuideStore();
  const steps = [
    {
      title: "设置自己的模型",
      description: "在“模型设置”中配置问答模型，保存后即可使用。",
      action: "模型设置",
      href: "/settings",
      disabled: !canManageSettings,
    },
    {
      title: "上传文档",
      description: "上传文档后等待解析完成，文档显示“就绪”状态后即可用于问答。",
      action: "前往知识库",
      href: "/documents",
      disabled: false,
    },
    {
      title: "新建问答，召回知识",
      description: "新建问答，选择已就绪的知识库并输入问题，开始知识召回。",
      action: "新建问答",
      href: "/chat",
      disabled: streaming,
    },
  ];

  function navigate(href: string) {
    if (href === "/chat") {
      if (useChatStore.getState().streaming) return;
      useChatStore.getState().setActiveConversation(null);
    }
    if (isMobile) setMobileOpen(false);
    router.push(href);
  }

  if (!open) return null;

  return (
    <>
      <ProductTour />
      <aside
        id="product-guide"
        aria-labelledby="product-guide-title"
        style={{
          width: isMobile ? "min(420px, 85vw)" : `min(${width}px, 50vw)`,
        }}
        className="relative flex h-dvh shrink-0 flex-col border-l bg-background"
      >
        <div
          role="separator"
          aria-label={t("调整指南宽度")}
          aria-orientation="vertical"
          aria-valuemin={320}
          aria-valuemax={720}
          aria-valuenow={width}
          tabIndex={0}
          className="absolute inset-y-0 -left-1 w-2 touch-none cursor-col-resize hover:bg-primary/20 focus-visible:bg-primary/20 focus-visible:outline-none"
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
              event.preventDefault();
              setWidth(width + (event.key === "ArrowLeft" ? 24 : -24));
            }
          }}
          onPointerDown={(event) => {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              setWidth(window.innerWidth - event.clientX);
            }
          }}
          onPointerUp={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              event.currentTarget.releasePointerCapture(event.pointerId);
          }}
        />
        <header className="flex items-start gap-3 border-b p-5">
          <div className="flex flex-1 flex-col gap-2">
            <h2 id="product-guide-title" className="text-lg font-semibold">
              {t("使用指南")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t("跟随以下三步，开始使用知识问答助手。")}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("关闭使用指南")}
            onClick={() => {
              setOpen(false);
              setTourStep(null);
            }}
          >
            <X />
          </Button>
        </header>
        <ol className="flex min-h-0 flex-col gap-6 overflow-y-auto p-5">
          {steps.map((step, index) => (
            <li key={step.href} className="flex gap-3">
              <span
                aria-hidden="true"
                className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium"
              >
                {index + 1}
              </span>
              <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
                <div className="flex w-full flex-wrap items-center justify-between gap-2">
                  <h3 className="font-medium">{t(step.title)}</h3>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={step.disabled}
                    onClick={() => navigate(step.href)}
                  >
                    {t(step.action)}
                    <ArrowRight data-icon="inline-end" />
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">{t(step.description)}</p>
                {step.href === "/settings" && !canManageSettings && (
                  <p className="text-sm text-muted-foreground">{t("请联系管理员配置模型。")}</p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </aside>
    </>
  );
}

const tourSteps = [
  {
    href: "/settings",
    target: "model-settings",
    title: "设置自己的模型",
    description: "在“模型设置”中配置问答模型，保存后即可使用。",
  },
  {
    href: "/documents",
    target: "upload-documents",
    title: "上传知识库",
    description: "上传文档后等待解析完成，文档显示“就绪”状态后即可用于问答。",
  },
  {
    href: "/chat",
    target: "new-chat",
    title: "新建问答，召回知识",
    description: "新建问答，选择已就绪的知识库并输入问题，开始知识召回。",
  },
];

function ProductTour() {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const canManageSettings = usePermission("settings.manage");
  const { tourStep, setTourStep } = useGuideStore();
  const [position, setPosition] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const step = tourStep === null ? null : tourSteps[tourStep];

  useEffect(() => {
    if (!step) return;
    if (step.href === "/settings" && !canManageSettings) return;
    const preview = new URLSearchParams(window.location.search).get("tour") === "1";
    router.push(preview ? `${step.href}?tour=1` : step.href);
  }, [step, router, canManageSettings]);

  useEffect(() => {
    if (!step) return;
    let target: HTMLElement | null = null;
    let oldOutline = "";
    let oldOffset = "";
    function releaseTarget() {
      if (target) {
        target.style.outline = oldOutline;
        target.style.outlineOffset = oldOffset;
      }
    }
    function update() {
      const next = document.querySelector<HTMLElement>(`[data-tour="${step!.target}"]`);
      if (next !== target) {
        releaseTarget();
        target = next;
        if (target) {
          oldOutline = target.style.outline;
          oldOffset = target.style.outlineOffset;
          target.style.outline = "3px solid var(--primary)";
          target.style.outlineOffset = "4px";
          target.scrollIntoView({ block: "nearest", behavior: "instant" });
        }
      }
      const width = Math.min(360, window.innerWidth - 32);
      const rect = target?.getBoundingClientRect();
      const height = card.current?.offsetHeight ?? 240;
      const left = rect
        ? Math.min(window.innerWidth - width - 16, Math.max(16, rect.left))
        : Math.max(16, (window.innerWidth - width) / 2);
      const top = rect
        ? rect.bottom + height + 24 < window.innerHeight
          ? rect.bottom + 12
          : Math.max(16, rect.top - height - 12)
        : Math.max(16, (window.innerHeight - height) / 2);
      setPosition((previous) =>
        previous?.top === top && previous.left === left && previous.width === width
          ? previous
          : { top, left, width },
      );
    }
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.getElementById("main-content") ?? document.body, {
      childList: true,
      subtree: true,
    });
    const resizeObserver = new ResizeObserver(update);
    if (card.current) resizeObserver.observe(card.current);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setTourStep(null);
    }
    window.addEventListener("keydown", onKey);
    return () => {
      releaseTarget();
      observer.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [step, pathname, setTourStep]);

  if (!step || tourStep === null || !position) return null;
  return createPortal(
    <section
      ref={card}
      role="region"
      aria-label={t("漫游引导")}
      aria-live="polite"
      data-product-tour
      style={{
        ...position,
        backgroundColor: "var(--tour-background)",
        color: "var(--tour-foreground)",
      }}
      className="fixed z-50 flex max-h-[calc(100dvh-2rem)] flex-col gap-4 overflow-y-auto rounded-xl border p-5 shadow-xl"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm">
          {tourStep + 1} / {tourSteps.length}
        </span>
        <Button
          variant="secondary"
          size="icon"
          aria-label={t("关闭漫游引导")}
          onClick={() => setTourStep(null)}
        >
          <X />
        </Button>
      </div>
      <h2 className="font-semibold">{t(step.title)}</h2>
      <p className="text-sm">
        {step.href === "/settings" && !canManageSettings
          ? t("请联系管理员配置模型。")
          : t(step.description)}
      </p>
      <div className="flex justify-end gap-2">
        {tourStep > 0 && (
          <Button variant="secondary" size="sm" onClick={() => setTourStep(tourStep - 1)}>
            {t("上一步")}
          </Button>
        )}
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setTourStep(tourStep === tourSteps.length - 1 ? null : tourStep + 1)}
        >
          {t(tourStep === tourSteps.length - 1 ? "完成引导" : "下一步")}
        </Button>
      </div>
    </section>,
    document.body,
  );
}
