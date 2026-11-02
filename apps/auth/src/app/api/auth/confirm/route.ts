import {getSupabaseServerClient} from "@kqa/auth/next";
import {NextResponse} from "next/server";
export async function GET(request:Request){
 const params=new URL(request.url).searchParams;
 const token=params.get("token_hash");const type=params.get("type");
 const base=process.env.AUTH_APP_URL??"http://auth.lvh.me:3001";
 if(!token||!type||!["signup","invite","magiclink"].includes(type))return NextResponse.redirect(new URL("/signup?error=invalid_link",base));
 const client=await getSupabaseServerClient();
 const {data,error}=await client.auth.verifyOtp({token_hash:token,type:type as "signup"|"invite"|"magiclink"});
 if(error||!data.user?.email_confirmed_at)return NextResponse.redirect(new URL("/signup?error=expired_link",base));
 if(type==="invite"||type==="magiclink")return NextResponse.redirect(new URL("/set-password",base));
 const {display_name,team_name}=data.user.user_metadata;
 if(typeof display_name!=="string"||typeof team_name!=="string")return NextResponse.redirect(new URL("/signup?error=team_setup",base));
 const {data:member,error:teamError}=await client.rpc("complete_signup",{display_name,team_name});
 if(teamError)return NextResponse.redirect(new URL("/signup?error=team_setup",base));
 return NextResponse.redirect(new URL(member.membershipStatus==="active"?"/chat":"/membership",process.env.WEB_APP_URL??"http://app.lvh.me:3100"));
}
