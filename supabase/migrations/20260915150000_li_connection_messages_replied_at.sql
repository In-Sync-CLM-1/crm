-- Tracks whether an existing-connection has replied to a sent message, so the
-- automated follow-up sequence (li_connection_sequences) can be stopped for
-- anyone who's already responded, instead of scripting further steps at them.
alter table li_connection_messages add column if not exists replied_at timestamptz;
