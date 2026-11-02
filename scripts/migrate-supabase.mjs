import {assertDatabaseTarget} from './env-safety.mjs';
import {createRequire} from 'node:module';
import {readdir,readFile} from 'node:fs/promises';
const require=createRequire(new URL('../packages/db/package.json',import.meta.url));
const postgres=require('postgres');
if(!process.env.DIRECT_DATABASE_URL)throw new Error('请先配置 DIRECT_DATABASE_URL');
assertDatabaseTarget(process.env.DIRECT_DATABASE_URL);
const sql=postgres(process.env.DIRECT_DATABASE_URL,{prepare:false,max:1,connect_timeout:15});
try{
 await sql.begin(async tx=>{
  await tx`select pg_advisory_xact_lock(714328091)`;
  await tx`create schema if not exists supabase_migrations`;
  await tx`create table if not exists supabase_migrations.schema_migrations(version text primary key, statements text[],name text)`;
  const directory=new URL('../supabase/migrations/',import.meta.url);
  for(const file of (await readdir(directory)).filter(f=>/^\d+_.*\.sql$/.test(f)).sort()){
   const version=file.split('_')[0];
   if((await tx`select version from supabase_migrations.schema_migrations where version=${version}`).length){console.log('Already applied:',file);continue;}
   const [existing]=await tx`select to_regclass('public.users') as table_name`;
   if(file.includes('supabase_platform')&&existing.table_name)throw new Error('目标已有业务表，拒绝覆盖。请先核对迁移历史。');
   const source=await readFile(new URL(file,directory),'utf8');
   await tx.unsafe(source);
   await tx`insert into supabase_migrations.schema_migrations(version,statements,name) values(${version},${[source]},${file.slice(version.length+1,-4)})`;
   console.log('Applied:',file);
  }
 });
}catch(error){console.error('Migration failed:',{code:error.code,message:error.message});process.exitCode=1;}
finally{await sql.end({timeout:1});}
