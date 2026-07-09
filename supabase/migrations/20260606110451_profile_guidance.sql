CREATE TABLE public.profile_guidance (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  profile_id text NOT NULL,
  key text NOT NULL,
  title text NOT NULL,
  selector_description text NOT NULL,
  body_markdown text NOT NULL,
  status text DEFAULT 'active'::text NOT NULL,
  revision integer DEFAULT 1 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT profile_guidance_key_shape_check CHECK (key ~ '^[a-z][a-z0-9_]*$'::text),
  CONSTRAINT profile_guidance_title_not_blank CHECK (length(btrim(title)) > 0),
  CONSTRAINT profile_guidance_selector_description_not_blank CHECK (length(btrim(selector_description)) > 0),
  CONSTRAINT profile_guidance_body_markdown_not_blank CHECK (length(btrim(body_markdown)) > 0),
  CONSTRAINT profile_guidance_status_check CHECK (status = ANY (ARRAY['active'::text, 'archived'::text])),
  CONSTRAINT profile_guidance_revision_check CHECK (revision >= 1)
);

ALTER TABLE ONLY public.profile_guidance FORCE ROW LEVEL SECURITY;
ALTER TABLE public.profile_guidance OWNER TO postgres;

ALTER TABLE ONLY public.profile_guidance
  ADD CONSTRAINT profile_guidance_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.profile_guidance
  ADD CONSTRAINT profile_guidance_profile_id_profiles_id_fk
  FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX profile_guidance_profile_key_active_unique
  ON public.profile_guidance USING btree (profile_id, key)
  WHERE (status = 'active'::text);

CREATE INDEX profile_guidance_profile_status_updated_idx
  ON public.profile_guidance USING btree (profile_id, status, updated_at DESC);

CREATE OR REPLACE TRIGGER set_updated_at_profile_guidance
  BEFORE UPDATE ON public.profile_guidance
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.profile_guidance ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE public.profile_guidance TO service_role;
