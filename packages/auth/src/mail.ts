import {createHash} from "node:crypto";
import nodemailer from "nodemailer";
import {getSupabaseAdmin,result} from "@kqa/db";

export class MailError extends Error {
 constructor(message:string,public status=502){super(message);}
}
export function hasLocalSmtp(){return !!process.env.SMTP_HOST;}
/** Local SMTP configuration only; no project-wide SMTP settings are changed. */
export async function sendLocalAuthEmail(input:{type:"signup"|"invite"|"magiclink";email:string;password?:string;data?:Record<string,string>}){
 if(!process.env.SMTP_HOST||!process.env.SMTP_FROM)throw new MailError("请配置 SMTP_HOST 和 SMTP_FROM",503);
 const admin=getSupabaseAdmin();
 const reserved=await result(admin.rpc("reserve_auth_email",{email_hash:createHash("sha256").update(input.email.toLowerCase()).digest("hex")}));
 if(!reserved)throw new MailError("发送过于频繁，请稍后重试",429);
 const generated=await admin.auth.admin.generateLink(input.type==="signup"
  ? {type:"signup",email:input.email,password:input.password!,options:{data:input.data}}
  : {type:input.type,email:input.email});
 if(generated.error)throw new MailError("无法生成邮箱验证邮件，请稍后重试");
 const url=new URL("/api/auth/confirm",process.env.AUTH_APP_URL??"http://auth.lvh.me:3001");
 url.searchParams.set("token_hash",generated.data.properties.hashed_token);
 url.searchParams.set("type",input.type);
 const transport=nodemailer.createTransport({
  host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT??587),secure:process.env.SMTP_SECURE==="true",
  ...(process.env.SMTP_USER?{auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD}}:{}),
  connectionTimeout:10_000,socketTimeout:15_000,
 });
 try{
  await transport.sendMail({from:process.env.SMTP_FROM,to:input.email,subject:input.type==="invite"?"团队知识库邀请":"验证你的邮箱",
   text:`${input.type==="invite"?"你收到了团队知识库邀请。":"请验证你的邮箱以完成注册。"}\n\n点击链接：${url.toString()}\n\n验证码：${generated.data.properties.email_otp}\n\n如果不是你发起的操作，请忽略这封邮件。`});
 }catch{throw new MailError("邮件发送失败，请检查本地 SMTP 配置或稍后重试");}
 finally{transport.close();}
 return generated.data.user;
}
