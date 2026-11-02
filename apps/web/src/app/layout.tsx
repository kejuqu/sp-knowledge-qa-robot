import { UIStringsProvider } from "@kqa/ui/components/ui-strings";
import { NextIntlClientProvider } from "next-intl";
import { getI18n } from "@kqa/i18n/server";
import type { Metadata } from "next";
import "@kqa/ui/globals.css";
import "@kqa/i18n/styles.css";
import Script from "next/script";
import { THEME_SCRIPT } from "@kqa/ui/components/theme-script";
import { Providers } from "./providers";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("企业知识问答助手"), description: t("基于企业知识库的 RAG 问答") };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { t, locale } = await getI18n();
  const labels = { close: t("关闭"), resizeSidebar: t("调整侧栏宽度"), expandSidebar: t("展开侧栏"), collapseSidebar: t("收起侧栏"), openNavigation: t("打开导航"), closeNavigation: t("关闭导航"), closeOverlay: t("关闭导航遮罩") };
  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <Script id="kqa-theme" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-screen antialiased">
        <NextIntlClientProvider><UIStringsProvider labels={labels}><Providers>{children}</Providers></UIStringsProvider></NextIntlClientProvider>
      </body>
    </html>
  );
}
