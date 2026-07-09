DROP FUNCTION IF EXISTS public.search_agent_activity_entries(
  text,
  text,
  vector,
  text[],
  text[],
  text[],
  timestamp with time zone,
  timestamp with time zone,
  integer
);

DROP TABLE IF EXISTS public.profile_channel_messages;
DROP TABLE IF EXISTS public.agent_activity_entries;
