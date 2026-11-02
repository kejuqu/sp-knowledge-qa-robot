import {beforeEach,describe,expect,it,vi} from "vitest";
const state=vi.hoisted(()=>({user:null as null|Record<string,unknown>,error:null as unknown,responses:[] as unknown[],getUser:vi.fn()}));
vi.mock("next/headers",()=>({cookies:vi.fn(async()=>({getAll:()=>[],set:vi.fn()}))}));
vi.mock("@supabase/ssr",()=>({createServerClient:vi.fn(()=>({auth:{getUser:state.getUser},from:()=>{
 const query={select:()=>query,eq:()=>query,limit:()=>query,single:()=>query,then:(resolve:(x:unknown)=>unknown)=>Promise.resolve({data:state.responses.shift(),error:null}).then(resolve)};return query;
}}))}));
import {getSessionUser} from "./next";
beforeEach(()=>{
 process.env.SUPABASE_URL="http://127.0.0.1:55321";process.env.SUPABASE_PUBLISHABLE_KEY="test";process.env.APP_ENV="local";
 state.user={id:"u1",email:"a@example.invalid",email_confirmed_at:"2026-01-01"};state.error=null;state.responses=[];
 state.getUser.mockImplementation(async()=>({data:{user:state.user},error:state.error}));
});
describe("Supabase verified server session",()=>{
 it("拒绝远程 Auth 已撤销的会话",async()=>{state.error=new Error("revoked");expect(await getSessionUser()).toBeNull();});
 it("未登录返回 null",async()=>{state.user=null;expect(await getSessionUser()).toBeNull();});
 it("未验证邮箱不能获取业务会话",async()=>{state.user!.email_confirmed_at=null;expect(await getSessionUser()).toBeNull();});
 it("未完成团队创建时返回 null",async()=>{state.responses=[[]];expect(await getSessionUser()).toBeNull();});
 it("从数据库读取最新团队角色而非用户元数据",async()=>{
  state.user!.user_metadata={role:"admin",tenantId:"foreign"};
  state.responses=[[{tenant_id:"t1",role:"member",tenants:{name:"Team"}}],{name:"Alice"}];
  expect(await getSessionUser()).toEqual({sub:"u1",email:"a@example.invalid",name:"Alice",tenantId:"t1",tenantName:"Team",role:"member"});
 });
});
