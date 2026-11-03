import { LanguageSelect } from "@kqa/i18n/language-select";
import { UIStringsProvider } from "@kqa/ui/components/ui-strings";
import { NextIntlClientProvider } from "next-intl";
import { getI18n } from "@kqa/i18n/server";
import type { Metadata } from "next";
import "@kqa/ui/globals.css";
import "@kqa/i18n/styles.css";
import Script from "next/script";
import { THEME_SCRIPT } from "@kqa/ui/components/theme-script";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("登录 - 企业知识问答助手"), description: t("统一认证中心") };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { t, locale } = await getI18n();
  const labels = {
    close: t("关闭"),
    resizeSidebar: t("调整侧栏宽度"),
    expandSidebar: t("展开侧栏"),
    collapseSidebar: t("收起侧栏"),
    openNavigation: t("打开导航"),
    closeNavigation: t("关闭导航"),
    closeOverlay: t("关闭导航遮罩"),
  };
  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <Script
          id="kqa-theme"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }}
        />
      </head>
      <body className="min-h-screen antialiased">
        <NextIntlClientProvider>
          <UIStringsProvider labels={labels}>
            <div className="absolute right-4 top-4 z-10">
              <LanguageSelect />
            </div>
            {children}
          </UIStringsProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
