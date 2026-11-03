import { after } from "next/server";
import { getSupabaseAdmin, result } from "@kqa/db";
import { ingestDocument } from "@kqa/ai";
import { getModelConfigForTenant } from "./model-config";

/** Jobs are inserted atomically with documents by create_document/mutate_document. */
export async function processDocumentJobs(maxJobs = 3) {
  const admin = getSupabaseAdmin();
  let processed = 0;
  for (let i = 0; i < maxJobs; i++) {
    const jobs = await result(admin.rpc("claim_document_job"));
    const job = jobs?.[0];
    if (!job) break;
    try {
      const doc = await result(
        admin
          .from("documents")
          .select("filename,source_text")
          .eq("id", job.document_id)
          .eq("tenant_id", job.tenant_id)
          .is("deleted_at", null)
          .single(),
      );
      if (!doc?.source_text) throw new Error("文档缺少解析文本");
      const config = await getModelConfigForTenant(job.tenant_id);
      const chunks = await ingestDocument(
        {
          text: doc.source_text,
          documentId: job.document_id,
          filename: doc.filename,
          tenantId: job.tenant_id,
        },
        config,
      );
      await result(
        admin.rpc("finish_document_job", { job_id: job.id, token: job.lease_token, chunks }),
      );
    } catch (error) {
      const failure = error instanceof Error ? error.message : "文档处理失败";
      await result(
        admin.rpc("finish_document_job", { job_id: job.id, token: job.lease_token, failure }),
      ).catch(() => undefined);
    }
    processed++;
  }
  return processed;
}

/** Next.js keeps the response alive; a cron endpoint recovers jobs after worker crashes/timeouts. */
export function enqueueDocument() {
  after(async () => {
    await processDocumentJobs(1).catch((error) =>
      console.error("Document worker failed", error instanceof Error ? error.name : "UnknownError"),
    );
  });
}
