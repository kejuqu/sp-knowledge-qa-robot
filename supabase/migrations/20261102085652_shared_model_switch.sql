ALTER TABLE public.model_settings ADD COLUMN llm_shared boolean NOT NULL DEFAULT false, ADD COLUMN embedding_shared boolean NOT NULL DEFAULT false;
ALTER TABLE public.model_presets ADD COLUMN is_shared boolean NOT NULL DEFAULT false;
DROP POLICY presets_read ON public.model_presets;
CREATE POLICY presets_read ON public.model_presets FOR SELECT TO authenticated
 USING (private.has_permission(tenant_id) OR (is_shared AND EXISTS (SELECT 1 FROM public.tenant_members m WHERE m.user_id=(SELECT auth.uid()) AND m.status='active')));
GRANT UPDATE ON public.model_presets TO authenticated;
CREATE POLICY presets_update ON public.model_presets FOR UPDATE TO authenticated
 USING (private.has_permission(tenant_id,'settings.manage')) WITH CHECK (private.has_permission(tenant_id,'settings.manage'));
CREATE FUNCTION private.sync_model_presets() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 UPDATE public.model_presets SET is_shared=false WHERE tenant_id=NEW.tenant_id;
 INSERT INTO public.model_presets(tenant_id,kind,model,base_url,is_shared)
 SELECT NEW.tenant_id,v.kind,trim(v.model),rtrim(trim(v.url),'/'),v.shared
 FROM (VALUES ('llm',NEW.llm_model,NEW.llm_base_url,NEW.llm_shared),('embedding',NEW.embedding_model,NEW.embedding_base_url,NEW.embedding_shared)) v(kind,model,url,shared)
 WHERE length(trim(v.model))>0 AND length(trim(v.url))>0
 ON CONFLICT (tenant_id,kind,model,base_url) DO UPDATE SET is_shared=EXCLUDED.is_shared;
 RETURN NEW;
END;
$$;
CREATE TRIGGER sync_model_presets AFTER INSERT OR UPDATE ON public.model_settings FOR EACH ROW EXECUTE FUNCTION private.sync_model_presets();
