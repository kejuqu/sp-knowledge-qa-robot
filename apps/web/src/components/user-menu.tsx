"use client";
import { useI18n } from "@kqa/i18n";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { setLocale } from "@kqa/i18n/actions";
import { locales, localeNames, isLocale } from "@kqa/i18n/config";
import { useState, useTransition } from "react";
import { Button } from "@kqa/ui/components/button";
import { TooltipHint } from "@kqa/ui/components/tooltip";
import { useSidebar } from "@kqa/ui/components/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@kqa/ui/components/dropdown-menu";
import { UserRoundPen, LogOut, Palette, Languages, Check } from "lucide-react";
import { useTenantRole } from "./tenant-role";
import { ThemeOptions } from "./theme-toggle";
import { UserAvatar } from "./user-avatar";
import { AvatarSettings } from "./avatar-settings";
import { useProfile } from "./use-profile";
interface UserMenuProps {
  name: string;
  email: string;
  signOutUrl: string;
  avatarUrl: string | null;
}
export function UserMenu({ name, email, signOutUrl, avatarUrl }: UserMenuProps) {
  const { t } = useI18n();
  const { collapsed } = useSidebar();
  const role = useTenantRole();
  const [avatarOpen, setAvatarOpen] = useState(false);
  const { data: profile } = useProfile({ name, email, avatarUrl });
  return (
    <>
      <DropdownMenu>
        <TooltipHint content={t("用户菜单")} side="right" hidden={!collapsed}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className={`h-auto w-full rounded-xl px-2.5 py-2 text-left hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ${collapsed ? "justify-center px-0" : "justify-start"}`}
              aria-label={t("打开用户菜单")}
            >
              <UserAvatar name={profile.name} src={profile.avatarUrl} />
              {!collapsed && (
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                    <span className="min-w-0 truncate">{name}</span>
                    <span className="shrink-0 whitespace-nowrap rounded-md bg-sidebar-accent px-1.5 py-0.5 text-[10px] text-sidebar-foreground/60">
                      {role === "admin" ? t("管理员") : t("员工")}
                    </span>
                  </span>
                  <span className="block truncate text-xs font-normal text-sidebar-foreground/60">
                    {email}
                  </span>
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
        </TooltipHint>
        <DropdownMenuContent
          side="top"
          align="start"
          sideOffset={8}
          collisionPadding={12}
          onCloseAutoFocus={(event) => {
            if (avatarOpen) event.preventDefault();
          }}
          className="w-72 max-w-[calc(100vw-1.5rem)] max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto rounded-2xl border-0 p-2 shadow-lg"
        >
          <DropdownMenuGroup>
            <DropdownMenuItem
              className="rounded-lg px-3 py-2.5"
              onSelect={() => setAvatarOpen(true)}
            >
              <UserRoundPen />
              {t("设置头像")}
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="rounded-lg px-3 py-2.5">
                <Languages />
                {t("语言")}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent sideOffset={8} className="w-48 rounded-2xl p-2">
                <LanguageOptions />
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuGroup>

          <DropdownMenuGroup className="md:hidden">
            <DropdownMenuLabel className="flex items-center gap-2 px-2 pb-2">
              <Palette className="size-4" />
              {t("主题")}
            </DropdownMenuLabel>
            <ThemeOptions compact />
          </DropdownMenuGroup>
          <DropdownMenuGroup className="hidden md:block">
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="rounded-lg px-3 py-2.5">
                <Palette />
                {t("主题")}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent sideOffset={8} className="w-48 rounded-2xl p-2">
                <DropdownMenuGroup>
                  <ThemeOptions />
                </DropdownMenuGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <form action={signOutUrl} method="post">
              <DropdownMenuItem
                asChild
                className="min-h-11 rounded-lg px-3 text-destructive focus:bg-destructive focus:text-white"
                onSelect={(e) => {
                  // Radix 会在 click 里同步关闭菜单并卸载表单，导致浏览器来不及执行 submit 的默认行为。
                  // 阻止默认关闭后手动提交表单。
                  e.preventDefault();
                  (e.currentTarget as HTMLElement).closest("form")?.requestSubmit();
                }}
              >
                <button type="submit" className="w-full">
                  <LogOut data-icon="inline-start" />
                  {t("退出登录")}
                </button>
              </DropdownMenuItem>
            </form>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <AvatarSettings open={avatarOpen} onOpenChange={setAvatarOpen} profile={profile} />
    </>
  );
}

function LanguageOptions() {
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <DropdownMenuRadioGroup
      value={locale}
      onValueChange={(value) => {
        if (!isLocale(value) || value === locale || pending) return;
        startTransition(async () => {
          await setLocale(value);
          router.refresh();
        });
      }}
    >
      {locales.map((value) => (
        <DropdownMenuRadioItem
          key={value}
          value={value}
          disabled={pending}
          className="rounded-lg px-3 py-2.5"
        >
          <span className="flex-1">{localeNames[value]}</span>
          <Check className={locale === value ? undefined : "invisible"} aria-hidden="true" />
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  );
}
