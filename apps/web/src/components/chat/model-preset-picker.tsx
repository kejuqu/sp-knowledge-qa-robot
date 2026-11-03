"use client";
import { useI18n } from "@kqa/i18n";
import { useId } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
  InputGroupButton,
} from "@kqa/ui/components/input-group";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
} from "@kqa/ui/components/dropdown-menu";
import { ChevronDown, Check } from "lucide-react";
import { Field, FieldLabel, FieldDescription } from "@kqa/ui/components/field";
interface ModelPreset {
  id: string;
  model: string;
  baseUrl: string;
}
export function ModelPresetPicker({
  model,
  baseUrl,
  disabled,
  onSelect,
  kind = "llm",
  shared = false,
  onSharedChange,
  showSharingDescription = true,
}: {
  showSharingDescription?: boolean;
  kind?: "llm" | "embedding";
  model: string;
  baseUrl: string;
  disabled?: boolean;
  shared?: boolean;
  onSharedChange?: (shared: boolean) => void;
  onSelect: (preset: ModelPreset) => void;
}) {
  const { t } = useI18n();
  const id = useId();
  const label = kind === "embedding" ? "Embedding" : "LLM";
  const {
    data: presets = [],
    isError,
    isPending,
    refetch,
  } = useQuery<ModelPreset[]>({
    queryKey: ["model-presets", kind],
    queryFn: async () => {
      const response = await fetch(`/api/model-presets?kind=${kind}`);
      if (!response.ok) throw new Error(t("加载失败"));
      return response.json();
    },
    refetchOnMount: "always",
  });
  return (
    <div className="flex flex-col gap-4">
      <Field orientation="horizontal">
        <input
          id={`${id}-shared`}
          type="checkbox"
          role="switch"
          checked={shared}
          disabled={disabled}
          onChange={(event) => onSharedChange?.(event.target.checked)}
          className="relative h-5 w-9 shrink-0 cursor-pointer appearance-none rounded-full bg-input transition-colors before:absolute before:top-0.5 before:left-0.5 before:size-4 before:rounded-full before:bg-background before:shadow before:transition-transform checked:bg-primary checked:before:translate-x-4 focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
        />
        <div className="flex flex-col gap-1">
          <FieldLabel htmlFor={`${id}-shared`}>{t("通用模型")}</FieldLabel>
          {showSharingDescription && (
            <FieldDescription className="text-xs">
              {t(
                "开启通用模型并保存后，除 API Key 不共享外，其他租户也可以快速选择模型，自动填充 Base URL。",
              )}
            </FieldDescription>
          )}
        </div>
      </Field>
      <Field>
        <FieldLabel htmlFor={`${id}-model`}>
          {label} {t("模型名")}
        </FieldLabel>
        <InputGroup className="h-9">
          <InputGroupInput
            id={`${id}-model`}
            autoComplete="off"
            value={model}
            disabled={disabled}
            placeholder={t("选择已有模型或输入新模型名")}
            onChange={(event) => {
              onSelect({ id: "custom", model: event.target.value, baseUrl });
            }}
          />
          <InputGroupAddon align="inline-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <InputGroupButton
                  size="icon-xs"
                  disabled={disabled}
                  aria-label={t("选择{p0}模型", { p0: label })}
                >
                  <ChevronDown />
                </InputGroupButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="max-h-72 w-80 max-w-[calc(100vw-2rem)] overflow-y-auto"
              >
                <DropdownMenuGroup>
                  {isPending ? (
                    <DropdownMenuItem disabled>{t("正在加载模型…")}</DropdownMenuItem>
                  ) : isError ? (
                    <DropdownMenuItem onSelect={() => void refetch()}>
                      {t("加载失败，点击重试")}
                    </DropdownMenuItem>
                  ) : presets.length === 0 ? (
                    <DropdownMenuItem disabled>{t("暂无可选模型，请直接输入")}</DropdownMenuItem>
                  ) : (
                    presets.map((preset) => (
                      <DropdownMenuItem key={preset.id} onSelect={() => onSelect(preset)}>
                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                          <span className="break-all">{preset.model}</span>
                          <span className="break-all text-xs text-muted-foreground">
                            {preset.baseUrl}
                          </span>
                        </div>
                        {preset.model === model &&
                          preset.baseUrl === baseUrl.replace(/\/+$/, "") && (
                            <Check aria-hidden="true" />
                          )}
                      </DropdownMenuItem>
                    ))
                  )}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </InputGroupAddon>
        </InputGroup>
        <FieldDescription className="text-xs">{t("支持选择或直接输入模型 code")}</FieldDescription>
        {isError && (
          <p role="alert" className="text-xs text-destructive">
            {t("模型列表加载失败，仍可手动输入。")}
          </p>
        )}
      </Field>
    </div>
  );
}
