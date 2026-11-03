import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
const state = vi.hoisted(() => ({ user: null as null | Record<string, unknown>, refresh: false }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn((_url, _key, options) => ({
    auth: {
      getUser: async () => {
        if (state.refresh)
          options.cookies.setAll([{ name: "sb-test", value: "refreshed", options: { path: "/" } }]);
        return { data: { user: state.user }, error: null };
      },
    },
  })),
}));
import { config, proxy } from "../../../apps/web/src/proxy";
const req = (path: string, init?: RequestInit) =>
  new NextRequest(`http://app.lvh.me:3100${path}`, init);
beforeEach(() => {
  process.env.SUPABASE_URL = "http://127.0.0.1:55321";
  process.env.SUPABASE_PUBLISHABLE_KEY = "test";
  process.env.AUTH_APP_URL = "http://auth.lvh.me:3001";
  process.env.APP_ENV = "local";
  state.user = null;
  state.refresh = false;
});
describe("Supabase proxy", () => {
  it.each([
    "/signin",
    "/signup",
    "/auth/confirm",
    "/api/signin",
    "/api/signup",
    "/api/auth/callback",
    "/api/auth/session",
    "/api/auth/confirm",
  ])("允许匿名访问认证入口 %s", async (path) => {
    expect((await proxy(req(path))).headers.get("x-middleware-next")).toBe("1");
  });
  it.each(["/api/signup/unknown", "/api/auth/unknown", "/api/password", "/set-password"])(
    "认证相邻路径仍受保护 %s",
    async (path) => {
      expect((await proxy(req(path))).headers.get("x-middleware-next")).toBeNull();
    },
  );
  it("匿名页面跳转登录", async () => {
    const response = await proxy(req("/chat"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://auth.lvh.me:3001/signin");
  });
  it("伪造旧 JWT 不能绕过 Supabase Auth", async () => {
    expect(
      (await proxy(req("/api/documents", { headers: { cookie: "kqa_session=forged" } }))).status,
    ).toBe(401);
  });
  it("邮箱未验证时拒绝业务请求", async () => {
    state.user = { id: "u1", email_confirmed_at: null };
    expect((await proxy(req("/api/documents"))).status).toBe(401);
  });
  it("合法会话放行并保留刷新后的 cookie", async () => {
    state.user = { id: "u1", email_confirmed_at: "2026-01-01" };
    state.refresh = true;
    const response = await proxy(req("/chat"));
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.cookies.get("sb-test")?.value).toBe("refreshed");
  });
  it("只有员工导入 POST 可交给 Bearer 路由鉴权", async () => {
    const headers = { authorization: "Bearer invalid" };
    expect(
      (await proxy(req("/api/team/import", { method: "POST", headers }))).headers.get(
        "x-middleware-next",
      ),
    ).toBe("1");
    expect((await proxy(req("/api/team", { method: "POST", headers }))).status).toBe(401);
    expect((await proxy(req("/api/team/import", { headers }))).status).toBe(401);
  });
  it("任务入口仍由路由校验 cron secret", async () => {
    expect((await proxy(req("/api/internal/ingest"))).headers.get("x-middleware-next")).toBe("1");
  });
  it.each(["/chat", "/api/documents/a/retry", "/settings"])("保护 %s", (url) => {
    expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(true);
  });
  it.each([
    "/signin",
    "/signin?next=/chat",
    "/signup",
    "/auth/confirm",
    "/api/signin",
    "/api/signup",
    "/api/signup/send-code",
    "/api/auth/session",
    "/api/auth/confirm",
    "/api/auth/callback",
  ])("公开认证入口不进入拦截器 %s", (url) => {
    expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(false);
  });
  it.each([
    "/signin-extra",
    "/api/signup/unknown",
    "/api/auth/unknown",
    "/api/password",
    "/set-password",
  ])("公开入口相邻路径仍匹配鉴权 %s", (url) => {
    expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(true);
  });
  it.each(["/_next/static/chunk.js", "/icon.png", "/favicon.ico"])("放行静态资源 %s", (url) => {
    expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(false);
  });
});
