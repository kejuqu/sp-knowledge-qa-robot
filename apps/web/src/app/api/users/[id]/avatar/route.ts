import { result } from "@kqa/db";
import { getSupabaseServerClient } from "@kqa/auth/next";
import { getTenantUser } from "@/lib/tenant-user";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getTenantUser();
  if (!user) return new Response(null, { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response(null, { status: 404 });
  const client = await getSupabaseServerClient();
  const profile = await result(
    client.from("users").select("avatar_key").eq("id", id).maybeSingle(),
  );
  if (!profile?.avatar_key) return new Response(null, { status: 404 });
  const blob = await result(client.storage.from("kqa-avatars").download(profile.avatar_key));
  if (!blob) return new Response(null, { status: 404 });
  return new Response(await blob.arrayBuffer(), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
