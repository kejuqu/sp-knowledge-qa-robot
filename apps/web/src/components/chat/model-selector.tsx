"use client";
import { useI18n } from "@kqa/i18n";
import { useState } from "react";
import { usePermission } from "@/components/tenant-role";
import { ModelSettingsDialog } from "./model-settings-dialog";
import { Button } from "@kqa/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@kqa/ui/components/dropdown-menu";
import { Bot, Check, ChevronDown, Settings2 } from "lucide-react";
export interface ChatModel {
  value: string;
  label: string;
}
interface ModelSelectorProps {
  models: ChatModel[];
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
}
/** The composer model picker follows the shadcn Model Selector dropdown pattern. */
export function ModelSelector({ models, value, onValueChange, disabled }: ModelSelectorProps) {
  const { t } = useI18n();
  const canManage = usePermission("settings.manage");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const selected = models.find((model) => model.value === value) ?? models[0];
  if (!selected) return null;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            className="h-8 rounded-lg px-2 text-muted-foreground hover:text-foreground"
            aria-label={t("选择问答模型")}
          >
            <Bot data-icon="inline-start" />
            <span className="max-w-40 truncate">{t(selected.label)}</span>
            <ChevronDown data-icon="inline-end" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="min-w-52"
          onCloseAutoFocus={(event) => {
            if (settingsOpen) event.preventDefault();
          }}
        >
          <DropdownMenuRadioGroup value={value} onValueChange={onValueChange}>
            <DropdownMenuGroup>
              <DropdownMenuLabel>{t("问答模型")}</DropdownMenuLabel>
              {models.map((model) => (
                <DropdownMenuRadioItem key={model.value} value={model.value}>
                  <Bot data-icon="inline-start" />
                  <span className="flex-1">{t(model.label)}</span>
                  {model.value === value && <Check aria-hidden="true" />}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuRadioGroup>
          {canManage && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem onSelect={() => setSettingsOpen(true)}>
                  <Settings2 />
                  {t("问答模型设置")}
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {settingsOpen && canManage && (
        <ModelSettingsDialog onClose={() => setSettingsOpen(false)} onSaved={onValueChange} />
      )}
    </>
  );
}
