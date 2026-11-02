-- Baseline for a new Supabase database. Legacy Drizzle migrations remain as historical records.
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"title" text DEFAULT '新的对话' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);


CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"chunk_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'processing' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);


CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"citations" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);


CREATE TABLE "model_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"llm_base_url" text NOT NULL,
	"llm_api_key" text NOT NULL,
	"llm_model" text NOT NULL,
	"embedding_base_url" text NOT NULL,
	"embedding_api_key" text NOT NULL,
	"embedding_model" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "model_settings_tenant_id_unique" UNIQUE("tenant_id")
);


CREATE TABLE "tenant_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_members_tenant_user_uniq" UNIQUE("tenant_id","user_id")
);


CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);


CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);


ALTER TABLE "conversations" ADD CONSTRAINT "conversations_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "documents" ADD CONSTRAINT "documents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "documents" ADD CONSTRAINT "documents_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "model_settings" ADD CONSTRAINT "model_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "tenant_members" ADD CONSTRAINT "tenant_members_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "tenant_members" ADD CONSTRAINT "tenant_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;

CREATE INDEX "conversations_owner_idx" ON "conversations" USING btree ("owner_id");

CREATE INDEX "documents_tenant_idx" ON "documents" USING btree ("tenant_id");

CREATE INDEX "messages_conversation_idx" ON "messages" USING btree ("conversation_id");

CREATE INDEX "tenant_members_user_idx" ON "tenant_members" USING btree ("user_id");
ALTER TABLE "documents" ALTER COLUMN "status" SET DEFAULT 'pending';

ALTER TABLE "documents" ADD COLUMN "error" text;

ALTER TABLE "documents" ADD COLUMN "source_text" text;

ALTER TABLE "documents" ADD COLUMN "deleted_at" timestamp with time zone;
ALTER TABLE "conversations" ADD COLUMN "pinned" boolean DEFAULT false NOT NULL;
ALTER TABLE "documents" ADD COLUMN "file_data" "bytea";
ALTER TABLE "documents" ADD COLUMN "object_key" text;

ALTER TABLE "documents" ADD COLUMN "object_url" text;
ALTER TABLE "documents" ADD COLUMN "sha256" text;

CREATE UNIQUE INDEX "documents_tenant_sha256_active_uniq" ON "documents" USING btree ("tenant_id","sha256") WHERE "documents"."deleted_at" is null;


-- 旧记录的 MIME 来自浏览器，可能为空或为通用类型；按原解析格式一次性规范化。
UPDATE "documents" SET "mime_type" = CASE
  WHEN lower("filename") ~ '\.pdf$' THEN 'application/pdf'
  WHEN lower("filename") ~ '\.docx$' THEN 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  WHEN lower("filename") ~ '\.html?$' THEN 'text/html'
  WHEN lower("filename") ~ '\.(md|markdown)$' THEN 'text/markdown'
  WHEN lower("filename") ~ '\.txt$' THEN 'text/plain'
  ELSE "mime_type"
END;

CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE "tenant_members" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;

ALTER TABLE "tenant_members" ADD COLUMN "permissions" jsonb;

ALTER TABLE "tenant_members" ADD COLUMN "reviewed_by" uuid;

ALTER TABLE "tenant_members" ADD COLUMN "reviewed_at" timestamp with time zone;

ALTER TABLE "tenants" ADD COLUMN "name_key" text;

UPDATE "tenants" SET "name_key" = lower(regexp_replace(trim(name), '\s+', ' ', 'g'));

ALTER TABLE "tenants" ALTER COLUMN "name_key" SET NOT NULL;

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_membership_id_tenant_members_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."tenant_members"("id") ON DELETE no action ON UPDATE no action;

CREATE INDEX "notifications_recipient_idx" ON "notifications" USING btree ("tenant_id","user_id","created_at");

ALTER TABLE "tenant_members" ADD CONSTRAINT "tenant_members_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "tenants" ADD CONSTRAINT "tenants_name_key_unique" UNIQUE("name_key");

ALTER TABLE "notifications" ALTER COLUMN "body" SET DATA TYPE jsonb
USING jsonb_build_object('message', "body", 'legacy', true);

ALTER TABLE "users" ADD COLUMN "avatar_data" "bytea";

ALTER TABLE "users" ADD COLUMN "avatar_updated_at" timestamp with time zone;
CREATE TABLE "tenant_api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"name" text NOT NULL,
	"key_hash" text NOT NULL,
	"prefix" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "tenant_api_keys_key_hash_unique" UNIQUE("key_hash")
);


