// Instant new-lead alert to the business owner — email, then WhatsApp, then a
// phone call, always one action at a time (never in parallel) the moment a lead
// lands anywhere in the fleet (currently: globalcrm's web-lead-intake). This is
// the "brain": it owns the decision to alert and how; the caller (globalcrm)
// only relays the raw event.
//
// The call gets a retry-until-answered policy (max 3 attempts, ~60s apart, stops
// the instant one is picked up) enforced by lead-alert-call-webhook — see there.
import { sendViaResend } from '../_shared/resendEmailClient.ts';
import { sendViaExotel, buildExotelPayload, formatPhoneE164 } from '../_shared/exotelWhatsApp.ts';
import { getSupabaseClient } from '../_shared/supabaseClient.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const OPS_EMAIL = 'a@in-sync.co.in';
const OPS_PHONE = '+917738919680';
const BOLNA_FROM = '+911169323462';

interface LeadPayload {
  name?: string;
  phone?: string;
  email?: string;
  company?: string;
  product?: string;
  source?: string;
  stage?: string;
  page?: string;
}

function esc(s: string) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function alertEmail(lead: LeadPayload) {
  const name = lead.name || 'Unknown';
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;color:#222;line-height:1.6;font-size:15px">
      <h2 style="color:#0f766e;margin:0 0 12px">New lead: ${esc(name)}</h2>
      <table style="border-collapse:collapse">
        <tr><td style="padding:2px 8px 2px 0;color:#555">Product</td><td><b>${esc(lead.product || '—')}</b></td></tr>
        <tr><td style="padding:2px 8px 2px 0;color:#555">Phone</td><td><b>${esc(lead.phone || '—')}</b></td></tr>
        <tr><td style="padding:2px 8px 2px 0;color:#555">Email</td><td>${esc(lead.email || '—')}</td></tr>
        <tr><td style="padding:2px 8px 2px 0;color:#555">Company</td><td>${esc(lead.company || '—')}</td></tr>
        <tr><td style="padding:2px 8px 2px 0;color:#555">Source</td><td>${esc(lead.source || 'website')}</td></tr>
      </table>
      <p style="color:#555;margin-top:16px">Confirmation and reminder messages to the lead are already underway automatically.</p>
    </div>`;
  const r = await sendViaResend({
    from: 'In-Sync Alerts <notifications@in-sync.co.in>',
    to: [OPS_EMAIL],
    subject: `🔔 New lead: ${name} (${lead.product || 'unknown product'})`,
    html,
  });
  return r.success ? 'email ok' : `email failed: ${r.error}`;
}

async function alertWhatsApp(lead: LeadPayload) {
  const tpl = Deno.env.get('NEW_LEAD_WA_TEMPLATE');
  if (!tpl) return 'wa skipped (no approved template yet)';
  const sid = Deno.env.get('EXOTEL_WA_SID'), key = Deno.env.get('EXOTEL_WA_API_KEY'), tok = Deno.env.get('EXOTEL_WA_API_TOKEN');
  const from = Deno.env.get('EXOTEL_SENDER_NUMBER'), subdomain = Deno.env.get('EXOTEL_WA_SUBDOMAIN');
  if (!sid || !key || !tok || !from || !subdomain) return 'wa skipped (creds missing)';
  const summary = `${lead.name || 'Unknown'} — ${lead.product || 'unknown product'} — ${lead.phone || 'no phone'}`;
  const payload = buildExotelPayload({
    sourceNumber: from,
    toNumber: formatPhoneE164(OPS_PHONE),
    customData: 'lead-alert',
    content: {
      type: 'template',
      template: {
        name: tpl,
        language: { code: 'en' },
        components: [{ type: 'body', parameters: [{ type: 'text', text: summary.slice(0, 600) }] }],
      },
    },
  });
  const r = await sendViaExotel({ api_key: key, api_token: tok, subdomain, account_sid: sid, whatsapp_source_number: from }, payload);
  return r.success ? 'wa ok' : `wa failed: ${r.error}`;
}

async function alertCall(lead: LeadPayload) {
  const agent = Deno.env.get('LEAD_ALERT_BOLNA_AGENT');
  const bolnaKey = Deno.env.get('BOLNA_API_KEY');
  if (!agent || !bolnaKey) return 'call skipped (agent not configured)';
  try {
    const r = await fetch('https://api.bolna.ai/call', {
      method: 'POST',
      headers: { Authorization: `Bearer ${bolnaKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_id: agent,
        recipient_phone_number: OPS_PHONE,
        from_phone_number: BOLNA_FROM,
        user_data: {
          lead_name: lead.name || 'Unknown',
          company: lead.company || 'their company',
          product: lead.product || 'a product',
          phone: lead.phone || 'no phone on file',
        },
      }),
    });
    const j = await r.json().catch(() => ({}));
    // Seed attempt 1 of the retry state machine — lead-alert-call-webhook takes
    // it from here (retry on no-answer/busy, stop the instant one is attended).
    const supabase = getSupabaseClient();
    await supabase.from('lead_alert_calls').insert({
      lead,
      attempt_number: 1,
      bolna_execution_id: j.execution_id ?? null,
      status: 'placed',
    });
    return `call ${r.status}`;
  } catch (e) {
    return `call err ${e}`;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  try {
    const lead = (await req.json()) as LeadPayload;
    if (!lead.name && !lead.phone && !lead.email) {
      return new Response(JSON.stringify({ error: 'lead payload missing name/phone/email' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Sequential, one action at a time — never fire channels concurrently.
    const email = await alertEmail(lead);
    const wa = await alertWhatsApp(lead);
    const call = await alertCall(lead);

    console.log(`[lead-alert-notify] ${lead.name || 'unknown'}: ${email} | ${wa} | ${call}`);

    return new Response(JSON.stringify({ ok: true, email, whatsapp: wa, call }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[lead-alert-notify] error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
