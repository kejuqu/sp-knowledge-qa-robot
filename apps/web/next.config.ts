import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@kqa/ui", "@kqa/i18n", "@kqa/db", "@kqa/auth"],
  allowedDevOrigins: ["app.lvh.me"],
};

export default createNextIntlPlugin("./src/i18n/request.ts")(nextConfig);
