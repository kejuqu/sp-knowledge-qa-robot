import {assertDatabaseTarget} from './env-safety.mjs';
import { createRequire } from 'node:module';
import { readFile,readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(new URL('../packages/db/package.json',import.meta.url));
const postgres=require('postgres');
if(!process.env.DIRECT_DATABASE_URL)throw new Error('DIRECT_DATABASE_URL is required');
assertDatabaseTarget(process.env.DIRECT_DATABASE_URL);
const sql=postgres(process.env.DIRECT_DATABASE_URL,{prepare:false,max:1,connect_timeout:15});
let checks=0;
const check=(value,message)=>{assert.ok(value,message);checks++;console.log('PASS',message);};
async function run(tx){
 const role=async(uid,roleName='authenticated')=>{
  await tx.unsafe('RESET ROLE');
  await tx`select set_config('request.jwt.claim.sub',${uid},true)`;
  await tx.unsafe(`SET LOCAL ROLE ${roleName}`);
 };
 const denied=async(action,message)=>{
  let rejected=false;
  try{await tx.savepoint(action);}catch{rejected=true;}
  check(rejected,message);
 };
 const a=crypto.randomUUID(),b=crypto.randomUUID(),c=crypto.randomUUID();
 for(const id of [a,b,c])await tx`insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values(${id},${id+'@example.invalid'},now(),'{}','{}')`;
 await role(a);
 await tx`select public.complete_signup('Alice',${'test-a-'+a})`;
 let [member]=await tx`select tenant_id,id from public.tenant_members where user_id=${a}`;
 const ta=member.tenant_id;
 await role(b);
 await tx`select public.complete_signup('Bob',${'test-b-'+b})`;
 const [bm]=await tx`select tenant_id from public.tenant_members where user_id=${b}`;
 await role(c);
 const [joined]=await tx`select public.complete_signup('Charlie',${'test-a-'+a}) as result`;
 check(joined.result.membershipStatus==='pending','Joining an existing team requires approval');
 check((await tx`select id from public.tenant_members`).length===1,'Pending users see only their own membership');
 await tx.unsafe('RESET ROLE');
 const d1=crypto.randomUUID(),d2=crypto.randomUUID();
 await tx`insert into public.documents(id,tenant_id,owner_id,filename,mime_type,size_bytes,status) values(${d1},${ta},${a},'a.txt','text/plain',1,'ready'),(${d2},${bm.tenant_id},${b},'b.txt','text/plain',1,'ready')`;
 await tx`insert into public.document_chunks(document_id,tenant_id,chunk_index,content,embedding,embedding_model) values(${d1},${ta},0,'A','[1,0,0]','test'),(${d2},${bm.tenant_id},0,'B','[1,0,0]','test')`;
 await tx`insert into public.model_settings(tenant_id,llm_base_url,llm_api_key,llm_model,embedding_base_url,embedding_api_key,embedding_model) values(${ta},'https://example.invalid','secret','test','https://example.invalid','secret','test')`;
 await role(c);
 check((await tx`select id from public.documents`).length===0,'Pending users cannot read documents');
 check((await tx`select * from public.match_document_chunks('[1,0,0]',${ta},'test')`).length===0,'Pending users cannot retrieve vectors');
 await denied(sp=>sp`update public.tenant_members set role='admin' where user_id=${c}`,'Members cannot change their own role through the Data API');
 await role(a);
 check((await tx`select id from public.documents`).length===1,'Document RLS isolates tenants');
 check((await tx`select id from public.users where id=${b}`).length===0,'Profile RLS isolates tenants');
 check((await tx`select * from public.match_document_chunks('[1,0,0]',${ta},'test')`).length===1,'pgvector returns authorized chunks');
 check((await tx`select * from public.match_document_chunks('[1,0,0]',${bm.tenant_id},'test')`).length===0,'Cross-tenant vector retrieval is denied');
 check((await tx`select * from public.match_document_chunks('[1,0,0]',${ta},'test',4,'{}'::uuid[])`).length===0,'Empty document selection retrieves no chunks');
 check((await tx`select * from public.match_document_chunks('[1,0]',${ta},'test')`).length===0,'Incompatible embedding dimensions are excluded');
 check((await tx`select * from public.match_document_chunks('[1,0,0]',${ta},'other-model')`).length===0,'Different embedding models are excluded');
 await denied(sp=>sp`select public.manage_team(${a},${ta},${member.id},'update','member',null,false)`,'Authenticated clients cannot call server-only management RPCs');
 await role(a,'service_role');
 await denied(sp=>sp`select public.manage_team(${a},${ta},${member.id},'update','member',null,false)`,'The last team administrator cannot be removed');
 const [cm]=await tx`select id from public.tenant_members where user_id=${c}`;
 await tx`select public.manage_team(${a},${ta},${cm.id},'approve')`;
 await role(c);
 check((await tx`select id from public.documents`).length===1,'Approved members can read their team documents');
 check((await tx`select id from public.model_settings`).length===0,'Members without settings permission cannot read model secrets');
 await role(a,'service_role');
 const did=crypto.randomUUID();
 await tx`select public.create_document(${a},${tx.json({id:did,tenant_id:ta,filename:'job.txt',mime_type:'text/plain',size_bytes:1,sha256:'testhash',source_text:'test',object_key:`${ta}/${did}/job.txt`})}::jsonb)`;
 check((await tx`select id from public.document_jobs where document_id=${did}`).length===1,'Document creation atomically persists its job');
 const [job]=await tx`select * from public.claim_document_job()`;
 check(!!job.lease_token,'Worker claims a fenced lease');
 await denied(sp=>sp`select public.finish_document_job(${job.id},${crypto.randomUUID()},'[]',null)`,'A worker with an invalid lease cannot commit vectors');
 await tx`select public.finish_document_job(${job.id},${job.lease_token},${tx.json([{content:'text',embedding:[1,0,0],embedding_model:'test',chunk_index:0}])}::jsonb,null)`;
 check((await tx`select status from public.documents where id=${did}`)[0].status==='ready','Chunks and ready status commit atomically');
 await tx`select public.mutate_document(${a},${ta},${did},'delete')`;
 check((await tx`select id from public.document_chunks where document_id=${did}`).length===0,'Deleting a document atomically removes its vectors');
 const [imported]=await tx`select public.import_team_members(${a},${ta},null,${tx.json([{name:'Bob',email:b+'@example.invalid',auth_id:b}])}::jsonb) as result`;
 check(imported.result.failed===1,'Import rejects accounts belonging to other teams');
 await tx`update public.tenant_members set permissions='[]' where user_id=${a}`;
 await denied(sp=>sp`select public.manage_api_key(${a},${ta},'list')`,'Revoked management permission takes effect immediately');
 await role(a,'anon');
 await denied(sp=>sp`select id from public.documents`,'Anonymous requests cannot read business tables');
 await tx.unsafe('RESET ROLE');
 const [rls]=await tx`select count(*) filter(where relrowsecurity)::integer protected,count(*)::integer total from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and relkind='r'`;
 check(rls.protected===rls.total,'All public application tables have RLS enabled');
}
try{
 await sql.begin(async tx=>{
  const [existing]=await tx`select to_regclass('public.document_chunks') as table_name`;
  if(!existing.table_name){
   for(const file of (await readdir(new URL('../supabase/migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())await tx.unsafe(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
  }
  await run(tx);
  throw new Error('TEST_ROLLBACK');
 });
}catch(error){
 if(error.message==='TEST_ROLLBACK')console.log(`${checks} database checks passed; all test data rolled back.`);
 else{console.error('Database validation failed:',{code:error.code,message:error.message,where:error.where});process.exitCode=1;}
}finally{await sql.end({timeout:1});}
