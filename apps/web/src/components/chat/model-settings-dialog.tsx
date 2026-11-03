"use client";
import { useI18n } from "@kqa/i18n";
import { ModelPresetPicker } from "./model-preset-picker";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@kqa/ui/components/button";
import { Input } from "@kqa/ui/components/input";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@kqa/ui/components/field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@kqa/ui/components/dialog";
import { Loader2, Save } from "lucide-react";
interface ModelForm {
  llmShared: boolean;
  llmBaseUrl: string;
  llmApiKey: string;
  llmModel: string;
}
const FIELDS: Array<{
  key: Exclude<keyof ModelForm, "llmShared">;
  label: string;
  hint: string;
  placeholder: string;
}> = [
  {
    key: "llmModel",
    label: "LLM 模型名",
    hint: "填写服务提供的模型名称，如 deepseek-chat / qwen3 / gpt-4o-mini",
    placeholder: "deepseek-chat",
  },
  {
    key: "llmBaseUrl",
    label: "LLM Base URL",
    hint: "OpenAI 兼容服务地址；本地 Ollama 如 http://localhost:11434/v1",
    placeholder: "https://api.openai.com/v1",
  },
  {
    key: "llmApiKey",
    label: "LLM API Key",
    hint: "已保存的 Key 脱敏显示，保持原样即不修改；本地模型可留空",
    placeholder: "输入 API Key",
  },
];
export function ModelSettingsDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (model: string) => void;
}) {
  const { t } = useI18n();
  const [saving, setSaving] = useState(false);
  const { data, isFetching, error, refetch } = useQuery<ModelForm>({
    queryKey: ["settings", "llm-dialog"],
    gcTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/settings", { signal });
      if (!response.ok) throw new Error(t("无法加载模型配置，请检查权限或重试"));
      return response.json();
    },
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
        showCloseButton={!saving}
      >
        <DialogHeader>
          <DialogTitle>{t("问答模型设置")}</DialogTitle>
          <DialogDescription>
            {t("用于对话生成与知识库问答，保存后对当前团队的后续问答生效。")}
          </DialogDescription>
        </DialogHeader>
        {isFetching && !data ? (
          <p
            role="status"
            className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"
          >
            <Loader2 className="size-4 animate-spin" />
            {t("正在加载当前配置…")}
          </p>
        ) : error ? (
          <div className="flex flex-col gap-3">
            <p role="alert" className="text-sm text-destructive">
              {error.message}
            </p>
            <Button variant="outline" onClick={() => void refetch()}>
              {t("重新加载")}
            </Button>
          </div>
        ) : data ? (
          <ModelSettingsForm
            initial={data}
            saving={saving}
            setSaving={setSaving}
            onClose={onClose}
            onSaved={onSaved}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
function ModelSettingsForm({
  initial,
  saving,
  setSaving,
  onClose,
  onSaved,
}: {
  initial: ModelForm;
  saving: boolean;
  setSaving: (saving: boolean) => void;
  onClose: () => void;
  onSaved: (model: string) => void;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState<ModelForm>(() => ({
    llmShared: initial.llmShared ?? false,
    llmBaseUrl: initial.llmBaseUrl,
    llmApiKey: initial.llmApiKey,
    llmModel: initial.llmModel,
  }));
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const values = { ...form, llmBaseUrl: form.llmBaseUrl.trim(), llmModel: form.llmModel.trim() };
    setError(null);
    try {
      const url = new URL(values.llmBaseUrl);
      if (!["http:", "https:"].includes(url.protocol) || !values.llmModel) throw new Error();
    } catch {
      setError(t("请填写有效的 HTTP / HTTPS Base URL 和模型名称"));
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? t("保存失败，请重试"));
      }
      // 两个入口共享后端配置，同时刷新设置页和聊天栏的显示。
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["settings"] }),
        queryClient.invalidateQueries({ queryKey: ["model-presets"] }),
        queryClient.invalidateQueries({ queryKey: ["chat-model"] }),
      ]);
      onSaved(values.llmModel);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("保存失败，请检查网络后重试"));
    } finally {
      setSaving(false);
    }
  }
  return (
    <form onSubmit={save} className="flex flex-col gap-5">
      <ModelPresetPicker
        shared={form.llmShared}
        onSharedChange={(llmShared) => setForm({ ...form, llmShared })}
        model={form.llmModel}
        baseUrl={form.llmBaseUrl}
        disabled={saving}
        onSelect={(preset) =>
          setForm({ ...form, llmModel: preset.model, llmBaseUrl: preset.baseUrl })
        }
      />
      <FieldGroup className="gap-4">
        {FIELDS.filter((field) => field.key !== "llmModel").map((field) => (
          <Field key={field.key}>
            <FieldLabel htmlFor={`chat-${field.key}`}>{t(field.label)}</FieldLabel>
            <Input
              id={`chat-${field.key}`}
              aria-describedby={`chat-${field.key}-hint`}
              type={field.key === "llmApiKey" ? "password" : "text"}
              required={field.key !== "llmApiKey"}
              autoComplete="off"
              spellCheck={false}
              disabled={saving}
              placeholder={field.placeholder}
              value={form[field.key]}
              onChange={(event) => setForm({ ...form, [field.key]: event.target.value })}
            />
            <FieldDescription id={`chat-${field.key}-hint`}>{t(field.hint)}</FieldDescription>
          </Field>
        ))}
      </FieldGroup>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {t(error)}
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
          {t("取消")}
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? (
            <Loader2 data-icon="inline-start" className="animate-spin" />
          ) : (
            <Save data-icon="inline-start" />
          )}
          {saving ? t("保存中…") : t("保存配置")}
        </Button>
      </DialogFooter>
    </form>
  );
}
