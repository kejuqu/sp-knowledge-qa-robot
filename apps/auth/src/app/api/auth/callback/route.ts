import { getSupabaseServerClient } from "@kqa/auth/next";
import { NextResponse } from "next/server";
export async function GET(request:Request){
 const code=new URL(request.url).searchParams.get("code");
 const base=process.env.AUTH_APP_URL??"http://auth.lvh.me:3001";
 if(!code)return NextResponse.redirect(new URL("/signup?error=invalid_link",base));
 const client=await getSupabaseServerClient();
 const {data,error}=await client.auth.exchangeCodeForSession(code);
 if(error||!data.user?.email_confirmed_at)return NextResponse.redirect(new URL("/signup?error=expired_link",base));
 const {display_name,team_name}=data.user.user_metadata;
 if(typeof display_name!=="string"||typeof team_name!=="string")return NextResponse.redirect(new URL("/set-password",base));
 // Metadata supplies only display labels. The transaction decides all roles and membership status.
 const {data:member,error:teamError}=await client.rpc("complete_signup",{display_name,team_name});
 if(teamError)return NextResponse.redirect(new URL("/signup?error=team_setup",base));
 const web=process.env.WEB_APP_URL??"http://app.lvh.me:3100";
 return NextResponse.redirect(new URL(member.membershipStatus==="active"?"/chat":"/membership",web));
}
