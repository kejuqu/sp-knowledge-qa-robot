"use client";
import {useEffect,useState} from "react";
export default function ConfirmInvitation(){
 const [error,setError]=useState("");
 useEffect(()=>{
  const params=new URLSearchParams(window.location.hash.slice(1));
  window.history.replaceState(null,"",window.location.pathname);
  void fetch("/api/auth/session",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({access_token:params.get("access_token"),refresh_token:params.get("refresh_token")})}).then(async(response)=>{const data=await response.json();if(!response.ok){setError(data.error??"邀请确认失败");return;}window.location.replace("/set-password");}).catch(()=>setError("网络异常，请稍后重试"));
 },[]);
 return <main className="p-8 text-center">{error||"正在验证邀请…"}</main>;
}
