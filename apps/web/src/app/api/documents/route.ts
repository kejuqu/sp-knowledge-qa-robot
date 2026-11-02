import { hasPermission } from "@kqa/auth/permissions";
import { NextResponse } from "next/server";
import { rows, result, getSupabaseAdmin, type Document } from "@kqa/db";
import { getSupabaseServerClient } from "@kqa/auth/next";
import { getTenantUser } from "@/lib/tenant-user";
import { extractText,isSupportedFile,SUPPORTED_EXTENSIONS } from "@kqa/ai";
import { enqueueDocument } from "@/lib/queue";
import { createDocumentObjectKey,createDocumentObjectUrl,deleteDocumentObject,uploadDocumentObject } from "@/lib/object-storage";
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
 const form=await request.formData();
 const file=form.get("file");
 if(!(file instanceof File))return NextResponse.json({error:"请选择文件"},{status:400});
 if(!isSupportedFile(file.name))return NextResponse.json({error:`当前支持 ${SUPPORTED_EXTENSIONS.join(" / ")} 格式`},{status:400});
 if(!file.size||file.size>20*1024*1024)return NextResponse.json({error:"文件不能为空且不能超过 20MB"},{status:400});
 const buffer=Buffer.from(await file.arrayBuffer());
 const sha256=documentSha256(buffer);
 const mimeType=getDocumentMimeType(file.name,file.type);
 const client=await getSupabaseServerClient();
 const existing=await result(client.from("documents").select("id").eq("tenant_id",user.tenantId).eq("sha256",sha256).is("deleted_at",null).limit(1));
 if(existing?.length)return NextResponse.json({error:"文件已经上传"},{status:409});
 let text:string;
 try{text=await extractText(buffer,file.name,mimeType);}catch(error){return NextResponse.json({error:`文档解析失败：${error instanceof Error?error.message:"无法读取文件"}`},{status:422});}
 if(!text.trim())return NextResponse.json({error:"未解析出文本内容（扫描 PDF 暂不支持 OCR）"},{status:422});
 const id=crypto.randomUUID();
 const objectKey=createDocumentObjectKey(user.tenantId,id,file.name);
 try{await uploadDocumentObject(objectKey,buffer,mimeType);}catch{return NextResponse.json({error:"文件存储失败，请稍后重试"},{status:502});}
 try {
  await result(getSupabaseAdmin().rpc("create_document",{actor_id:user.sub,document_data:{id,tenant_id:user.tenantId,filename:file.name,mime_type:mimeType,size_bytes:file.size,sha256,source_text:text,object_key:objectKey,object_url:createDocumentObjectUrl(objectKey)}}));
 }catch(error){
  await deleteDocumentObject(objectKey).catch(()=>undefined);
  const code=(error as {code?:string}).code;
  if(code==="23505")return NextResponse.json({error:"文件已经上传"},{status:409});
  if(code==="42501")return NextResponse.json({error:"上传权限已失效"},{status:403});
  return NextResponse.json({error:"保存文档失败，请稍后重试"},{status:503});
 }
 enqueueDocument();
 return NextResponse.json({ok:true,id},{status:202});
}