ALTER TABLE "tenant_api_keys" ADD CONSTRAINT "tenant_api_keys_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "tenant_api_keys" ADD CONSTRAINT "tenant_api_keys_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;

CREATE INDEX "tenant_api_keys_tenant_idx" ON "tenant_api_keys" USING btree ("tenant_id");
ALTER TABLE public.users DROP COLUMN password_hash;
ALTER TABLE public.users ADD COLUMN avatar_key text;
ALTER TABLE public.users ADD CONSTRAINT users_auth_id_fk FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

ALTER TABLE public.tenant_members ADD CONSTRAINT tenant_members_role_check CHECK (role IN ('admin','member'));
ALTER TABLE public.tenant_members ADD CONSTRAINT tenant_members_status_check CHECK (status IN ('active','pending','rejected'));
CREATE UNIQUE INDEX tenant_members_single_team ON public.tenant_members(user_id);
ALTER TABLE public.documents ADD CONSTRAINT documents_status_check CHECK (status IN ('pending','processing','ready','failed'));
ALTER TABLE public.messages ADD CONSTRAINT messages_role_check CHECK (role IN ('user','assistant'));

-- Variable dimensions support OpenAI and compatible models. Match only the same model + dimension.
CREATE TABLE public.document_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  chunk_index integer NOT NULL,
  content text NOT NULL,
  embedding extensions.vector NOT NULL,
  embedding_model text NOT NULL,
  UNIQUE(document_id, chunk_index)
);
CREATE INDEX document_chunks_tenant_document_idx ON public.document_chunks(tenant_id,document_id);
CREATE TABLE public.document_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL UNIQUE REFERENCES public.documents(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','done','failed')),
  attempts integer NOT NULL DEFAULT 0,
  lease_token uuid,
  locked_until timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX document_jobs_pending_idx ON public.document_jobs(created_at) WHERE status IN ('pending','processing');

-- These helpers bypass only the recursive membership lookup. Authorization uses live rows, never user_metadata.
CREATE FUNCTION private.has_permission(tid uuid, permission text DEFAULT NULL) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.tenant_members m WHERE m.tenant_id=tid AND m.user_id=(SELECT auth.uid()) AND m.status='active'
    AND (permission IS NULL OR COALESCE(m.permissions, CASE WHEN m.role='admin' THEN
      '["documents.upload","documents.delete","settings.manage","roles.manage","team.manage"]'::jsonb ELSE '[]'::jsonb END) ? permission)
  );
