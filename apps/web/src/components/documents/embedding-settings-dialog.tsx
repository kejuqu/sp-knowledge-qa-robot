"use client";
import { useI18n } from "@kqa/i18n";
import { ModelPresetPicker } from "@/components/chat/model-preset-picker";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@kqa/ui/components/button";
import { Input } from "@kqa/ui/components/input";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@kqa/ui/components/field";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, } from "@kqa/ui/components/dialog";
import { Check, Layers2, Loader2, Save } from "lucide-react";
interface SettingsResponse {
    embeddingShared: boolean;
    embeddingBaseUrl: string;
    embeddingApiKey: string;
    embeddingModel: string;
}
type EmbeddingForm = Pick<SettingsResponse, "embeddingShared" | "embeddingBaseUrl" | "embeddingApiKey" | "embeddingModel">;
const FIELDS: Array<{
    key: Exclude<keyof EmbeddingForm, "embeddingShared">;
    label: string;
    hint: string;
    secret?: boolean;
}> = [
    { key: "embeddingModel", label: "Embedding 模型名", hint: "如 text-embedding-3-small / BAAI/bge-m3（SiliconFlow 模型需带厂商前缀）" },
    { key: "embeddingBaseUrl", label: "Embedding Base URL", hint: "OpenAI 兼容根路径即可（如 https://api.siliconflow.cn/v1），不要带 /embeddings 后缀" },
    { key: "embeddingApiKey", label: "Embedding API Key", hint: "已保存的 Key 会脱敏显示，保持原样即不修改", secret: true },
];
/** 知识库页顶部的 Embedding 配置入口：页内弹窗编辑，仅 settings.manage 权限可见（由调用方控制）。 */
export function EmbeddingSettingsDialog() {
    const { t } = useI18n();
    const queryClient = useQueryClient();
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState<EmbeddingForm | null>(null);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { data } = useQuery<SettingsResponse>({
        queryKey: ["settings"],
        enabled: open,
        queryFn: () => fetch("/api/settings").then((r) => r.json()),
    });
    useEffect(() => {
        if (!open) {
            // 关闭时重置，下次打开重新拉取最新配置
            setForm(null);
            setError(null);
            setSaved(false);
            return;
        }
        if (open && data && !form) {
            setForm({
                embeddingShared: data.embeddingShared ?? false,
                embeddingBaseUrl: data.embeddingBaseUrl ?? "",
                embeddingApiKey: data.embeddingApiKey ?? "",
                embeddingModel: data.embeddingModel ?? "",
            });
        }
    }, [open, data, form]);
    async function save() {
        if (!form)
            return;
        setSaving(true);
        setError(null);
        try {
            const res = await fetch("/api/settings", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(form),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => null);
                setError(body?.error ?? t("保存失败，请重试"));
                return;
            }
            await queryClient.invalidateQueries({ queryKey: ["model-presets"] });
            setSaved(true);
            setTimeout(() => setOpen(false), 800);
        }
        finally {
            setSaving(false);
        }
    }
    return (<Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full shrink-0 sm:w-auto">
          <Layers2 />{t("Embedding 设置")}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("文档向量化设置")}</DialogTitle>
          <DialogDescription>{t("配置 Embedding 服务，保存后对重新解析的文档生效；问答模型请在模型设置页统一管理。")}</DialogDescription>
        </DialogHeader>

        {error && (<p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {t(error)}
          </p>)}

        {form ? (<FieldGroup className="gap-4">
            <ModelPresetPicker shared={form.embeddingShared} onSharedChange={(embeddingShared) => setForm({ ...form, embeddingShared })} kind="embedding" model={form.embeddingModel} baseUrl={form.embeddingBaseUrl} disabled={saving} onSelect={(preset) => setForm({ ...form, embeddingModel: preset.model, embeddingBaseUrl: preset.baseUrl })}/>
            {FIELDS.filter((f) => f.key !== "embeddingModel").map((f) => (<Field key={f.key}>
                <FieldLabel htmlFor={`embed-${f.key}`}>{t(f.label)}</FieldLabel>
                <Input id={`embed-${f.key}`} aria-describedby={`embed-${f.key}-hint`} type={f.secret ? "password" : "text"} autoComplete="off" value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}/>
                {t(f.hint) && (<FieldDescription id={`embed-${f.key}-hint`} className="break-words text-xs leading-relaxed">
                    {t(f.hint)}
                  </FieldDescription>)}
              </Field>))}
          </FieldGroup>) : (<p className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground" role="status">
            <Loader2 className="animate-spin"/>{t("正在加载当前配置…")}</p>)}

        <p className="text-xs leading-relaxed text-muted-foreground">{t("切换 Embedding 服务商或模型后，建议对已有文档执行「重新解析」，否则问答检索仍会命中旧向量。")}</p>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={saving}>{t("取消")}</Button>
          </DialogClose>
          <Button onClick={save} disabled={saving || !form}>
            {saving ? <Loader2 data-icon="inline-start" className="animate-spin"/> : saved ? <Check data-icon="inline-start"/> : <Save data-icon="inline-start"/>}
            {saving ? t("保存中…") : saved ? t("已保存") : t("保存配置")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>);
}
