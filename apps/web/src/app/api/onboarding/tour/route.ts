import { getSupabaseServerClient } from "@kqa/auth/next";
import { getTenantUser } from "@/lib/tenant-user";

/** Consume the registration-only hint before displaying the tour. */
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const member = await getTenantUser();
  if (!member) return Response.json({ error: "unauthorized" }, { status: 401 });
  const client = await getSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const pending = user.user_metadata.product_tour_pending;
  if (pending !== true && pending !== "true") return Response.json({ showTour: false });
  const { error: updateError } = await client.auth.updateUser({
    data: { product_tour_pending: false },
  });
  if (updateError) return Response.json({ error: "Could not initialize tour" }, { status: 503 });
  return Response.json({ showTour: true });
}