$$;
CREATE FUNCTION private.belongs_to_team(tid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM public.tenant_members WHERE tenant_id=tid AND user_id=(SELECT auth.uid()));
$$;
CREATE FUNCTION private.can_read_user(uid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT auth.uid() IS NOT NULL AND (uid=(SELECT auth.uid()) OR EXISTS (
 SELECT 1 FROM public.tenant_members m WHERE m.user_id=uid AND private.has_permission(m.tenant_id)
 AND (m.status='active' OR private.has_permission(m.tenant_id,'team.manage') OR private.has_permission(m.tenant_id,'roles.manage'))));
$$;
REVOKE ALL ON FUNCTION private.has_permission(uuid,text), private.belongs_to_team(uuid), private.can_read_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.has_permission(uuid,text), private.belongs_to_team(uuid), private.can_read_user(uuid) TO authenticated;

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['users','tenants','tenant_members','tenant_api_keys','notifications','documents','conversations','messages','model_settings','document_chunks','document_jobs'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
 END LOOP;
END $$;
GRANT SELECT ON public.users, public.tenants, public.tenant_members, public.notifications, public.documents, public.document_chunks TO authenticated;
GRANT UPDATE (avatar_key,avatar_updated_at) ON public.users TO authenticated;
GRANT UPDATE (read_at) ON public.notifications TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.conversations, public.messages, public.model_settings TO authenticated;
GRANT ALL ON public.users,public.tenants,public.tenant_members,public.tenant_api_keys,public.notifications,public.documents,public.conversations,public.messages,public.model_settings,public.document_chunks,public.document_jobs TO service_role;

CREATE POLICY users_read ON public.users FOR SELECT TO authenticated USING (private.can_read_user(id));
CREATE POLICY users_avatar ON public.users FOR UPDATE TO authenticated USING (id=(SELECT auth.uid())) WITH CHECK(id=(SELECT auth.uid()));
CREATE POLICY tenants_read ON public.tenants FOR SELECT TO authenticated USING (private.belongs_to_team(id));
CREATE POLICY members_read ON public.tenant_members FOR SELECT TO authenticated USING (user_id=(SELECT auth.uid()) OR private.has_permission(tenant_id,'team.manage') OR private.has_permission(tenant_id,'roles.manage'));
CREATE POLICY notifications_read ON public.notifications FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));
CREATE POLICY notifications_update ON public.notifications FOR UPDATE TO authenticated USING(user_id=(SELECT auth.uid())) WITH CHECK(user_id=(SELECT auth.uid()));
CREATE POLICY documents_read ON public.documents FOR SELECT TO authenticated USING(deleted_at IS NULL AND private.has_permission(tenant_id));
CREATE POLICY chunks_read ON public.document_chunks FOR SELECT TO authenticated USING(private.has_permission(tenant_id) AND EXISTS(SELECT 1 FROM public.documents d WHERE d.id=document_chunks.document_id AND d.tenant_id=document_chunks.tenant_id AND d.deleted_at IS NULL AND d.status='ready'));
CREATE POLICY conversations_owner ON public.conversations FOR ALL TO authenticated USING(owner_id=(SELECT auth.uid()) AND EXISTS(SELECT 1 FROM public.tenant_members m WHERE m.user_id=(SELECT auth.uid()) AND m.status='active')) WITH CHECK(owner_id=(SELECT auth.uid()) AND EXISTS(SELECT 1 FROM public.tenant_members m WHERE m.user_id=(SELECT auth.uid()) AND m.status='active'));
CREATE POLICY messages_owner ON public.messages FOR ALL TO authenticated USING(EXISTS(SELECT 1 FROM public.conversations c WHERE c.id=conversation_id AND c.owner_id=(SELECT auth.uid()))) WITH CHECK(EXISTS(SELECT 1 FROM public.conversations c WHERE c.id=conversation_id AND c.owner_id=(SELECT auth.uid())));
CREATE POLICY settings_manage ON public.model_settings FOR ALL TO authenticated USING(private.has_permission(tenant_id,'settings.manage')) WITH CHECK(private.has_permission(tenant_id,'settings.manage'));

CREATE FUNCTION private.complete_signup(display_name text, team_name text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid uuid := auth.uid(); mail text; tid uuid; mid uuid; created boolean := false; team_key text; member_status text;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION '请先验证邮箱' USING ERRCODE='42501'; END IF;
 SELECT email INTO mail FROM auth.users WHERE id=uid AND email_confirmed_at IS NOT NULL;
 IF mail IS NULL THEN RAISE EXCEPTION '请先验证邮箱' USING ERRCODE='42501'; END IF;
 IF length(trim(display_name)) NOT BETWEEN 1 AND 100 OR length(trim(team_name)) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION '姓名或团队名称无效'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,0));
 IF EXISTS(SELECT 1 FROM public.tenant_members WHERE user_id=uid) THEN
  RETURN (SELECT jsonb_build_object('ok',true,'membershipStatus',status) FROM public.tenant_members WHERE user_id=uid LIMIT 1);
 END IF;
 team_key := lower(regexp_replace(trim(team_name),'\s+',' ','g'));
 INSERT INTO public.users(id,email,name) VALUES(uid,lower(mail),trim(display_name)) ON CONFLICT(id) DO NOTHING;
 INSERT INTO public.tenants(name,name_key) VALUES(regexp_replace(trim(team_name),'\s+',' ','g'),team_key) ON CONFLICT(name_key) DO NOTHING RETURNING id INTO tid;
 created := tid IS NOT NULL;
 IF tid IS NULL THEN SELECT id INTO tid FROM public.tenants WHERE name_key=team_key; END IF;
 member_status := CASE WHEN created THEN 'active' ELSE 'pending' END;
 INSERT INTO public.tenant_members(tenant_id,user_id,role,status) VALUES(tid,uid,CASE WHEN created THEN 'admin' ELSE 'member' END,member_status) RETURNING id INTO mid;
 IF NOT created THEN
  INSERT INTO public.notifications(tenant_id,user_id,membership_id,type,title,body)
  SELECT tid,m.user_id,mid,'join_request','新的团队加入申请', jsonb_build_object('message',trim(display_name)||' 申请加入团队','tenantName',trim(team_name),'applicant',jsonb_build_object('id',uid,'name',trim(display_name),'email',mail))
  FROM public.tenant_members m WHERE m.tenant_id=tid AND m.status='active' AND COALESCE(m.permissions,CASE WHEN m.role='admin' THEN '["team.manage"]'::jsonb ELSE '[]'::jsonb END) ? 'team.manage';
 END IF;
 RETURN jsonb_build_object('ok',true,'membershipStatus',member_status);
