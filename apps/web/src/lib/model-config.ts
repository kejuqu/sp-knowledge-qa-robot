import { getSupabaseAdmin, rows, type ModelSetting } from "@kqa/db";
import { getDefaultModelConfig, type ModelConfig } from "@kqa/ai";

/** Server-only: called after tenant authorization, also used by the trusted ingestion worker. */
export async function getModelConfigForTenant(tenantId: string): Promise<ModelConfig> {
  const [row] = await rows<ModelSetting>(getSupabaseAdmin().from("model_settings").select("*").eq("tenant_id",tenantId).limit(1));
  const fallback = getDefaultModelConfig();
  if (!row) return fallback;
  return { llmBaseUrl:row.llmBaseUrl || fallback.llmBaseUrl,llmApiKey:row.llmApiKey || fallback.llmApiKey,llmModel:row.llmModel || fallback.llmModel,
    embeddingBaseUrl:row.embeddingBaseUrl || fallback.embeddingBaseUrl,embeddingApiKey:row.embeddingApiKey || fallback.embeddingApiKey,embeddingModel:row.embeddingModel || fallback.embeddingModel };
}
