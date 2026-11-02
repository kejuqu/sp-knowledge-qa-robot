import {beforeEach,describe,expect,it,vi} from "vitest";
const state=vi.hoisted(()=>({responses:[] as unknown[],rpc:vi.fn(),invite:vi.fn(),list:vi.fn()}));
vi.mock("../../../apps/web/src/lib/tenant-user",()=>({getTenantUser:vi.fn()}));
vi.mock("./mail",()=>({hasLocalSmtp:()=>false,sendLocalAuthEmail:vi.fn()}));
vi.mock("../../db/src/index",async(original)=>{
 const module=await original<typeof import("@kqa/db")>();
 return {...module,getSupabaseAdmin:()=>({rpc:state.rpc,auth:{admin:{inviteUserByEmail:state.invite,listUsers:state.list}},from:()=>{
  const query={select:()=>query,eq:()=>query,is:()=>query,gt:()=>query,maybeSingle:()=>query,then:(resolve:(x:unknown)=>unknown)=>Promise.resolve({data:state.responses.shift()??null,error:null}).then(resolve)};return query;
 }})};
});
import {importEmployees} from "../../../apps/web/src/lib/team-import";
const actor={tenantId:"t1",userId:"a1",keyId:null};
const employee={name:"Alice",email:"a@example.invalid"};
beforeEach(()=>{
 vi.clearAllMocks();state.responses=[{role:"admin",status:"active",permissions:null}];
 state.rpc.mockResolvedValue({data:{added:1,skipped:0,failed:0,results:[]},error:null});
 state.invite.mockResolvedValue({data:{user:{id:"u1"}},error:null});
});
describe("Supabase employee import",()=>{
 it("管理权限撤销后不能邀请或写库",async()=>{state.responses=[{role:"admin",status:"active",permissions:[]}];await expect(importEmployees(actor,[employee])).rejects.toMatchObject({status:403});expect(state.invite).not.toHaveBeenCalled();expect(state.rpc).not.toHaveBeenCalled();});
 it("已有账号不修改密码，交由事务校验归属",async()=>{state.responses.push({id:"u1"});await importEmployees(actor,[{...employee,password:"ignored123"}]);expect(state.invite).not.toHaveBeenCalled();expect(state.rpc.mock.calls[0][1].employees).toEqual([{...employee,auth_id:"u1"}]);});
 it("新账号通过真实邀请发信，不自动确认邮箱",async()=>{state.responses.push(null);await importEmployees(actor,[employee]);expect(state.invite).toHaveBeenCalledWith(employee.email,expect.objectContaining({redirectTo:expect.stringContaining("/auth/confirm")}));expect(state.rpc.mock.calls[0][1].employees).toEqual([{...employee,auth_id:"u1"}]);});
 it("发送失败保留行级错误而不伪造账号 ID",async()=>{state.responses.push(null);state.invite.mockResolvedValue({data:{user:null},error:{code:"smtp_error"}});await importEmployees(actor,[employee]);expect(state.rpc.mock.calls[0][1].employees[0]).toMatchObject({email:employee.email,error:expect.stringContaining("邀请邮件发送失败")});expect(state.rpc.mock.calls[0][1].employees[0]).not.toHaveProperty("auth_id");});
 it("撤销或过期 Key 不能邀请",async()=>{state.responses.push(null);await expect(importEmployees({...actor,keyId:"k1"},[employee])).rejects.toMatchObject({status:401});expect(state.invite).not.toHaveBeenCalled();});
 it("Key 限流发生在外部发信之前",async()=>{state.responses.push({last_used_at:new Date().toISOString()});await expect(importEmployees({...actor,keyId:"k1"},[employee])).rejects.toMatchObject({status:429});expect(state.invite).not.toHaveBeenCalled();});
 it("事务权限再校验失败时返回拒绝",async()=>{state.responses.push({id:"u1"});state.rpc.mockResolvedValue({data:null,error:{code:"42501",message:"权限已失效"}});await expect(importEmployees(actor,[employee])).rejects.toMatchObject({status:403});});
});
