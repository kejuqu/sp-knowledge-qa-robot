import { getTenantUser } from "@/lib/tenant-user";
import { getSupabaseServerClient } from "@kqa/auth/next";
import { rows } from "@kqa/db";

/** Persisted snapshots avoid missed pub/sub events and cross-instance Redis dependencies. */
export async function GET(request:Request) {
 const user=await getTenantUser();
 if(!user) return new Response("unauthorized",{status:401});
 const client=await getSupabaseServerClient();
 const encoder=new TextEncoder();
 let timer:ReturnType<typeof setTimeout>|undefined;
 let closed=false;
 let finish:()=>void=()=>{};
 const stream=new ReadableStream<Uint8Array>({
  start(controller) {
   finish=()=>{if(closed)return;closed=true;clearTimeout(timer);try{controller.close();}catch{}};
   const poll=async()=>{
    if(closed)return;
    try {
     // Recheck active membership each poll; revoked users stop receiving immediately.
     if(!await getTenantUser()){finish();return;}
     const docs=await rows(client.from("documents").select("id,status,chunk_count,error,deleted_at").eq("tenant_id",user.tenantId).is("deleted_at",null));
     if(closed)return;
     controller.enqueue(encoder.encode(`event: snapshot\ndata: ${JSON.stringify(docs)}\n\n`));
     timer=setTimeout(poll,2000);
    }catch{finish();}
   };
   request.signal.addEventListener("abort",finish,{once:true});
   void poll();
  },
  cancel(){closed=true;clearTimeout(timer);request.signal.removeEventListener("abort",finish);}
 });
 return new Response(stream,{headers:{"Content-Type":"text/event-stream","Cache-Control":"no-cache, no-transform",Connection:"keep-alive"}});
}