END $$;
REVOKE ALL ON FUNCTION private.complete_signup(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.complete_signup(text,text) TO authenticated;
CREATE FUNCTION public.complete_signup(display_name text,team_name text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.complete_signup(display_name,team_name); $$;
REVOKE ALL ON FUNCTION public.complete_signup(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.complete_signup(text,text) TO authenticated;

CREATE FUNCTION public.match_document_chunks(query_embedding extensions.vector, match_tenant_id uuid, match_model text, match_count integer DEFAULT 4, document_ids uuid[] DEFAULT NULL)
RETURNS TABLE(content text,document_id uuid,filename text,chunk_index integer,score double precision)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT c.content,c.document_id,d.filename,c.chunk_index,1-(c.embedding OPERATOR(extensions.<=>) query_embedding)
 FROM public.document_chunks c JOIN public.documents d ON d.id=c.document_id AND d.tenant_id=c.tenant_id
 WHERE c.tenant_id=match_tenant_id AND c.embedding_model=match_model AND d.status='ready' AND d.deleted_at IS NULL
 AND extensions.vector_dims(c.embedding)=extensions.vector_dims(query_embedding)
 AND (document_ids IS NULL OR c.document_id=ANY(document_ids))
 ORDER BY c.embedding OPERATOR(extensions.<=>) query_embedding LIMIT LEAST(GREATEST(match_count,1),20);
$$;
REVOKE ALL ON FUNCTION public.match_document_chunks(extensions.vector,uuid,text,integer,uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.match_document_chunks(extensions.vector,uuid,text,integer,uuid[]) TO authenticated,service_role;

INSERT INTO storage.buckets(id,name,public,file_size_limit) VALUES('kqa-documents','kqa-documents',false,20971520),('kqa-avatars','kqa-avatars',false,2097152) ON CONFLICT(id) DO NOTHING;
CREATE POLICY document_files_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='kqa-documents' AND EXISTS(SELECT 1 FROM public.documents d WHERE d.object_key=name AND d.deleted_at IS NULL AND private.has_permission(d.tenant_id)));
CREATE POLICY avatar_files_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='kqa-avatars' AND EXISTS(SELECT 1 FROM public.users u WHERE u.avatar_key=name AND private.can_read_user(u.id)));
CREATE POLICY avatar_files_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='kqa-avatars' AND (storage.foldername(name))[1]=(SELECT auth.uid())::text);
CREATE POLICY avatar_files_update ON storage.objects FOR UPDATE TO authenticated USING(bucket_id='kqa-avatars' AND (storage.foldername(name))[1]=(SELECT auth.uid())::text) WITH CHECK(bucket_id='kqa-avatars' AND (storage.foldername(name))[1]=(SELECT auth.uid())::text);
CREATE POLICY avatar_files_delete ON storage.objects FOR DELETE TO authenticated USING(bucket_id='kqa-avatars' AND (storage.foldername(name))[1]=(SELECT auth.uid())::text);

CREATE FUNCTION private.permissions(role_name text, explicit_permissions jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT COALESCE(explicit_permissions,CASE WHEN role_name='admin' THEN '["documents.upload","documents.delete","settings.manage","roles.manage","team.manage"]'::jsonb ELSE '[]'::jsonb END);
$$;
REVOKE ALL ON FUNCTION private.permissions(text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.permissions(text,jsonb) TO service_role;

-- Server-only RPC: actor_id is set by a validated Supabase Auth session in the Next.js handler.
CREATE FUNCTION public.manage_team(actor_id uuid, team_id uuid, member_id uuid, action_name text, requested_role text DEFAULT NULL, requested_permissions jsonb DEFAULT NULL, permissions_provided boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE actor public.tenant_members; target public.tenant_members; next_role text; next_permissions jsonb; actor_permissions jsonb; next_access jsonb; team_name text; reviewer_name text;
BEGIN
 SELECT name INTO team_name FROM public.tenants WHERE id=team_id FOR UPDATE;
 SELECT * INTO actor FROM public.tenant_members WHERE tenant_id=team_id AND user_id=actor_id AND status='active';
 IF actor.id IS NULL THEN RAISE EXCEPTION '团队管理权限已失效' USING ERRCODE='42501'; END IF;
 actor_permissions:=private.permissions(actor.role,actor.permissions);
 IF action_name NOT IN ('approve','reject','update') OR NOT (actor_permissions ? CASE WHEN action_name='update' THEN 'roles.manage' ELSE 'team.manage' END) THEN RAISE EXCEPTION '没有执行此操作的权限' USING ERRCODE='42501'; END IF;
 SELECT * INTO target FROM public.tenant_members WHERE id=member_id AND tenant_id=team_id;
 IF target.id IS NULL THEN RAISE EXCEPTION '成员不存在' USING ERRCODE='P0002'; END IF;
 IF (action_name='update' AND target.status<>'active') OR (action_name<>'update' AND target.status<>'pending') THEN RAISE EXCEPTION '成员状态已变化'; END IF;
 next_role:=COALESCE(requested_role,CASE WHEN action_name='approve' THEN 'member' ELSE target.role END);
 next_permissions:=CASE WHEN permissions_provided THEN requested_permissions WHEN action_name='approve' THEN NULL ELSE target.permissions END;
 IF next_role NOT IN ('admin','member') OR (next_permissions IS NOT NULL AND (jsonb_typeof(next_permissions)<>'array' OR NOT next_permissions <@ '["documents.upload","documents.delete","settings.manage","roles.manage","team.manage"]'::jsonb)) THEN RAISE EXCEPTION '无效权限'; END IF;
 IF (action_name='update' OR (action_name='approve' AND (requested_role IS NOT NULL OR permissions_provided))) AND (NOT actor_permissions ? 'roles.manage' OR NOT private.permissions(next_role,next_permissions) <@ actor_permissions) THEN RAISE EXCEPTION '只能分配自己拥有的权限' USING ERRCODE='42501'; END IF;
 IF action_name='update' AND target.role='admin' AND private.permissions(target.role,target.permissions) ?& ARRAY['team.manage','roles.manage'] AND (next_role<>'admin' OR NOT private.permissions(next_role,next_permissions) ?& ARRAY['team.manage','roles.manage'])
 AND NOT EXISTS(SELECT 1 FROM public.tenant_members m WHERE m.tenant_id=team_id AND m.id<>target.id AND m.status='active' AND m.role='admin' AND private.permissions(m.role,m.permissions) ?& ARRAY['team.manage','roles.manage']) THEN RAISE EXCEPTION '团队至少保留一位管理员'; END IF;
 UPDATE public.tenant_members SET status=CASE WHEN action_name='reject' THEN 'rejected' ELSE 'active' END,role=CASE WHEN action_name='reject' THEN role ELSE next_role END,permissions=CASE WHEN action_name='reject' THEN permissions ELSE next_permissions END,reviewed_by=actor_id,reviewed_at=now() WHERE id=target.id;
 IF action_name<>'update' THEN UPDATE public.notifications SET read_at=now() WHERE membership_id=target.id AND type='join_request'; END IF;
 SELECT name INTO reviewer_name FROM public.users WHERE id=actor_id;
 next_access:=jsonb_build_object('role',next_role,'permissions',next_permissions);
 INSERT INTO public.notifications(tenant_id,user_id,membership_id,type,title,body) VALUES(team_id,target.user_id,target.id,
 CASE action_name WHEN 'approve' THEN 'join_approved' WHEN 'reject' THEN 'join_rejected' ELSE 'access_updated' END,
 CASE action_name WHEN 'approve' THEN '加入申请已通过' WHEN 'reject' THEN '加入申请未通过' ELSE '团队权限已更新' END,
 jsonb_build_object('message',CASE action_name WHEN 'approve' THEN '你已加入团队' WHEN 'reject' THEN '加入申请未通过，请联系管理员' ELSE '你的权限已更新' END,'tenantName',team_name,'reviewer',jsonb_build_object('id',actor_id,'name',reviewer_name),'changedBy',jsonb_build_object('id',actor_id,'name',reviewer_name),'access',next_access));
 RETURN jsonb_build_object('ok',true);
END $$;

CREATE FUNCTION public.manage_api_key(actor_id uuid,team_id uuid,action_name text,key_data jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE m public.tenant_members; k public.tenant_api_keys; output jsonb;
BEGIN
 PERFORM 1 FROM public.tenants WHERE id=team_id FOR UPDATE;
 SELECT * INTO m FROM public.tenant_members WHERE tenant_id=team_id AND user_id=actor_id AND status='active';
 IF m.id IS NULL OR NOT private.permissions(m.role,m.permissions) ? 'team.manage' THEN RAISE EXCEPTION '团队管理权限已失效' USING ERRCODE='42501'; END IF;
 IF action_name='list' THEN
 SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC),'[]'::jsonb) INTO output FROM (SELECT id,name,prefix,created_at,expires_at,last_used_at,revoked_at FROM public.tenant_api_keys WHERE tenant_id=team_id) x;
 RETURN output;
 ELSIF action_name='create' THEN
 IF (SELECT count(*) FROM public.tenant_api_keys WHERE tenant_id=team_id AND revoked_at IS NULL)>=20 THEN RAISE EXCEPTION '最多保留 20 个未撤销的密钥'; END IF;
 IF length(trim(key_data->>'name')) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION '无效密钥名称'; END IF;
 INSERT INTO public.tenant_api_keys(tenant_id,created_by,name,key_hash,prefix,expires_at) VALUES(team_id,actor_id,trim(key_data->>'name'),key_data->>'key_hash',key_data->>'prefix',now()+interval '90 days') RETURNING * INTO k;
 RETURN to_jsonb(k)-'key_hash'-'tenant_id'-'created_by';
 ELSIF action_name='revoke' THEN
 UPDATE public.tenant_api_keys SET revoked_at=now() WHERE id=(key_data->>'id')::uuid AND tenant_id=team_id AND revoked_at IS NULL RETURNING * INTO k;
 IF k.id IS NULL THEN RAISE EXCEPTION '密钥不存在或已撤销' USING ERRCODE='P0002'; END IF;
 RETURN jsonb_build_object('ok',true);
 ELSE RAISE EXCEPTION '无效操作'; END IF;
END $$;

-- Document rows and jobs are committed together; no in-memory or Redis-only enqueue window.
CREATE FUNCTION public.create_document(actor_id uuid, document_data jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE tid uuid:=(document_data->>'tenant_id')::uuid; did uuid:=(document_data->>'id')::uuid; m public.tenant_members;
BEGIN
 SELECT * INTO m FROM public.tenant_members WHERE tenant_id=tid AND user_id=actor_id AND status='active' FOR SHARE;
 IF m.id IS NULL OR NOT private.permissions(m.role,m.permissions) ? 'documents.upload' THEN RAISE EXCEPTION '没有上传权限' USING ERRCODE='42501'; END IF;
 IF document_data->>'object_key' NOT LIKE tid::text||'/'||did::text||'/%' THEN RAISE EXCEPTION '无效文件路径'; END IF;
 INSERT INTO public.documents(id,tenant_id,owner_id,filename,mime_type,size_bytes,sha256,source_text,object_key,object_url,status)
 VALUES(did,tid,actor_id,document_data->>'filename',document_data->>'mime_type',(document_data->>'size_bytes')::integer,document_data->>'sha256',document_data->>'source_text',document_data->>'object_key',document_data->>'object_url','pending');
 INSERT INTO public.document_jobs(document_id,tenant_id) VALUES(did,tid);
 RETURN did;
END $$;
CREATE FUNCTION public.mutate_document(actor_id uuid,team_id uuid,document_id uuid,action_name text) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
#variable_conflict use_column
DECLARE d public.documents; m public.tenant_members;
BEGIN
 SELECT * INTO m FROM public.tenant_members WHERE tenant_id=team_id AND user_id=actor_id AND status='active' FOR SHARE;
 IF m.id IS NULL OR NOT private.permissions(m.role,m.permissions) ? (CASE WHEN action_name='delete' THEN 'documents.delete' ELSE 'documents.upload' END) THEN RAISE EXCEPTION '没有操作权限' USING ERRCODE='42501'; END IF;
 SELECT * INTO d FROM public.documents WHERE id=document_id AND tenant_id=team_id AND deleted_at IS NULL FOR UPDATE;
 IF d.id IS NULL THEN RAISE EXCEPTION '文档不存在' USING ERRCODE='P0002'; END IF;
 IF (action_name='retry' AND d.status<>'failed') OR (action_name='delete' AND d.status IN ('pending','processing')) THEN RAISE EXCEPTION '文档状态已变化，无法执行操作'; END IF;
 DELETE FROM public.document_chunks c WHERE c.document_id=d.id;
 IF action_name='retry' THEN
 IF COALESCE(trim(d.source_text),'')='' THEN RAISE EXCEPTION '历史文档未保存文本，请重新上传'; END IF;
 UPDATE public.documents SET status='pending',chunk_count=0,error=NULL WHERE id=d.id;
 INSERT INTO public.document_jobs(document_id,tenant_id) VALUES(d.id,team_id) ON CONFLICT(document_id) DO UPDATE SET status='pending',attempts=0,lease_token=NULL,locked_until=NULL,error=NULL;
 ELSIF action_name='delete' THEN UPDATE public.documents SET deleted_at=now() WHERE id=d.id;
 ELSE RAISE EXCEPTION '无效操作'; END IF;
 RETURN jsonb_build_object('id',d.id,'objectKey',d.object_key,'status',CASE WHEN action_name='retry' THEN 'pending' ELSE d.status END,'chunkCount',0,'error',NULL);
END $$;

CREATE FUNCTION public.claim_document_job() RETURNS SETOF public.document_jobs LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE job public.document_jobs;
BEGIN
 SELECT * INTO job FROM public.document_jobs WHERE status='pending' OR (status='processing' AND locked_until<now()) ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED;
 IF job.id IS NULL THEN RETURN; END IF;
 IF job.attempts>=3 THEN
 UPDATE public.document_jobs SET status='failed',error='处理多次超时，请重试' WHERE id=job.id;
 UPDATE public.documents SET status='failed',error='处理多次超时，请重试' WHERE id=job.document_id AND deleted_at IS NULL;
 RETURN;
 END IF;
 UPDATE public.document_jobs SET status='processing',attempts=attempts+1,lease_token=gen_random_uuid(),locked_until=now()+interval '5 minutes' WHERE id=job.id RETURNING * INTO job;
 UPDATE public.documents SET status='processing',error=NULL WHERE id=job.document_id AND deleted_at IS NULL;
 RETURN NEXT job;
END $$;
CREATE FUNCTION public.finish_document_job(job_id uuid,token uuid,chunks jsonb DEFAULT NULL,failure text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE job public.document_jobs;
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
END $$;

REVOKE ALL ON FUNCTION public.manage_team(uuid,uuid,uuid,text,text,jsonb,boolean),public.manage_api_key(uuid,uuid,text,jsonb),public.create_document(uuid,jsonb),public.mutate_document(uuid,uuid,uuid,text),public.claim_document_job(),public.finish_document_job(uuid,uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.manage_team(uuid,uuid,uuid,text,text,jsonb,boolean),public.manage_api_key(uuid,uuid,text,jsonb),public.create_document(uuid,jsonb),public.mutate_document(uuid,uuid,uuid,text),public.claim_document_job(),public.finish_document_job(uuid,uuid,jsonb,text) TO service_role;
NOTIFY pgrst, 'reload schema';

CREATE FUNCTION public.import_team_members(actor_id uuid,team_id uuid,key_id uuid,employees jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE manager public.tenant_members; api_key public.tenant_api_keys; employee jsonb; profile public.users; existing public.tenant_members; auth_id uuid; row_number integer:=0; results jsonb:='[]'::jsonb; row_status text; row_message text; team_name text;
BEGIN
 SELECT name INTO team_name FROM public.tenants WHERE id=team_id FOR UPDATE;
 SELECT * INTO manager FROM public.tenant_members WHERE tenant_id=team_id AND user_id=actor_id AND status='active';
 IF manager.id IS NULL OR NOT private.permissions(manager.role,manager.permissions) ? 'team.manage' THEN RAISE EXCEPTION '团队管理权限已失效' USING ERRCODE='42501'; END IF;
 IF key_id IS NOT NULL THEN
  SELECT * INTO api_key FROM public.tenant_api_keys WHERE id=key_id AND tenant_id=team_id AND created_by=actor_id AND revoked_at IS NULL AND expires_at>now() FOR UPDATE;
  IF api_key.id IS NULL THEN RAISE EXCEPTION 'API Key 已失效' USING ERRCODE='42501'; END IF;
  IF api_key.last_used_at>now()-interval '1 second' THEN RAISE EXCEPTION '调用过于频繁' USING ERRCODE='P0429'; END IF;
  UPDATE public.tenant_api_keys SET last_used_at=now() WHERE id=key_id;
 END IF;
 IF jsonb_typeof(employees)<>'array' OR jsonb_array_length(employees) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION '每批须包含 1–100 位员工'; END IF;
 -- Same emails across teams serialize in a consistent order.
 FOR employee IN SELECT value FROM jsonb_array_elements(employees) ORDER BY value->>'email' LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended(lower(employee->>'email'),0));
 END LOOP;
 FOR employee IN SELECT value FROM jsonb_array_elements(employees) LOOP
  row_number:=row_number+1;
  auth_id:=NULL;
  row_status:='added';row_message:='已加入团队';
  auth_id:=NULLIF(employee->>'auth_id','')::uuid;
  IF auth_id IS NULL OR employee ? 'error' THEN
   row_status:='error';row_message:=COALESCE(employee->>'error','请先注册并验证邮箱，或等待邀请邮件发送成功后重试');
  ELSE
   SELECT * INTO existing FROM public.tenant_members WHERE user_id=auth_id;
   IF existing.id IS NOT NULL AND existing.tenant_id<>team_id THEN row_status:='error';row_message:='该账号已属于其他团队';
   ELSIF existing.id IS NOT NULL AND existing.status='active' THEN row_status:='skipped';row_message:='已是团队成员，未修改账号或权限';
   ELSE
    INSERT INTO public.users(id,email,name) VALUES(auth_id,lower(employee->>'email'),trim(employee->>'name')) ON CONFLICT(id) DO NOTHING;
    INSERT INTO public.tenant_members(tenant_id,user_id,status,role,reviewed_by,reviewed_at) VALUES(team_id,auth_id,'active','member',actor_id,now())
    ON CONFLICT(user_id) DO UPDATE SET status='active',role='member',permissions=NULL,reviewed_by=actor_id,reviewed_at=now() RETURNING * INTO existing;
    UPDATE public.notifications SET read_at=now() WHERE membership_id=existing.id AND type='join_request';
    INSERT INTO public.notifications(tenant_id,user_id,membership_id,type,title,body) VALUES(team_id,auth_id,existing.id,'join_approved','已加入团队',jsonb_build_object('message','管理员已将你加入团队，请验证邮箱后登录','tenantName',team_name,'reviewer',jsonb_build_object('id',actor_id,'name',(SELECT name FROM public.users WHERE id=actor_id)),'access',jsonb_build_object('role','member','permissions',NULL)));
   END IF;
  END IF;
  results:=results||jsonb_build_array(jsonb_build_object('row',row_number,'email',employee->>'email','status',row_status,'message',row_message));
 END LOOP;
 RETURN jsonb_build_object('added',(SELECT count(*) FROM jsonb_array_elements(results) r WHERE r->>'status'='added'),'skipped',(SELECT count(*) FROM jsonb_array_elements(results) r WHERE r->>'status'='skipped'),'failed',(SELECT count(*) FROM jsonb_array_elements(results) r WHERE r->>'status'='error'),'results',results);
END $$;
REVOKE ALL ON FUNCTION public.import_team_members(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.import_team_members(uuid,uuid,uuid,jsonb) TO service_role;

CREATE TABLE private.email_send_limits(email_hash text PRIMARY KEY,last_sent_at timestamptz NOT NULL,window_start timestamptz NOT NULL,attempts integer NOT NULL);
ALTER TABLE private.email_send_limits ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE ON private.email_send_limits TO service_role;
CREATE FUNCTION public.reserve_auth_email(email_hash text) RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 WITH reserved AS (
  INSERT INTO private.email_send_limits AS limits(email_hash,last_sent_at,window_start,attempts) VALUES(email_hash,now(),now(),1)
  ON CONFLICT(email_hash) DO UPDATE SET last_sent_at=now(),window_start=CASE WHEN limits.window_start<now()-interval '1 hour' THEN now() ELSE limits.window_start END,attempts=CASE WHEN limits.window_start<now()-interval '1 hour' THEN 1 ELSE limits.attempts+1 END
  WHERE limits.last_sent_at<now()-interval '60 seconds' AND (limits.window_start<now()-interval '1 hour' OR limits.attempts<5)
  RETURNING 1
 ) SELECT EXISTS(SELECT 1 FROM reserved);
$$;
REVOKE ALL ON FUNCTION public.reserve_auth_email(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_auth_email(text) TO service_role;
