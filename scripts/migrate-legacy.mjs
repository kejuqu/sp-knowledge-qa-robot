import {assertDatabaseTarget} from './env-safety.mjs';
import {createRequire} from 'node:module';
import {mkdir,writeFile,chmod} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const dbRequire=createRequire(new URL('../packages/db/package.json',import.meta.url));
const webRequire=createRequire(new URL('../apps/web/package.json',import.meta.url));
const postgres=dbRequire('postgres');
const {createClient}=dbRequire('@supabase/supabase-js');
const {S3Client,GetObjectCommand}=webRequire('@aws-sdk/client-s3');
assertDatabaseTarget(process.env.DIRECT_DATABASE_URL);
const target=postgres(process.env.DIRECT_DATABASE_URL,{prepare:false,max:1,connect_timeout:15});
const source=postgres(process.env.LEGACY_DATABASE_URL??'postgres://kqa:kqa_password@localhost:5432/kqa',{prepare:false,max:1});
assertDatabaseTarget(process.env.SUPABASE_URL);
const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SECRET_KEY??process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const minio=new S3Client({endpoint:process.env.LEGACY_MINIO_ENDPOINT??'http://localhost:9000',region:'us-east-1',forcePathStyle:true,credentials:{accessKeyId:process.env.LEGACY_MINIO_ACCESS_KEY??'minioadmin',secretAccessKey:process.env.LEGACY_MINIO_SECRET_KEY??'minioadmin'}});
const legacyBucket=process.env.LEGACY_MINIO_BUCKET??'kqa-documents';
const tables=['users','tenants','tenant_members','tenant_api_keys','notifications','documents','conversations','messages','model_settings'];
const createdUsers=[];
let committed=false;
async function must(query){const {data,error}=await query;if(error)throw new Error(error.message);return data;}
try{
 const backupDir=new URL('../.migration-backups/',import.meta.url);
 await mkdir(backupDir,{recursive:true,mode:0o700});
 const stamp=new Date().toISOString().replace(/[:.]/g,'-');
 const backup=new URL(`legacy-${stamp}.sql`,backupDir);
 const dump=execFileSync('docker',['exec','kqa-postgres','pg_dump','-U','kqa','-d','kqa','--no-owner','--no-privileges'],{maxBuffer:256*1024*1024});
 await writeFile(backup,dump,{mode:0o600});
 await chmod(backup,0o600);
 console.log('Saved private legacy database backup in .migration-backups/');
 const data={};
 // Snapshot prevents a document from being copied at two different processing states.
 await source.begin('isolation level repeatable read read only',async tx=>{
  for(const table of tables)data[table]=await tx.unsafe(`select * from public.${table}`);
 });
 for(const user of data.users){
  const {data:existing,error}=await admin.auth.admin.getUserById(user.id);
  if(existing?.user){if(existing.user.email?.toLowerCase()!==user.email.toLowerCase())throw new Error('Auth ID collision; refusing to overwrite');continue;}
  if(error&&error.status!==404)throw new Error('Unable to inspect Auth user before migration');
  const member=data.tenant_members.find(m=>m.user_id===user.id);
  const team=data.tenants.find(t=>t.id===member?.tenant_id);
  await must(admin.auth.admin.createUser({id:user.id,email:user.email,password_hash:user.password_hash,email_confirm:false,user_metadata:{display_name:user.name,team_name:team?.name??'',migrated_from_legacy:true}}));
  createdUsers.push(user.id);
 }
 const migratedUsers=[];
 for(const row of data.users){
  const user={...row};delete user.password_hash;
  if(user.avatar_data){
   const key=`${user.id}/legacy.webp`;
   await must(admin.storage.from('kqa-avatars').upload(key,user.avatar_data,{contentType:'image/webp',upsert:true}));
   user.avatar_key=key;user.avatar_data=null;
  }
  migratedUsers.push(user);
 }
 const migratedDocuments=[];
 for(const row of data.documents){
  const doc={...row};
  if(!doc.deleted_at){
   let body=doc.file_data;
   if(doc.object_key){const object=await minio.send(new GetObjectCommand({Bucket:legacyBucket,Key:doc.object_key}));body=await object.Body.transformToByteArray();}
   if(body){
    const key=`${doc.tenant_id}/${doc.id}/original.${doc.filename.split(".").pop().toLowerCase().replace(/[^a-z0-9]/g,"")||"bin"}`;
    await must(admin.storage.from('kqa-documents').upload(key,body,{contentType:doc.mime_type,upsert:true}));
    doc.object_key=key;doc.object_url=`supabase://kqa-documents/${key}`;doc.file_data=null;
    doc.sha256=createHash('sha256').update(body).digest('hex');
   }
   // Rebuild embeddings from saved source text; old Milvus vectors are never mixed with pgvector.
   doc.status=doc.source_text?.trim()?'pending':'failed';doc.chunk_count=0;doc.error=doc.source_text?.trim()?null:'历史文档未保存解析文本，请重新上传';
  }
  migratedDocuments.push(doc);
 }
 await target.begin(async tx=>{
  await tx`select pg_advisory_xact_lock(714328092)`;
  // Source reviewed_by references other source users; insert every profile before memberships.
  for(const [table,records] of [['users',migratedUsers],['tenants',data.tenants],['tenant_members',data.tenant_members],['tenant_api_keys',data.tenant_api_keys],['notifications',data.notifications],['documents',migratedDocuments],['conversations',data.conversations],['messages',data.messages],['model_settings',data.model_settings]]){
   for(const record of records)await tx`insert into ${tx(table)} ${tx(record)} on conflict(id) do nothing`;
  }
  for(const doc of migratedDocuments.filter(d=>!d.deleted_at&&d.status==='pending'))await tx`insert into public.document_jobs(document_id,tenant_id) values(${doc.id},${doc.tenant_id}) on conflict(document_id) do nothing`;
 });
 committed=true;
 for(const table of tables){
  const ids=data[table].map(row=>row.id);
  const [row]=ids.length?await target`select count(*)::integer as count from ${target(table)} where id=any(${ids}::uuid[])`:[{count:0}];
  if(row.count!==ids.length)throw new Error('Post-migration row count mismatch for '+table);
  console.log(`${table}: ${row.count} rows verified`);
 }
 console.log('Legacy passwords retained as Supabase Auth hashes. Previously unverified emails remain unverified.');
 console.log('Legacy services and source data have not been stopped or deleted.');
}catch(error){
 if(!committed)for(const id of createdUsers)await admin.auth.admin.deleteUser(id).catch(()=>undefined);
 console.error('Legacy migration failed:',{code:error.code,message:error.message});process.exitCode=1;
}finally{await source.end({timeout:1});await target.end({timeout:1});minio.destroy();}
