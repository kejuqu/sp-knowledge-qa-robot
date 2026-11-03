"use server";
import { cookies, headers } from "next/headers";
import { isLocale } from "./config";
export async function setLocale(locale: string) {
  if (!isLocale(locale)) throw new Error("Unsupported locale");
  const host = (await headers()).get("host")?.split(":")[0] ?? "";
  const domain = process.env.COOKIE_DOMAIN?.replace(/^\./, "");
  const shareCookie = domain && (host === domain || host.endsWith(`.${domain}`));
  (await cookies()).set("kqa-locale", locale, {
    path: "/",
    maxAge: 31536000,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    ...(shareCookie ? { domain: process.env.COOKIE_DOMAIN } : {}),
  });
}
