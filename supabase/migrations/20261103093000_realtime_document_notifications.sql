-- Realtime: 用 postgres_changes 推送 membership 与通知变更，替代客户端轮询。
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tenant_members;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.tenant_members REPLICA IDENTITY FULL;

-- 文档解析结果通知：解析完成/失败时通知上传者，铃铛覆盖“团队通知 + 文档解析结果”。
CREATE OR REPLACE FUNCTION public.finish_document_job(job_id uuid,token uuid,chunks jsonb DEFAULT NULL,failure text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE job public.document_jobs; doc record; msg text;
BEGIN
 SELECT * INTO job FROM public.document_jobs WHERE id=job_id AND lease_token=token AND status='processing' AND locked_until>now() FOR UPDATE;
 IF job.id IS NULL THEN RAISE EXCEPTION '任务租约已失效'; END IF;
 PERFORM 1 FROM public.documents WHERE id=job.document_id AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION '文档已删除'; END IF;
 IF failure IS NOT NULL THEN
  UPDATE public.document_jobs SET status='failed',error=left(failure,2000),locked_until=NULL WHERE id=job.id;
  UPDATE public.documents SET status='failed',error=left(failure,2000) WHERE id=job.document_id;
 ELSE
  DELETE FROM public.document_chunks WHERE document_id=job.document_id;
  INSERT INTO public.document_chunks(document_id,tenant_id,chunk_index,content,embedding,embedding_model)
  SELECT job.document_id,job.tenant_id,(c->>'chunk_index')::integer,c->>'content',(c->>'embedding')::extensions.vector,c->>'embedding_model' FROM jsonb_array_elements(chunks) c;
  UPDATE public.document_jobs SET status='done',locked_until=NULL,error=NULL WHERE id=job.id;
  UPDATE public.documents SET status='ready',chunk_count=jsonb_array_length(chunks),error=NULL WHERE id=job.document_id;
 END IF;
 SELECT d.tenant_id,d.owner_id,d.filename INTO doc FROM public.documents d WHERE d.id=job.document_id;
 msg := CASE WHEN failure IS NULL THEN doc.filename||' 已解析完成，可用于问答' ELSE doc.filename||' 解析失败：'||coalesce(left(failure,300),'未知错误') END;
 INSERT INTO public.notifications(tenant_id,user_id,membership_id,type,title,body)
 SELECT doc.tenant_id,doc.owner_id,m.id,
  CASE WHEN failure IS NULL THEN 'document_ready' ELSE 'document_failed' END,
  CASE WHEN failure IS NULL THEN '文档解析完成' ELSE '文档解析失败' END,
  jsonb_build_object('message',msg,'filename',doc.filename) || CASE WHEN failure IS NOT NULL THEN jsonb_build_object('error',left(failure,300)) ELSE '{}'::jsonb END
 FROM public.tenant_members m WHERE m.tenant_id=doc.tenant_id AND m.user_id=doc.owner_id LIMIT 1;
END $$;

-- 认领时发现已多次超时：同样通知上传者重试。
CREATE OR REPLACE FUNCTION public.claim_document_job() RETURNS SETOF public.document_jobs LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE job public.document_jobs; doc record;
BEGIN
 SELECT * INTO job FROM public.document_jobs WHERE status='pending' OR (status='processing' AND locked_until<now()) ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED;
 IF job.id IS NULL THEN RETURN; END IF;
 IF job.attempts>=3 THEN
  UPDATE public.document_jobs SET status='failed',error='处理多次超时，请重试' WHERE id=job.id;
  UPDATE public.documents SET status='failed',error='处理多次超时，请重试' WHERE id=job.document_id AND deleted_at IS NULL;
  SELECT d.tenant_id,d.owner_id,d.filename INTO doc FROM public.documents d WHERE d.id=job.document_id AND d.deleted_at IS NULL;
  IF doc.tenant_id IS NOT NULL THEN
   INSERT INTO public.notifications(tenant_id,user_id,membership_id,type,title,body)
   SELECT doc.tenant_id,doc.owner_id,m.id,'document_failed','文档解析失败',jsonb_build_object('message',doc.filename||' 解析失败：处理多次超时，请重试','filename',doc.filename,'error','处理多次超时，请重试')
   FROM public.tenant_members m WHERE m.tenant_id=doc.tenant_id AND m.user_id=doc.owner_id LIMIT 1;
  END IF;
  RETURN;
 END IF;
 UPDATE public.document_jobs SET status='processing',attempts=attempts+1,lease_token=gen_random_uuid(),locked_until=now()+interval '5 minutes' WHERE id=job.id RETURNING * INTO job;
 UPDATE public.documents SET status='processing',error=NULL WHERE id=job.document_id AND deleted_at IS NULL;
 RETURN NEXT job;
END $$;
