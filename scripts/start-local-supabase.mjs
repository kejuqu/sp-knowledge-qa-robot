import {spawnSync} from 'node:child_process';
const started=spawnSync('supabase',['start'],{stdio:'inherit'});
if(started.status!==0)process.exit(started.status??1);
await import('./local-supabase-env.mjs');
