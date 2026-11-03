import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_DOCUMENT_BYTES,
  signUploadTicket,
  verifyUploadTicket,
} from "../../../apps/web/src/lib/upload-ticket";

beforeEach(() => vi.stubEnv("SUPABASE_SECRET_KEY", "test-server-only-key"));
afterEach(() => vi.unstubAllEnvs());
const ticket = () => ({
  id: "01234567-89ab-cdef-0123-456789abcdef",
  userId: "alice",
  tenantId: "team-a",
  filename: "说明.txt",
  size: 100,
  expiresAt: Date.now() + 60_000,
});

describe("direct upload authorization", () => {
  it("accepts an unmodified ticket for its issuing user and team", () => {
    const data = ticket();
    expect(verifyUploadTicket(signUploadTicket(data), "alice", "team-a")).toEqual(data);
  });
  it("rejects another user, another team, tampering and expiry", () => {
    const value = signUploadTicket(ticket());
    expect(verifyUploadTicket(value, "bob", "team-a")).toBeNull();
    expect(verifyUploadTicket(value, "alice", "team-b")).toBeNull();
    expect(verifyUploadTicket(`x${value}`, "alice", "team-a")).toBeNull();
    expect(
      verifyUploadTicket(
        signUploadTicket({ ...ticket(), expiresAt: Date.now() - 1 }),
        "alice",
        "team-a",
      ),
    ).toBeNull();
  });
  it("rejects malformed and oversized tickets", () => {
    for (const value of [null, "", "a.b.c", "a.b", "x".repeat(5000)]) {
      expect(verifyUploadTicket(value, "alice", "team-a")).toBeNull();
    }
    expect(
      verifyUploadTicket(
        signUploadTicket({ ...ticket(), size: MAX_DOCUMENT_BYTES + 1 }),
        "alice",
        "team-a",
      ),
    ).toBeNull();
  });
});
