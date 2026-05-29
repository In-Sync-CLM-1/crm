// One-time seed: Vendorverification leads (marketing engine) -> globalcrm sales pipeline.
// Mirrors the Worksync seed exactly. Idempotency-guarded. Reads org token from crm/.env.
import { readFileSync } from "node:fs";

const SRC_REF = "mlvgqudcwlkolsbighnn";        // marketing engine (source)
const DST_REF = "ejzjrvazegaxrhqizgaa";        // globalcrm (destination)
const ORG_ID  = "61f7f96d-e80c-4d9b-a765-8eb32bd3c70d";   // In-Sync Demo
const NEW_STAGE = "cdfd18e3-69b8-4cdc-993d-0bfa037362d6"; // pipeline "New"
const VV_CAMPAIGN = "3a5de615-f01d-4540-911a-7f9bf63c5788";
const PRODUCT = "Vendorverification";

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
  select c.id,
    max(c.first_name) first_name, max(c.last_name) last_name, max(c.email) email,
    max(c.phone) phone, max(c.company) company, max(c.job_title) job_title,
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
  where e.campaign_id = '${VV_CAMPAIGN}'
  group by c.id
)
select first_name, last_name, email, phone, company, job_title,
  'vendorverification-' || (case
     when clicked then 'clicked' when opened then 'opened'
     when deliv then 'delivered-no-open' when sent then 'sent-pending'
     when bounced then 'bounced' when failed then 'failed'
     when skipped then 'skipped' else 'queued' end) as source,
  (case
     when wa_deliv then 'delivered' when wa_sent then 'sent'
     when wa_failed then 'failed' when wa_skipped then 'skipped'
     else 'not-attempted' end) as wa
from agg`;

async function main() {
  // Idempotency guard
  const [{ existing }] = await sql(DST_REF,
    `select count(*)::int existing from contacts where product='${PRODUCT}'`);
  if (existing > 0) {
    console.log(`ABORT: ${existing} ${PRODUCT} contacts already exist in globalcrm. Not re-seeding.`);
    return;
  }

  console.log("Extracting from marketing engine...");
  const rows = await sql(SRC_REF, EXTRACT);
  console.log(`  ${rows.length} unique leads extracted.`);

  const BATCH = 1000;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const payload = JSON.stringify(chunk);
    const insert = `
      insert into contacts (org_id, first_name, last_name, email, phone, company, job_title,
                            status, source, product, whatsapp_outreach_status, pipeline_stage_id)
      select '${ORG_ID}'::uuid, coalesce(nullif(d.first_name,''),'(no name)'), d.last_name,
             d.email, d.phone, d.company, d.job_title,
             'new', d.source, '${PRODUCT}', d.wa, '${NEW_STAGE}'::uuid
      from json_to_recordset($JSON$${payload}$JSON$) as d(
        first_name text, last_name text, email text, phone text,
        company text, job_title text, source text, wa text)`;
    await sql(DST_REF, insert);
    inserted += chunk.length;
    console.log(`  contacts inserted: ${inserted}/${rows.length}`);
  }

  console.log("Creating primary phone child rows...");
  await sql(DST_REF, `
    insert into contact_phones (contact_id, org_id, phone, is_primary, phone_type)
    select id, org_id, phone, true, 'mobile' from contacts c
    where product='${PRODUCT}' and coalesce(phone,'')<>''
      and not exists (select 1 from contact_phones p where p.contact_id=c.id)`);

  console.log("Creating primary email child rows...");
  await sql(DST_REF, `
    insert into contact_emails (contact_id, org_id, email, is_primary, email_type)
    select id, org_id, email, true, 'work' from contacts c
    where product='${PRODUCT}' and coalesce(email,'')<>''
      and not exists (select 1 from contact_emails e where e.contact_id=c.id)`);

  // Verify
  const summary = await sql(DST_REF, `
    select source, count(*)::int n from contacts where product='${PRODUCT}' group by source order by n desc`);
  const [{ contacts, phones, emails }] = await sql(DST_REF, `
    select (select count(*) from contacts where product='${PRODUCT}') contacts,
           (select count(*) from contact_phones p join contacts c on c.id=p.contact_id where c.product='${PRODUCT}') phones,
           (select count(*) from contact_emails e join contacts c on c.id=e.contact_id where c.product='${PRODUCT}') emails`);
  console.log("\n=== SEED COMPLETE ===");
  console.log(`contacts=${contacts}  phones=${phones}  emails=${emails}`);
  console.table(summary);
}

main().catch(e => { console.error(e); process.exit(1); });
