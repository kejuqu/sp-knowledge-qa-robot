export function validateSignup(
  body: unknown,
): body is { email: string; confirmPassword: string; password: string; tenantName: string } {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.email === "string" &&
    b.email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email.trim()) &&
    typeof b.password === "string" &&
    b.password.length >= 8 &&
    b.password.length <= 128 &&
    typeof b.confirmPassword === "string" &&
    b.confirmPassword === b.password &&
    typeof b.tenantName === "string" &&
    b.tenantName.trim().length >= 1 &&
    b.tenantName.trim().length <= 120
  );
}
