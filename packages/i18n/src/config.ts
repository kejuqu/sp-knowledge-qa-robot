export const locales = ["zh", "en", "ja"] as const;
export type Locale = (typeof locales)[number];
export const localeNames: Record<Locale, string> = { zh: "简体中文", en: "English", ja: "日本語" };
export const localeTags: Record<Locale, string> = { zh: "zh-CN", en: "en-US", ja: "ja-JP" };
export function isLocale(value: unknown): value is Locale {
  return locales.includes(value as Locale);
}
export function resolveLocale(cookie?: string, acceptLanguage = ""): Locale {
  if (isLocale(cookie)) return cookie;
  const preferences = acceptLanguage
    .split(",")
    .map((entry) => {
      const [tag, quality] = entry.trim().split(";q=");
      return { tag: tag.toLowerCase().split("-")[0], quality: quality ? Number(quality) : 1 };
    })
    .filter(({ quality }) => quality > 0)
    .sort((a, b) => b.quality - a.quality);
  return (preferences.find(({ tag }) => isLocale(tag))?.tag as Locale) ?? "zh";
}
