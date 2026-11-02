import { createHmac, timingSafeEqual } from "node:crypto";

export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
export interface UploadTicket {
  id: string;
  userId: string;
  tenantId: string;
  filename: string;
  size: number;
  expiresAt: number;
}

function signature(payload: string) {
  const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Supabase server secret is not configured");
  return createHmac("sha256", secret).update(`document-upload:${payload}`).digest();
}

export function signUploadTicket(ticket: UploadTicket) {
  const payload = Buffer.from(JSON.stringify(ticket)).toString("base64url");
  return `${payload}.${signature(payload).toString("base64url")}`;
}

export function verifyUploadTicket(value: unknown, userId: string, tenantId: string): UploadTicket | null {
  if (typeof value !== "string" || value.length > 4096) return null;
  const parts = value.split(".");
  if (parts.length !== 2) return null;
  const [payload, encodedSignature] = parts as [string, string];
  const actual = Buffer.from(encodedSignature, "base64url");
  const expected = signature(payload);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const ticket = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as UploadTicket;
    if (ticket.userId !== userId || ticket.tenantId !== tenantId ||
      !Number.isFinite(ticket.expiresAt) || ticket.expiresAt <= Date.now() ||
      typeof ticket.filename !== "string" || !ticket.filename || ticket.filename.length > 255 ||
      typeof ticket.id !== "string" || !/^[a-f0-9-]{36}$/.test(ticket.id) ||
      !Number.isSafeInteger(ticket.size) || ticket.size <= 0 || ticket.size > MAX_DOCUMENT_BYTES) return null;
    return ticket;
  } catch { return null; }
}
