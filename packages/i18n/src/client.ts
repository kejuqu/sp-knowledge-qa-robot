"use client";
import { useLocale, useTranslations } from "next-intl";
import { makeTranslator } from "./translate";
import { localeTags, type Locale } from "./config";
export function useI18n() {
  const translations = useTranslations();
  const locale = useLocale() as Locale;
  return { t: makeTranslator((key) => translations.raw(key)), locale: localeTags[locale] };
}
