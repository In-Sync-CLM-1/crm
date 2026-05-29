// Stage 2: refresh existing Worksync leads in globalcrm with their LATEST
// email-outreach tier (source) + whatsapp_outreach_status from the marketing engine.
// Matched by email. Re-runnable.
import { readFileSync } from "node:fs";

const SRC_REF = "mlvgqudcwlkolsbighnn";        // marketing engine
const DST_REF = "ejzjrvazegaxrhqizgaa";        // globalcrm
const WS_CAMPAIGN = "cd575436-0324-47b5-a752-69ef7ac09262";
const PRODUCT = "Worksync";

const env = readFileSync("C:/Users/Admin/crm/.env", "utf8");
const TOKEN = env.match(/^SUPABASE_ACCESS_TOKEN=(.+)$/m)[1].trim();

async function sql(ref, query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`SQL ${ref} failed (${r.status}): ${text}`);
  return JSON.parse(text);
}

const EXTRACT = `
with agg as (
  select lower(c.email) email,
    bool_or(sa.clicked_at is not null) clicked,
    bool_or(sa.opened_at is not null) opened,
    bool_or(sa.status='delivered') deliv,
    bool_or(sa.status='sent') sent,
    bool_or(sa.status='bounced') bounced,
    bool_or(sa.status='failed') failed,
    bool_or(sa.status='skipped') skipped,
    bool_or(wa.status='delivered') wa_deliv,
    bool_or(wa.status='sent') wa_sent,
    bool_or(wa.status='failed') wa_failed,
    bool_or(wa.status='skipped') wa_skipped
  from mkt_sequence_enrollments e
  join contacts c on c.id = e.lead_id
  left join mkt_sequence_actions sa on sa.enrollment_id = e.id and sa.channel='email'
  left join mkt_sequence_actions wa on wa.enrollment_id = e.id and wa.channel='whatsapp'
  where e.campaign_id = '${WS_CAMPAIGN}' and coalesce(c.email,'')<>''
  group by lower(c.email)
)
select email,
  (case when clicked then 'clicked' when opened then 'opened'
        when deliv then 'delivered-no-open' when sent then 'sent-pending'
        when bounced then 'bounced' when failed then 'failed'
        when skipped then 'skipped' else 'queued' end) as tier,
  (case when wa_deliv then 'delivered' when wa_sent then 'sent'
        when wa_failed then 'failed' when wa_skipped then 'skipped'
        else 'not-attempted' end) as wa
from agg`;

const distSql = `select source, count(*)::int n from contacts where product='${PRODUCT}' group by source order by n desc`;
const waSql = `select whatsapp_outreach_status s, count(*)::int n from contacts where product='${PRODUCT}' group by s order by n desc`;

async function main() {
  console.log("BEFORE — email outreach (source):"); console.table(await sql(DST_REF, distSql));
  console.log("BEFORE — whatsapp_outreach_status:"); console.table(await sql(DST_REF, waSql));

  const rows = await sql(SRC_REF, EXTRACT);
  console.log(`\nLatest state for ${rows.length} Worksync leads pulled from marketing engine.`);

  const BATCH = 1000;
  let touched = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const payload = JSON.stringify(chunk);
    const upd = `
      update contacts c
      set source = 'worksync-' || d.tier,
          whatsapp_outreach_status = d.wa,
          updated_at = now()
      from json_to_recordset($JSON$${payload}$JSON$) as d(email text, tier text, wa text)
      where c.product='${PRODUCT}' and lower(c.email) = d.email`;
    await sql(DST_REF, upd);
    touched += chunk.length;
    console.log(`  processed ${touched}/${rows.length}`);
  }

  console.log("\nAFTER — email outreach (source):"); console.table(await sql(DST_REF, distSql));
  console.log("AFTER — whatsapp_outreach_status:"); console.table(await sql(DST_REF, waSql));
}

main().catch(e => { console.error(e); process.exit(1); });
