"use client";
import { useI18n } from "@kqa/i18n";
import { Avatar, AvatarFallback, AvatarImage } from "@kqa/ui/components/avatar";
export function UserAvatar({ name, src, className }: {
    name: string;
    src?: string | null;
    className?: string;
}) {
    const { t } = useI18n();
    const initial = Array.from(name.trim())[0]?.toLocaleUpperCase() || "U";
    return <Avatar className={className}>
    <AvatarImage src={src ?? undefined} alt={t("{p0}的头像", { p0: name })} className="object-cover"/>
    <AvatarFallback>{initial}</AvatarFallback>
  </Avatar>;
}
