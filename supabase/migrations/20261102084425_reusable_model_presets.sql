-- Reusable endpoints never contain API keys. Team membership governs visibility.
CREATE TABLE public.model_presets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 model text NOT NULL CHECK (length(trim(model)) BETWEEN 1 AND 200),
 base_url text NOT NULL CHECK (length(base_url) <= 2048 AND base_url ~ '^https?://'),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (tenant_id, model, base_url)
);
ALTER TABLE public.model_presets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.model_presets FROM anon, authenticated;
GRANT SELECT, INSERT ON public.model_presets TO authenticated;
GRANT ALL ON public.model_presets TO service_role;
CREATE POLICY presets_read ON public.model_presets FOR SELECT TO authenticated
 USING (private.has_permission(tenant_id));
CREATE POLICY presets_create ON public.model_presets FOR INSERT TO authenticated
 WITH CHECK (private.has_permission(tenant_id, 'settings.manage'));
