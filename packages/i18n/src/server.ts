import { cookies, headers } from "next/headers";
import { getRequestConfig, getTranslations, getLocale } from "next-intl/server";
import { resolveLocale, localeTags, type Locale } from "./config";
import { makeTranslator } from "./translate";
export default getRequestConfig(async () => {
  const store = await cookies();
  const locale = resolveLocale(
    store.get("kqa-locale")?.value,
    (await headers()).get("accept-language") ?? "",
  );
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
    timeZone: "Asia/Shanghai",
  };
});
export async function getI18n() {
  const translations = await getTranslations();
  return {
    t: makeTranslator((key) => translations.raw(key)),
    locale: localeTags[(await getLocale()) as Locale],
  };
}
