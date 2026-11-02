ALTER TABLE public.model_presets
 ADD COLUMN kind text NOT NULL DEFAULT 'llm' CHECK (kind IN ('llm', 'embedding'));
ALTER TABLE public.model_presets DROP CONSTRAINT model_presets_tenant_id_model_base_url_key;
ALTER TABLE public.model_presets ADD CONSTRAINT model_presets_tenant_kind_model_url_key UNIQUE (tenant_id, kind, model, base_url);
