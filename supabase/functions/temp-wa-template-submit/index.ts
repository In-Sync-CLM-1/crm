/**
 * temp-wa-template-submit
 * Submits whatsapp_welcome_b/c/d_260421 to Exotel for Meta approval.
 * Run once; delete after all 3 are accepted.
 */
import { getSupabaseClient } from '../_shared/supabaseClient.ts';

const EXOTEL_API_KEY   = '90eee9f15ad72d3b3f911ad8c2ab8bca1711272a72a27e70';
const EXOTEL_API_TOKEN = 'b09e22bc5bbdc2ccce1a63c7dc7ec4327d2b58a4a652de36';
const EXOTEL_SID       = 'ecrtechnicalinnovations1m';
const EXOTEL_SUBDOMAIN = 'api.in.exotel.com';

const VARIANTS = [
  {
    db_name: 'whatsapp_welcome_b_260421',
    meta_name: 'whatsapp_welcome_b_260421',
    button_text: 'Open Workspace',
    body: 'Hi {{1}}! 🚀 Your In-Sync workspace is ready.\n\nIn-Sync helps businesses cut coordination time by connecting your teams, workflows, and data in one place. No more chasing updates across apps.\n\nLog in now and set up your first workspace in under 5 minutes.',
  },
  {
    db_name: 'whatsapp_welcome_c_260421',
    meta_name: 'whatsapp_welcome_c_260421',
    button_text: 'Go to Dashboard',
    body: 'Hello {{1}}! ✅ Welcome aboard\n\nHundreds of teams across India use In-Sync to stay aligned, move faster, and close more business. Your account is now live and ready to go.\n\nYour dashboard is waiting. Take the first step today.',
  },
  {
    db_name: 'whatsapp_welcome_d_260421',
    meta_name: 'whatsapp_welcome_d_260421',
    button_text: 'Activate Account',
    body: 'Great to connect, {{1}}! 👋\n\nIn-Sync is your business command center. Manage your team, track work, and communicate all from one place.\n\nTap below to activate your account and see what In-Sync can do for you.',
  },
];

Deno.serve(async () => {
  const supabase = getSupabaseClient();
  const results: Record<string, unknown>[] = [];

  // Get the WhatsApp source number — use the org that owns the welcome template
  const { data: orgRow } = await supabase
    .from('mkt_whatsapp_templates')
    .select('org_id')
    .eq('template_name', 'whatsapp_welcome_260414')
    .single();

  const { data: settings } = orgRow ? await supabase
    .from('exotel_settings')
    .select('whatsapp_source_number')
    .eq('org_id', orgRow.org_id)
    .eq('is_active', true)
    .eq('whatsapp_enabled', true)
    .limit(1)
    .maybeSingle() : { data: null };

  const sourceNumber = settings?.whatsapp_source_number;
  if (!sourceNumber) {
    return new Response(JSON.stringify({ error: 'whatsapp_source_number not found in exotel_settings' }), { status: 500 });
  }

  const exotelBase = `https://${EXOTEL_API_KEY}:${EXOTEL_API_TOKEN}@${EXOTEL_SUBDOMAIN}/v2/accounts/${EXOTEL_SID}`;

  for (const v of VARIANTS) {
    // Check if template already in pending/approved state in DB
    const { data: existing } = await supabase
      .from('mkt_whatsapp_templates')
      .select('id, approval_status')
      .eq('template_name', v.db_name)
      .maybeSingle();

    if (!existing) {
      results.push({ template: v.db_name, skipped: true, reason: 'not found in DB — run db-migrate-temp first' });
      continue;
    }

    if (existing.approval_status === 'approved' || existing.approval_status === 'submitted') {
      results.push({ template: v.db_name, skipped: true, reason: `already ${existing.approval_status}` });
      continue;
    }

    // Submit to Exotel
    const payload = {
      name: v.meta_name,
      category: 'MARKETING',
      language_code: 'en',
      source_number: sourceNumber,
      components: [
        {
          type: 'BODY',
          text: v.body,
          example: { body_text: [['John']] },
        },
        {
          type: 'BUTTONS',
          buttons: [
            {
              type: 'URL',
              text: v.button_text,
              url: 'https://wa.in-sync.co.in',
            },
          ],
        },
      ],
    };

    const res = await fetch(`${exotelBase}/whatsapp/templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const resBody = await res.json().catch(() => null);

    // Derive approval_status from response
    // 'submitted' = sent to Meta; 'approved' / 'rejected' once Meta responds
    let newStatus = res.ok ? 'submitted' : 'pending';
    const metaStatus = resBody?.response?.data?.status || resBody?.status || '';
    if (typeof metaStatus === 'string') {
      if (metaStatus.toUpperCase() === 'APPROVED') newStatus = 'approved';
      else if (metaStatus.toUpperCase() === 'REJECTED') newStatus = 'rejected';
    }

    // Update DB row
    const updatePayload: Record<string, unknown> = { approval_status: newStatus };
    if (newStatus === 'submitted') updatePayload.submitted_at = new Date().toISOString();
    await supabase
      .from('mkt_whatsapp_templates')
      .update(updatePayload)
      .eq('id', existing.id);

    results.push({
      template: v.db_name,
      http_status: res.status,
      meta_status: metaStatus,
      db_status: newStatus,
      response: resBody,
    });
  }

  return new Response(JSON.stringify({ source_number: sourceNumber, results }, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
});
