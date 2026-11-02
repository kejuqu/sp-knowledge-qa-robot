import {beforeEach,describe,expect,it,vi} from "vitest";
const state=vi.hoisted(()=>({embed:vi.fn(),rpc:vi.fn()}));
vi.mock("../../ai/src/models",()=>({createEmbeddings:()=>({embedQuery:state.embed})}));
import {searchDocumentVectors} from "../../ai/src/vector-store";
import type {SupabaseClient} from "@kqa/db";
const config={llmBaseUrl:"",llmApiKey:"",llmModel:"",embeddingBaseUrl:"http://localhost:11434/v1/",embeddingApiKey:"",embeddingModel:"test"};
const client={rpc:state.rpc} as unknown as SupabaseClient;
beforeEach(()=>{vi.clearAllMocks();state.embed.mockResolvedValue([1,0,0]);state.rpc.mockResolvedValue({data:[],error:null});});
describe("pgvector recall",()=>{
 it("空文档范围不生成向量也不查询",async()=>{expect(await searchDocumentVectors(client,"q","t1",config,[])).toEqual([]);expect(state.embed).not.toHaveBeenCalled();expect(state.rpc).not.toHaveBeenCalled();});
 it("将团队、文档和模型限制传入同一次 RPC",async()=>{
  await searchDocumentVectors(client,"q","t1",config,["d1"]);
  expect(state.rpc).toHaveBeenCalledWith("match_document_chunks",{query_embedding:"[1,0,0]",match_tenant_id:"t1",match_model:"http://localhost:11434/v1#test",match_count:4,document_ids:["d1"]});
 });
 it("保留分块原文、引用和余弦分数",async()=>{
  state.rpc.mockResolvedValue({data:[{content:"answer",document_id:"d1",filename:"a.txt",chunk_index:2,score:0.9}],error:null});
  const [[doc,score]]=await searchDocumentVectors(client,"q","t1",config,null);
  expect(doc.pageContent).toBe("answer");expect(doc.metadata).toMatchObject({documentId:"d1",chunkIndex:2,tenantId:"t1"});expect(score).toBe(0.9);
 });
 it("无效向量不进入数据库",async()=>{state.embed.mockResolvedValue([NaN]);await expect(searchDocumentVectors(client,"q","t1",config,null)).rejects.toThrow("无效");expect(state.rpc).not.toHaveBeenCalled();});
 it("召回出错时向上传播而非伪造成功",async()=>{state.rpc.mockResolvedValue({data:null,error:{message:"denied"}});await expect(searchDocumentVectors(client,"q","t1",config,null)).rejects.toThrow("denied");});
});
