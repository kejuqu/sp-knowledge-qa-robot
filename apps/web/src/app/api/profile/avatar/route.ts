import { result } from "@kqa/db";
import { getSupabaseServerClient } from "@kqa/auth/next";
import { getTenantUser } from "@/lib/tenant-user";
import { prepareAvatar } from "@/lib/avatar";
import { getAvatarUrl } from "@/lib/avatar-url";
export async function PUT(request:Request){
 const user=await getTenantUser();if(!user)return Response.json({error:"unauthorized"},{status:401});
 const form=await request.formData().catch(()=>null);const file=form?.get("file");
 if(!(file instanceof File))return Response.json({error:"请选择头像图片"},{status:400});
 let avatar:Buffer;try{avatar=await prepareAvatar(file);}catch(error){return Response.json({error:error instanceof Error?error.message:"头像处理失败"},{status:400});}
 const client=await getSupabaseServerClient();
 const previous=await result(client.from("users").select("avatar_key").eq("id",user.sub).single());
 const key=`${user.sub}/${crypto.randomUUID()}.webp`;
 await result(client.storage.from("kqa-avatars").upload(key,avatar,{contentType:"image/webp"}));
 const updatedAt=new Date();
 try{await result(client.from("users").update({avatar_key:key,avatar_updated_at:updatedAt.toISOString()}).eq("id",user.sub));}
 catch(error){await client.storage.from("kqa-avatars").remove([key]);throw error;}
 if(previous?.avatar_key)await client.storage.from("kqa-avatars").remove([previous.avatar_key]);
 return Response.json({avatarUrl:getAvatarUrl(user.sub,true,updatedAt)});
}
export async function DELETE(){
 const user=await getTenantUser();if(!user)return Response.json({error:"unauthorized"},{status:401});
 const client=await getSupabaseServerClient();
 const previous=await result(client.from("users").select("avatar_key").eq("id",user.sub).single());
 await result(client.from("users").update({avatar_key:null,avatar_updated_at:null}).eq("id",user.sub));
 if(previous?.avatar_key)await result(client.storage.from("kqa-avatars").remove([previous.avatar_key]));
 return Response.json({avatarUrl:null});
}
