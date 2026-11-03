import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  member: true,
  pending: undefined as unknown,
  updateError: null as unknown,
  updateUser: vi.fn(),
}));
vi.mock("@/lib/tenant-user", () => ({
  getTenantUser: async () => (state.member ? { sub: "alice" } : null),
}));
vi.mock("@kqa/auth/next", () => ({
  getSupabaseServerClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: { id: "alice", user_metadata: { product_tour_pending: state.pending } } },
        error: null,
      }),
      updateUser: state.updateUser,
    },
  }),
}));
import { POST } from "../../../apps/web/src/app/api/onboarding/tour/route";
const request = (origin = "https://example.com") =>
  new Request("https://example.com/api/onboarding/tour", { method: "POST", headers: { origin } });
beforeEach(() => {
  state.member = true;
  state.pending = undefined;
  state.updateError = null;
  state.updateUser.mockReset().mockImplementation(async () => {
    if (!state.updateError) state.pending = false;
    return { error: state.updateError };
  });
});
it.each([true, "true"])("shows registration tour once for marker %s", async (pending) => {
  state.pending = pending;
  expect(await (await POST(request())).json()).toEqual({ showTour: true });
  expect(state.updateUser).toHaveBeenCalledWith({ data: { product_tour_pending: false } });
  expect(await (await POST(request())).json()).toEqual({ showTour: false });
  expect(state.updateUser).toHaveBeenCalledTimes(1);
});
it.each([undefined, false, "false"])(
  "does not start a tour for existing or returning users (%s)",
  async (pending) => {
    state.pending = pending;
    expect(await (await POST(request())).json()).toEqual({ showTour: false });
    expect(state.updateUser).not.toHaveBeenCalled();
  },
);
it("requires active membership", async () => {
  state.member = false;
  expect((await POST(request())).status).toBe(401);
});
it("rejects cross-origin requests", async () => {
  expect((await POST(request("https://other.example"))).status).toBe(403);
});
it("preserves pending state if persistence fails", async () => {
  state.pending = true;
  state.updateError = new Error("unavailable");
  expect((await POST(request())).status).toBe(503);
  expect(state.pending).toBe(true);
});
