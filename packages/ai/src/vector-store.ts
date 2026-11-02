import { Document } from "@langchain/core/documents";
import { result, type SupabaseClient } from "@kqa/db";
import { createEmbeddings, type ModelConfig } from "./models";
import { validateVectors } from "./validate-vectors";

export async function searchDocumentVectors(client: SupabaseClient, question: string, tenantId: string, config: ModelConfig, documentIds: string[] | null): Promise<Array<[Document,number]>> {
  if (documentIds?.length === 0) return [];
  const vector = await createEmbeddings(config).embedQuery(question);
  validateVectors([vector],1);
  const matches = await result(client.rpc("match_document_chunks", {
    query_embedding: JSON.stringify(vector), match_tenant_id: tenantId,
    match_model: embeddingIdentity(config), match_count: 4, document_ids: documentIds,
  }));
  return (matches as Array<{content:string;document_id:string;filename:string;chunk_index:number;score:number}>).map((row) => [new Document({pageContent:row.content,metadata:{documentId:row.document_id,filename:row.filename,chunkIndex:row.chunk_index,tenantId}}),row.score]);
}

/** Prevent querying embeddings produced by a different provider/model. */
export function embeddingIdentity(config: ModelConfig) {
  return `${config.embeddingBaseUrl.replace(/\/$/,"")}#${config.embeddingModel}`;
}

export async function getDocumentChunks(documentId: string, tenantId: string, client: SupabaseClient) {
  const chunks: Array<{content:string;chunkIndex:number}>=[];
  // PostgREST caps responses; page rather than silently truncating long documents.
  for(let start=0;;start+=1000) {
    const page=await result(client.from("document_chunks").select("content,chunk_index").eq("document_id",documentId).eq("tenant_id",tenantId).order("chunk_index").range(start,start+999));
    chunks.push(...(page??[]).map((row)=>({content:row.content,chunkIndex:row.chunk_index})));
    if(!page || page.length<1000) break;
  }
  return chunks;
}
