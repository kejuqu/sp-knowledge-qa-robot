import { getSupabaseAdmin, result, type SupabaseClient } from "@kqa/db";
const bucket="kqa-documents";
export function createDocumentObjectKey(tenantId:string,documentId:string,filename:string) {
 const extension=filename.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g,"") || "bin";
 return `${tenantId}/${documentId}/original.${extension}`;
}
export function createDocumentObjectUrl(objectKey:string) {return `supabase://${bucket}/${objectKey}`;}
/** Upload/delete only from a handler which has already checked live document permissions. */
export async function uploadDocumentObject(objectKey:string,body:Uint8Array,contentType:string) {
 await result(getSupabaseAdmin().storage.from(bucket).upload(objectKey,body,{contentType,upsert:false}));
}
export async function readDocumentObject(objectKey:string,client:SupabaseClient) {
 const blob=await result(client.storage.from(bucket).download(objectKey));
 if(!blob)throw new Error("文件不存在");
 return new Uint8Array(await blob.arrayBuffer());
}
export async function deleteDocumentObject(objectKey:string) {
 await result(getSupabaseAdmin().storage.from(bucket).remove([objectKey]));
}
