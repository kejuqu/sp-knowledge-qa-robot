import { hasPermission } from "@kqa/auth/permissions";
import { getTenantUser } from "@/lib/tenant-user";
import { NextResponse } from "next/server";
import { result, snakeRow } from "@kqa/db";
import { getSupabaseServerClient } from "@kqa/auth/next";
import { getModelConfigForTenant } from "@/lib/model-config";

export async function GET() {
  const user = await getTenantUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!hasPermission(user, "settings.manage"))
    return NextResponse.json({ error: "没有管理模型配置的权限" }, { status: 403 });
  const config = await getModelConfigForTenant(user.tenantId);
  const client = await getSupabaseServerClient();
  const flags = await result(
    client
      .from("model_settings")
      .select("llm_shared,embedding_shared")
      .eq("tenant_id", user.tenantId)
      .maybeSingle(),
  );
  // apiKey 脱敏回显
  return NextResponse.json({
    ...config,
    llmShared: flags?.llm_shared ?? false,
    embeddingShared: flags?.embedding_shared ?? false,
    llmApiKey: mask(config.llmApiKey),
    embeddingApiKey: mask(config.embeddingApiKey),
    role: user.role,
  });
}

export async function PUT(request: Request) {
  const user = await getTenantUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // RBAC：模型配置是租户级资产，仅 admin 可改
  if (!hasPermission(user, "settings.manage")) {
    return NextResponse.json({ error: "没有管理模型配置的权限" }, { status: 403 });
  }

  const body = await request.json();
  for (const key of ["llmShared", "embeddingShared"]) {
    if (body[key] !== undefined && typeof body[key] !== "boolean")
      return NextResponse.json({ error: "无效的通用模型开关" }, { status: 400 });
  }
  // 脱敏值原样回传时不覆盖已存的 key
  const current = await getModelConfigForTenant(user.tenantId);
  const client = await getSupabaseServerClient();
  const flags = await result(
    client
      .from("model_settings")
      .select("llm_shared,embedding_shared")
      .eq("tenant_id", user.tenantId)
      .maybeSingle(),
  );
  const values = {
    tenantId: user.tenantId,
    llmShared: body.llmShared ?? flags?.llm_shared ?? false,
    embeddingShared: body.embeddingShared ?? flags?.embedding_shared ?? false,
    llmBaseUrl: body.llmBaseUrl ?? current.llmBaseUrl,
    llmApiKey: unmask(body.llmApiKey, current.llmApiKey),
    llmModel: body.llmModel ?? current.llmModel,
    embeddingBaseUrl: body.embeddingBaseUrl ?? current.embeddingBaseUrl,
    embeddingApiKey: unmask(body.embeddingApiKey, current.embeddingApiKey),
    embeddingModel: body.embeddingModel ?? current.embeddingModel,
    updatedAt: new Date(),
  };

  for (const [model, baseUrl, shared] of [
    [values.llmModel, values.llmBaseUrl, values.llmShared],
    [values.embeddingModel, values.embeddingBaseUrl, values.embeddingShared],
  ]) {
    if (shared) {
      try {
        const url = new URL(baseUrl);
        if (
          !model.trim() ||
          !["http:", "https:"].includes(url.protocol) ||
          url.username ||
          url.password ||
          url.search ||
          url.hash
        )
          throw new Error();
      } catch {
        return NextResponse.json(
          { error: "共享模型需填写有效模型名和不包含密钥、查询参数的 HTTP / HTTPS Base URL" },
          { status: 400 },
        );
      }
    }
  }
  await result(client.from("model_settings").upsert(snakeRow(values), { onConflict: "tenant_id" }));

  return NextResponse.json({ ok: true });
}

function mask(key: string) {
  if (!key) return "";
  if (key.length <= 8) return "********";
  return `${key.slice(0, 4)}****${key.slice(-4)}`;
}

function unmask(incoming: string | undefined, current: string) {
  if (incoming === undefined) return current;
  if (incoming.includes("****")) return current;
  return incoming;
}
