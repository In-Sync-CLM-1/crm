-- The real LinkedIn connection count, as read from the connections page by the
-- local scrape. One row per org, overwritten on each read. The dashboard shows
-- this number instead of the size of li_known_connections, which is a "do not
-- invite again" working list and was never a connection count.
CREATE TABLE IF NOT EXISTS public.li_network_stats (
  org_id            uuid PRIMARY KEY,
  connections_count integer NOT NULL,
  read_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.li_network_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org members read li_network_stats" ON public.li_network_stats;
CREATE POLICY "org members read li_network_stats" ON public.li_network_stats
  FOR SELECT USING (org_id IN (SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid()));
