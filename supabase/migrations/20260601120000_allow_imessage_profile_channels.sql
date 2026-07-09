ALTER TABLE ONLY "public"."profile_channels"
  DROP CONSTRAINT IF EXISTS "profile_channels_provider_check";

ALTER TABLE ONLY "public"."profile_channels"
  ADD CONSTRAINT "profile_channels_provider_check"
  CHECK (("provider" = ANY (ARRAY['telegram'::"text", 'webchat'::"text", 'e2e-test'::"text", 'imessage'::"text"])));
