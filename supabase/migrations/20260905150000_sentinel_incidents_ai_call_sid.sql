-- Correlator for the LiveKit AI-call context resolver. Exotel's Voicebot
-- Applet call-start event does not carry CustomField through (proven live
-- 2026-09-05 — it reaches the earlier /exotel-callback HTTP hit but not the
-- WebSocket "start" event), so ack_token can't be round-tripped that way.
-- Exotel's own call_sid does round-trip reliably (same value at placement
-- time and at the Voicebot Applet's start event), so health-sentinel stores
-- it here right after placing the call, and sentinel-ai-call-context matches
-- on it instead of guessing via a time window.
alter table public.sentinel_incidents add column if not exists last_ai_call_sid text;
