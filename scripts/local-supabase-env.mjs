import { execFileSync } from "node:child_process";
import { readFile, writeFile, copyFile, chmod } from "node:fs/promises";
const raw = execFileSync("supabase", ["status", "--output", "json"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});
const status = JSON.parse(raw);
// CLI 2.109 may omit API_URL while still reporting the gateway's S3 endpoint.
const storageUrl = status.STORAGE_S3_URL ?? status.storage_s3_url;
const url =
  status.API_URL ||
  status.api_url ||
  (storageUrl ? new URL("/", storageUrl).href.replace(/\/$/, "") : undefined);
const publicKey = status.PUBLISHABLE_KEY ?? status.ANON_KEY ?? status.anon_key;
const secretKey =
  status.SECRET_KEY ?? status.SERVICE_ROLE_KEY ?? status.service_role_key;
const dbUrl = status.DB_URL ?? status.db_url;
const missing = Object.entries({
  API_URL: url,
  PUBLISHABLE_KEY: publicKey,
  SECRET_KEY: secretKey,
  DB_URL: dbUrl,
})
  .filter(([, value]) => !value)
  .map(([key]) => key);
if (missing.length)
  throw new Error(
    `Supabase status 未返回完整本地连接配置，缺少：${missing.join(", ")}`,
  );
if (!["127.0.0.1", "localhost"].includes(new URL(url).hostname))
  throw new Error("拒绝将非本地 Supabase 写入开发环境");
let text = await readFile(".env", "utf8").catch(() => "");
if (/SUPABASE_URL\s*=\s*https:\/\/[^\s]+\.supabase\.co/.test(text)) {
  try {
    await copyFile(".env", ".env.cloud.local", 1);
    await chmod(".env.cloud.local", 0o600);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
}
const values = {
  APP_ENV: "local",
  SUPABASE_URL: url,
  SUPABASE_PUBLISHABLE_KEY: publicKey,
  SUPABASE_SECRET_KEY: secretKey,
  DIRECT_DATABASE_URL: dbUrl,
};
const lines = text
  .split("\n")
  .filter((line) => !Object.hasOwn(values, line.split("=", 1)[0]));
await writeFile(
  ".env",
  Object.entries(values)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n") +
    "\n" +
    lines.join("\n"),
  { mode: 0o600 },
);
console.log("已将当前项目的本地 Supabase 配置写入 .env；未输出密钥。");
console.log("Studio: http://127.0.0.1:55323 | 邮件: http://127.0.0.1:55324");
