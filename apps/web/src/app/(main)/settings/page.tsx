"use client";
import { useI18n } from "@kqa/i18n";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@kqa/ui/components/button";
import { Input } from "@kqa/ui/components/input";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@kqa/ui/components/field";
import { Skeleton } from "@kqa/ui/components/skeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardFooter,
  CardTitle,
} from "@kqa/ui/components/card";
import { ModelPresetPicker } from "@/components/chat/model-preset-picker";
import { usePermission } from "@/components/tenant-role";
import { Bot, Check, Layers2, Loader2, Save } from "lucide-react";
interface ModelSettings {
  llmBaseUrl: string;
  llmApiKey: string;
  llmModel: string;
  embeddingBaseUrl: string;
  embeddingApiKey: string;
  embeddingModel: string;
  llmShared: boolean;
  embeddingShared: boolean;
  role: "admin" | "member";
}
const FIELDS: Array<{
  key: Exclude<keyof ModelSettings, "llmShared" | "embeddingShared">;
  label: string;
  hint: string;
  secret?: boolean;
}> = [
  { key: "llmModel", label: "LLM 模型名", hint: "如 gpt-4o-mini / qwen3 / deepseek-chat" },
  {
    key: "llmBaseUrl",
    label: "LLM Base URL",
    hint: "OpenAI 兼容地址；本地 Ollama 填 http://host.docker.internal:11434/v1",
  },
  {
    key: "llmApiKey",
    label: "LLM API Key",
    hint: "直接传给 LangChain 初始化；本地模型可留空",
    secret: true,
  },
  {
    key: "embeddingModel",
    label: "Embedding 模型名",
    hint: "如 text-embedding-3-small / BAAI/bge-m3（SiliconFlow 模型需带厂商前缀）",
  },
  {
    key: "embeddingBaseUrl",
    label: "Embedding Base URL",
    hint: "OpenAI 兼容根路径即可（如 https://api.siliconflow.cn/v1），不要带 /embeddings 后缀",
  },
  { key: "embeddingApiKey", label: "Embedding API Key", hint: "", secret: true },
];
const MODEL_GROUPS = [
  {
    title: "问答模型",
    description: "用于对话生成与知识库问答",
    icon: Bot,
    anchor: "llm",
    fields: FIELDS.slice(0, 3),
  },
  {
    title: "文档向量化",
    description: "用于文档检索与语义匹配",
    icon: Layers2,
    anchor: "embedding",
    fields: FIELDS.slice(3),
  },
];
export default function SettingsPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const canManage = usePermission("settings.manage");
  const [form, setForm] = useState<ModelSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const { data } = useQuery<ModelSettings>({
    queryKey: ["settings"],
    enabled: canManage,
    queryFn: () => fetch("/api/settings").then((r) => r.json()),
  });
  useEffect(() => {
    if (data && !form) setForm(data);
  }, [data, form]);
  async function save() {
    if (!form || !canManage) return;
    setSaving(true);
    setSaved(false);
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json();
      alert(data.error ?? t("保存失败"));
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["model-presets"] });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }
  if (!canManage)
    return (
      <p className="p-6 text-muted-foreground">
        {t("你没有管理模型配置的权限，请联系团队管理员。")}
      </p>
    );
  if (!form) {
    return <SettingsSkeleton />;
  }
  return (
    <div className="p-6">
      <div className="mx-auto max-w-3xl">
        <h1 data-tour="model-settings" className="mb-1 text-xl font-semibold">
          {t("模型设置")}
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">
          {t(
            "任何 OpenAI 兼容协议的服务都能接入（OpenAI / DeepSeek / Ollama 本地模型 / 企业网关）",
          )}
        </p>
        <Card className="overflow-hidden border border-border/60">
          <CardHeader>
            <CardTitle className="text-base">{t("LangChain 模型配置")}</CardTitle>
            <CardDescription>{t("保存后立即对问答与文档向量化生效")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 xl:grid-cols-2">
            <p className="text-xs leading-relaxed text-muted-foreground xl:col-span-2">
              {t(
                "开启通用模型并保存后，除 API Key 不共享外，其他租户也可以快速选择模型，自动填充 Base URL。",
              )}
            </p>
            {MODEL_GROUPS.map((group) => (
              <FieldSet
                key={t(group.title)}
                id={group.anchor}
                className="min-w-0 scroll-mt-6 rounded-xl border border-border/60 bg-background/60 p-4"
              >
                <FieldLegend>
                  <span className="inline-flex items-center gap-2">
                    <group.icon aria-hidden className="size-4 text-primary" />
                    {t(group.title)}
                  </span>
                </FieldLegend>
                <p className="mb-2 text-xs text-muted-foreground">{t(group.description)}</p>
                <ModelPresetPicker
                  showSharingDescription={false}
                  shared={group.anchor === "llm" ? form.llmShared : form.embeddingShared}
                  onSharedChange={(shared) =>
                    setForm({
                      ...form,
                      [group.anchor === "llm" ? "llmShared" : "embeddingShared"]: shared,
                    })
                  }
                  kind={group.anchor === "llm" ? "llm" : "embedding"}
                  model={group.anchor === "llm" ? form.llmModel : form.embeddingModel}
                  baseUrl={group.anchor === "llm" ? form.llmBaseUrl : form.embeddingBaseUrl}
                  disabled={saving}
                  onSelect={(preset) =>
                    setForm(
                      group.anchor === "llm"
                        ? { ...form, llmModel: preset.model, llmBaseUrl: preset.baseUrl }
                        : {
                            ...form,
                            embeddingModel: preset.model,
                            embeddingBaseUrl: preset.baseUrl,
                          },
                    )
                  }
                />
                <FieldGroup className="gap-5">
                  {group.fields
                    .filter((f) => f.key !== "llmModel" && f.key !== "embeddingModel")
                    .map((f) => (
                      <Field key={f.key}>
                        <FieldLabel htmlFor={f.key}>{t(f.label)}</FieldLabel>
                        <Input
                          id={f.key}
                          aria-describedby={t(f.hint) ? `${f.key}-hint` : undefined}
                          type={f.secret ? "password" : "text"}
                          value={form[f.key]}
                          onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                        />
                        {t(f.hint) && (
                          <FieldDescription
                            id={`${f.key}-hint`}
                            className="break-words text-xs leading-relaxed"
                          >
                            {t(f.hint)}
                          </FieldDescription>
                        )}
                      </Field>
                    ))}
                </FieldGroup>
              </FieldSet>
            ))}
          </CardContent>
          <CardFooter className="flex-col items-stretch gap-3 border-t border-border/60 bg-muted/30 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p role="status" className="text-xs text-muted-foreground">
              {saved ? t("配置已保存，现已生效") : t("保存后应用于当前团队")}
            </p>
            <Button
              onClick={save}
              disabled={saving || !canManage}
              size="lg"
              className="w-full sm:w-auto"
            >
              {saving ? (
                <Loader2 data-icon="inline-start" className="animate-spin" />
              ) : saved ? (
                <Check data-icon="inline-start" />
              ) : (
                <Save data-icon="inline-start" />
              )}
              {saving ? t("保存中…") : saved ? t("已保存") : t("保存配置")}
            </Button>
            {!canManage && (
              <p className="text-center text-xs text-muted-foreground">
                {t("模型配置是租户级资产，需要模型设置权限才可修改")}
              </p>
            )}
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
function SettingsSkeleton() {
  const { t } = useI18n();
  return (
    <div className="p-6" aria-label={t("正在加载模型设置")} role="status">
      <div className="mx-auto max-w-3xl" aria-hidden="true">
        <div className="mb-6 flex flex-col gap-1">
          <Skeleton className="h-7 w-20" />
          <Skeleton className="h-5 w-4/5" />
        </div>
        <Card className="overflow-hidden border border-border/60">
          <CardHeader>
            <CardTitle>
              <Skeleton className="h-4 w-36" />
            </CardTitle>
            <CardDescription>
              <Skeleton className="h-5 w-60 max-w-full" />
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 xl:grid-cols-2">
            <Skeleton className="h-4 w-full xl:col-span-2" />
            {MODEL_GROUPS.map((group) => (
              <FieldSet
                key={group.anchor}
                className="min-w-0 rounded-xl border border-border/60 bg-background/60 p-4"
              >
                <FieldLegend>
                  <Skeleton className="h-5 w-24" />
                </FieldLegend>
                <div className="mb-2">
                  <Skeleton className="h-4 w-44 max-w-full" />
                </div>
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-5 w-28" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-9 w-full" />
                  <Skeleton className="h-4 w-full" />
                </div>
                <FieldGroup className="gap-5">
                  {group.fields
                    .filter((field) => field.key !== "llmModel" && field.key !== "embeddingModel")
                    .map((field) => (
                      <Field key={field.key}>
                        <Skeleton className="h-3.5 w-32" />
                        <Skeleton className="h-9 w-full" />
                        {t(field.hint) && (
                          <div className="flex flex-col gap-1.5 py-0.5">
                            <Skeleton className="h-3 w-full" />
                            {t(field.hint).length > 50 && <Skeleton className="h-3 w-4/5" />}
                          </div>
                        )}
                      </Field>
                    ))}
                </FieldGroup>
              </FieldSet>
            ))}
          </CardContent>
          <CardFooter className="flex-col items-stretch gap-3 border-t border-border/60 bg-muted/30 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-10 w-full sm:w-36" />
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
