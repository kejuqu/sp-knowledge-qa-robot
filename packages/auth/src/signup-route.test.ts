import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  smtp: false,
  signUp: vi.fn(),
  signOut: vi.fn(),
  sendMail: vi.fn(),
  createUser: vi.fn(),
  signIn: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("@kqa/auth/next", () => ({
  getSupabaseServerClient: async () => ({
    auth: { signUp: mocks.signUp, signOut: mocks.signOut, signInWithPassword: mocks.signIn },
    rpc: mocks.rpc,
  }),
}));
vi.mock("@kqa/db", () => ({
  getSupabaseAdmin: () => ({ auth: { admin: { createUser: mocks.createUser } } }),
}));
vi.mock("@kqa/auth/mail", () => ({
  hasLocalSmtp: () => mocks.smtp,
  sendLocalAuthEmail: mocks.sendMail,
  MailError: class extends Error {
    status = 502;
  },
}));
import { POST } from "../../../apps/auth/src/app/api/signup/route";
const request = () =>
  new Request("http://auth.lvh.me:3001/api/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "test@example.com",
      password: "test-password",
      confirmPassword: "test-password",
      tenantName: "Test team",
    }),
  });
beforeEach(() => {
  vi.stubEnv("APP_ENV", "local");
  mocks.smtp = false;
  vi.clearAllMocks();
  mocks.signUp.mockResolvedValue({ data: { session: null }, error: null });
  mocks.sendMail.mockResolvedValue({});
});
afterEach(() => vi.unstubAllEnvs());
it("directs local signup to the test inbox without signing in", async () => {
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    requiresEmailConfirmation: true,
    emailDelivery: "local",
  });
  expect(mocks.signIn).not.toHaveBeenCalled();
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("does not advertise the local inbox when SMTP is configured", async () => {
  mocks.smtp = true;
  expect(await (await POST(request())).json()).toEqual({
    requiresEmailConfirmation: true,
    emailDelivery: "smtp",
  });
  expect(mocks.sendMail).toHaveBeenCalledOnce();
  expect(mocks.signUp).not.toHaveBeenCalled();
});
it("does not report email sent when Supabase rejects the signup", async () => {
  mocks.signUp.mockResolvedValue({ data: {}, error: { status: 429 } });
  const response = await POST(request());
  expect(response.status).toBe(429);
  expect((await response.json()).requiresEmailConfirmation).toBeUndefined();
});
it("preserves production's immediate sign-in flow", async () => {
  vi.stubEnv("APP_ENV", "production");
  mocks.createUser.mockResolvedValue({ error: null });
  mocks.signIn.mockResolvedValue({
    data: { user: { email_confirmed_at: "2026-11-03" } },
    error: null,
  });
  mocks.rpc.mockResolvedValue({ data: { membershipStatus: "active" }, error: null });
  expect(await (await POST(request())).json()).toEqual({ membershipStatus: "active" });
  expect(mocks.sendMail).not.toHaveBeenCalled();
});
