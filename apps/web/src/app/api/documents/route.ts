import { hasPermission } from "@kqa/auth/permissions";
import { NextResponse } from "next/server";
import { rows, result, getSupabaseAdmin, type Document } from "@kqa/db";
import { getSupabaseServerClient } from "@kqa/auth/next";
import { getTenantUser } from "@/lib/tenant-user";
import { extractText,isSupportedFile,SUPPORTED_EXTENSIONS } from "@kqa/ai";
import { enqueueDocument } from "@/lib/queue";
import { createDocumentObjectKey,createDocumentObjectUrl,deleteDocumentObject,uploadDocumentObject } from "@/lib/object-storage";
import { MAX_DOCUMENT_BYTES, verifyUploadTicket } from "@/lib/upload-ticket";
import { documentSha256 } from "@/lib/document-file";
import { getDocumentMimeType } from "@/lib/utils";
export const maxDuration=300;
export async function GET() {
 const user=await getTenantUser();
 if(!user) return NextResponse.json({error:"unauthorized"},{status:401});
 const client=await getSupabaseServerClient();
 const docs=await rows<Document>(client.from("documents").select("id,filename,mime_type,size_bytes,chunk_count,status,error,created_at,object_key").eq("tenant_id",user.tenantId).is("deleted_at",null).order("created_at",{ascending:false}));
 return NextResponse.json(docs.map(({objectKey,...doc})=>({...doc,downloadUrl:objectKey?`/api/documents/${doc.id}/content?download=1`:null})));
}
export async function POST(request:Request) {
 const user=await getTenantUser();
 if(!user)return NextResponse.json({error:"unauthorized"},{status:401});
 if(!hasPermission(user,"documents.upload"))return NextResponse.json({error:"没有上传文档权限"},{status:403});
 const client=await getSupabaseServerClient();
 const direct=request.headers.get("content-type")?.includes("application/json");
 let ticket:ReturnType<typeof verifyUploadTicket>=null;
 let file:File;
 if(direct) {
  const body=await request.json().catch(()=>null);
  ticket=verifyUploadTicket(body?.ticket,user.sub,user.tenantId);
  if(!ticket)return NextResponse.json({error:"上传凭证无效或已过期，请重新上传"},{status:400});
  const existing=await result(client.from("documents").select("id").eq("id",ticket.id).eq("tenant_id",user.tenantId).is("deleted_at",null).maybeSingle());
  if(existing)return NextResponse.json({ok:true,id:existing.id},{status:202});
  const key=createDocumentObjectKey(user.tenantId,ticket.id,ticket.filename);
  try {
   const storage=getSupabaseAdmin().storage.from("kqa-documents");
   const info=await result(storage.info(key));
   if(!info||info.size!==ticket.size||info.size>MAX_DOCUMENT_BYTES)return NextResponse.json({error:"上传文件大小与凭证不符"},{status:400});
   const blob=await result(storage.download(key));
   if(!blob||blob.size!==ticket.size)return NextResponse.json({error:"文件上传不完整"},{status:400});
   file=new File([blob],ticket.filename);
  }catch{return NextResponse.json({error:"无法读取上传文件，请确认上传成功后重试"},{status:502});}
 }else{
  const form=await request.formData();
  const candidate=form.get("file");
  if(!(candidate instanceof File))return NextResponse.json({error:"请选择文件"},{status:400});
  file=candidate;
 }
 if(!(file instanceof File))return NextResponse.json({error:"请选择文件"},{status:400});
 if(!isSupportedFile(file.name))return NextResponse.json({error:`当前支持 ${SUPPORTED_EXTENSIONS.join(" / ")} 格式`},{status:400});
 if(!file.size||file.size>20*1024*1024)return NextResponse.json({error:"文件不能为空且不能超过 20MB"},{status:400});
 const buffer=Buffer.from(await file.arrayBuffer());
 const sha256=documentSha256(buffer);
 const mimeType=getDocumentMimeType(file.name,file.type);
 const existing=await result(client.from("documents").select("id").eq("tenant_id",user.tenantId).eq("sha256",sha256).is("deleted_at",null).limit(1));
 if(existing?.length)return NextResponse.json({error:"文件已经上传"},{status:409});
 let text:string;
 try{text=await extractText(buffer,file.name,mimeType);}catch(error){return NextResponse.json({error:`文档解析失败：${error instanceof Error?error.message:"无法读取文件"}`},{status:422});}
 if(!text.trim())return NextResponse.json({error:"未解析出文本内容（扫描 PDF 暂不支持 OCR）"},{status:422});
 const id=ticket?.id??crypto.randomUUID();
 const objectKey=createDocumentObjectKey(user.tenantId,id,file.name);
 try{if(!direct)await uploadDocumentObject(objectKey,buffer,mimeType);}catch{return NextResponse.json({error:"文件存储失败，请稍后重试"},{status:502});}
 try {
  await result(getSupabaseAdmin().rpc("create_document",{actor_id:user.sub,document_data:{id,tenant_id:user.tenantId,filename:file.name,mime_type:mimeType,size_bytes:file.size,sha256,source_text:text,object_key:objectKey,object_url:createDocumentObjectUrl(objectKey)}}));
 }catch(error){
  // A transport error can occur after the transaction commits. Never delete a
  // direct-upload object here: retries with the same ticket are idempotent.
  if(!direct)await deleteDocumentObject(objectKey).catch(()=>undefined);
  const code=(error as {code?:string}).code;
  if(code==="23505")return NextResponse.json({error:"文件已经上传"},{status:409});
  if(code==="42501")return NextResponse.json({error:"上传权限已失效"},{status:403});
  return NextResponse.json({error:"保存文档失败，请稍后重试"},{status:503});
 }
 enqueueDocument();
 return NextResponse.json({ok:true,id},{status:202});
}
