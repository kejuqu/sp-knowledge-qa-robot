"use client";
import { useTransition } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { setLocale } from "./actions";
import { locales, localeNames } from "./config";
export function LanguageSelect() {
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <select aria-label="Language / 语言 / 言語" value={locale} disabled={pending} className="max-w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground disabled:opacity-50" onChange={(event) => {
    const value = event.target.value;
    startTransition(async () => { await setLocale(value); router.refresh(); });
  }}>{locales.map((value) => <option key={value} value={value}>{localeNames[value]}</option>)}</select>;
}
