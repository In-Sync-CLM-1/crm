// Health Sentinel — daily fleet-wide pre-flight check.
//
// Runs every morning (before the workday) and ACTIVELY probes every Supabase
// project in the org, then emails one failure-led green/red checklist per
// project to the ops address. The guiding principle: you cannot catch a system
// that has gone silent from its error logs — you must assert the heartbeat and
// alarm on its ABSENCE. Each check below maps to a real silent-failure class
// we have actually been burned by.
//
// Auth: invoked by the crm cron-worker (Bearer = crm legacy service_role JWT),
// so it runs as a normal verify_jwt=true function.
//
// Secrets it needs on the crm project:
//   MGMT_TOKEN      — org-wide Supabase Management API access token (sbp_...)
//   RESEND_API_KEY  — for sending the report email
// Everything else (per-project refs, keys, config) is discovered at runtime via
// the Management API, so coverage stays comprehensive as projects come and go.

const MGMT = "https://api.supabase.com";
const OPS_EMAIL = "a@in-sync.co.in";
const FROM = "In-Sync Health Sentinel <notifications@in-sync.co.in>";

// Per-project metadata. Projects not listed here still get the generic checks
// (a brand-new project is covered automatically); listed flags add specialised
// checks. Keep this in sync with the org as products are added.
const META: Record<string, { name: string; dialer?: boolean; marketing?: boolean }> = {
  mlvgqudcwlkolsbighnn: { name: "crm (core)", marketing: true },
  ejzjrvazegaxrhqizgaa: { name: "globalcrm", dialer: true },
  rdhvkluvkieajtmpljyz: { name: "work" },
  jmxpudhpdltktuupfbxs: { name: "fieldsync" },
  gwfofzqrfpwojejjodgz: { name: "event" },
  htdwkhtfdifwajdkkpul: { name: "ats" },
  hmqwmmlqfrrktfsiowdh: { name: "expense" },
  fibpamjksquymscdlfal: { name: "vendorverification" },
  unmdhcjrplwntqjiciiz: { name: "wa" },
  xpndsoozxjrvcwhauunh: { name: "email" },
  zcmfxpknsybponbudyqb: { name: "smbconnect" },
  ufwvyybrctjpwipbveqe: { name: "RMPL" },
  upnhhrhobvdmpfnldvgb: { name: "website" },
};

type Status = "ok" | "fail" | "warn";
interface Check { label: string; status: Status; detail: string }

const token = () => Deno.env.get("MGMT_TOKEN") ?? "";

async function mgmtGet(path: string): Promise<{ s: number; j: any }> {
  const r = await fetch(MGMT + path, { headers: { Authorization: `Bearer ${token()}` } });
  let j: any = null;
  try { j = await r.json(); } catch { /* non-json */ }
  return { s: r.status, j };
}

async function sql(ref: string, query: string): Promise<any[]> {
  const r = await fetch(`${MGMT}/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const j = await r.json();
  if (!Array.isArray(j)) throw new Error(j?.message || `sql failed (${r.status})`);
  return j;
}

// --- generic checks (every project) -----------------------------------------

async function checkDb(ref: string): Promise<Check> {
  try {
    await sql(ref, "select 1 as ok");
    return { label: "Database reachable", status: "ok", detail: "responding" };
  } catch (e) {
    return { label: "Database reachable", status: "fail", detail: String(e) };
  }
}

async function checkRegistration(ref: string): Promise<Check> {
  try {
    const { s, j } = await mgmtGet(`/v1/projects/${ref}/config/auth`);
    if (s !== 200) return { label: "Registration email", status: "warn", detail: `config unreadable (${s})` };
    const onResend = /resend/i.test(j.smtp_host || "");
    const rate = Number(j.rate_limit_email_sent || 0);
    if (onResend && rate > 2) return { label: "Registration email", status: "ok", detail: `Resend, ${rate}/hr` };
    return {
      label: "Registration email",
      status: "fail",
      detail: `signup mail on ${j.smtp_host ? j.smtp_host : "built-in starter"} @ ${rate}/hr — past the ${rate}/hr signup silently fails`,
    };
  } catch (e) {
    return { label: "Registration email", status: "warn", detail: String(e) };
  }
}

async function checkRlsExposure(ref: string): Promise<Check> {
  try {
    const rows = await sql(
      ref,
      "select tablename from pg_tables where schemaname='public' and rowsecurity=false order by tablename",
    );
    if (rows.length === 0) return { label: "Row-level security", status: "ok", detail: "no public tables exposed" };
    const names = rows.map((r) => r.tablename);
    return {
      label: "Row-level security",
      status: "warn",
      detail: `${names.length} public table(s) with RLS off: ${names.slice(0, 8).join(", ")}${names.length > 8 ? "…" : ""}`,
    };
  } catch (e) {
    return { label: "Row-level security", status: "warn", detail: String(e) };
  }
}

// --- specialised checks ------------------------------------------------------

async function checkDialer(ref: string): Promise<Check[]> {
  const out: Check[] = [];
  try {
    const cfg = await sql(
      ref,
      "select dialing_active, calling_windows from organization_settings where org_id='61f7f96d-e80c-4d9b-a765-8eb32bd3c70d'",
    );
    const active = cfg[0]?.dialing_active === true;
    out.push({
      label: "Dialer switched on",
      status: active ? "ok" : "fail",
      detail: active ? "dialing_active = true" : "dialing_active = false (dialer is OFF)",
    });

    // Ready-to-call leads for each active, owned script (catches an empty queue
    // or a script that lost its owner).
    const cand = await sql(
      ref,
      `select s.name, (select count(*) from get_ai_call_candidates('61f7f96d-e80c-4d9b-a765-8eb32bd3c70d'::uuid, 100000, s.owner_id)) n
       from ai_call_scripts s where s.org_id='61f7f96d-e80c-4d9b-a765-8eb32bd3c70d' and s.is_active=true and s.owner_id is not null`,
    );
    const dry = cand.filter((c) => Number(c.n) === 0).map((c) => c.name);
    const total = cand.reduce((a, c) => a + Number(c.n), 0);
    out.push({
      label: "Leads ready to dial",
      status: dry.length ? "warn" : "ok",
      detail: dry.length ? `${dry.join(", ")} have 0 candidates` : `${total} leads queued across ${cand.length} agent(s)`,
    });

    // Liveness by expected output: a dead dialer (e.g. a 401'd cron) shows up as
    // zero calls. 48h window smooths the Sunday no-call day.
    const calls = await sql(
      ref,
      "select count(*) n from call_logs where org_id='61f7f96d-e80c-4d9b-a765-8eb32bd3c70d' and caller_type='ai' and created_at > now() - interval '48 hours'",
    );
    const n = Number(calls[0]?.n || 0);
    out.push({
      label: "Dialer actually calling",
      status: n > 0 ? "ok" : "fail",
      detail: n > 0 ? `${n} AI calls in last 48h` : "ZERO AI calls in 48h — dialer is silent",
    });
  } catch (e) {
    out.push({ label: "Dialer health", status: "warn", detail: String(e) });
  }
  return out;
}

async function checkMarketing(ref: string): Promise<Check> {
  // crm marketing engine heartbeat: a 401'd / paused cron suite goes silent.
  try {
    const rows = await sql(
      ref,
      "select count(*) n from mkt_sequence_actions where coalesce(sent_at, created_at) > now() - interval '24 hours'",
    );
    const n = Number(rows[0]?.n || 0);
    return {
      label: "Marketing engine live",
      status: n > 0 ? "ok" : "warn",
      detail: n > 0 ? `${n} outreach actions in 24h` : "no outreach actions in 24h",
    };
  } catch (e) {
    return { label: "Marketing engine live", status: "warn", detail: String(e) };
  }
}

// --- module-wise checks ------------------------------------------------------
// Each app's user-facing modules mapped to the REAL data layer that backs them,
// so a broken migration / dropped column / dead view shows up as that specific
// module going red (instead of a vague "project up"). Probes are read-only.
//   table/view: assert it exists and the listed key columns are present
//   rpc: actually execute it (read-only) and assert it doesn't error
const GC_ORG = "61f7f96d-e80c-4d9b-a765-8eb32bd3c70d";
type ModSpec =
  | { m: string; table: string; cols?: string[] }
  | { m: string; view: string; cols?: string[] }
  | { m: string; rpc: string };
// Helper for existence-only module lists (no column assertions): [label, table][].
const tbl = (pairs: [string, string][]): ModSpec[] => pairs.map(([m, table]) => ({ m, table }));
const MODULE_MAP: Record<string, ModSpec[]> = {
  ejzjrvazegaxrhqizgaa: [ // globalcrm
    { m: "Dashboard", rpc: `get_dashboard_stats('${GC_ORG}'::uuid)` },
    { m: "Contacts", table: "contacts", cols: ["first_name", "email", "phone", "status", "pipeline_stage_id"] },
    { m: "Pipeline (disposition view)", view: "contact_latest_disposition" },
    { m: "Pipeline stages", table: "pipeline_stages", cols: ["name", "stage_order", "probability", "is_active"] },
    { m: "Clients", table: "clients", cols: ["first_name", "last_name", "email", "phone", "company"] },
    { m: "Calling", table: "call_logs", cols: ["agent_id", "status", "conversation_duration", "disposition_id"] },
    { m: "Call dispositions", table: "call_dispositions", cols: ["name", "category", "is_active"] },
    { m: "Templates (WhatsApp)", table: "communication_templates", cols: ["template_name", "template_type", "status"] },
    { m: "Templates (Email)", table: "email_templates", cols: ["is_active"] },
    { m: "Chat / Messages", table: "chat_conversations", cols: ["name", "conversation_type"] },
    { m: "Attendance", table: "attendance_records", cols: ["user_id", "date", "status", "sign_in_time"] },
    { m: "Leave", table: "leave_applications", cols: ["user_id", "leave_type", "start_date", "status", "total_days"] },
    { m: "Leave balances", table: "leave_balances" },
    { m: "HR approvals", table: "attendance_regularizations", cols: ["user_id", "status"] },
    { m: "Users", table: "user_roles", cols: ["role", "is_active", "org_id"] },
    { m: "Teams", table: "teams", cols: ["name", "manager_id"] },
    { m: "Designations", table: "designations", cols: ["name", "role", "is_active"] },
    { m: "Approval matrix", table: "approval_rules", cols: ["approval_type_id"] },
    { m: "Custom fields", table: "custom_fields", cols: ["field_name", "field_type", "field_order"] },
    { m: "Forms", table: "forms", cols: ["name", "is_active", "connector_type"] },
    { m: "Outbound webhooks", table: "outbound_webhooks", cols: ["name", "trigger_event", "webhook_url", "is_active"] },
    { m: "Calendar", table: "contact_activities", cols: ["activity_type", "scheduled_at"] },
    { m: "Billing", table: "organization_subscriptions", cols: ["subscription_status", "wallet_balance", "next_billing_date"] },
    { m: "Reports", rpc: `get_pipeline_performance_report('${GC_ORG}'::uuid)` },
  ],
  // The other products are NOT sales CRMs — each has its own modules. Maps below
  // are built from each project's REAL table inventory (existence-probed; exact
  // names, so no false reds — a red here means a table genuinely vanished).
  rdhvkluvkieajtmpljyz: tbl([ // work (Work-Sync — task mgmt)
    ["Tasks", "tasks"], ["Task milestones", "task_milestones"], ["Task comments", "task_comments"],
    ["Task attachments", "task_attachments"], ["Task watchers", "task_watchers"], ["Support tickets", "support_tickets"],
    ["Payments", "payments"], ["Teams", "teams"], ["Team members", "team_members"], ["Designations", "designations"],
    ["Feature permissions", "feature_permissions"], ["Reporting hierarchy", "reporting_hierarchy"],
    ["Notifications", "notifications"], ["Users", "profiles"], ["Roles", "user_roles"],
  ]),
  jmxpudhpdltktuupfbxs: tbl([ // fieldsync (field service)
    ["Leads", "leads"], ["Lead activities", "lead_activities"], ["Customers", "customers"], ["Visits", "visits"],
    ["Visit photos", "visit_photos"], ["Daily plans", "daily_plans"], ["Plan enrollments", "plan_enrollments"],
    ["Order collections", "order_collections"], ["Invoices", "invoices"], ["Payments", "payment_transactions"],
    ["Dispositions", "dispositions"], ["Sub-dispositions", "sub_dispositions"], ["Branches", "branches"],
    ["Agent locations", "agent_locations"], ["Travel reimbursements", "travel_reimbursements"],
    ["Incentive targets", "monthly_incentive_targets"], ["Attendance", "attendance"], ["Subscription plans", "subscription_plans"],
    ["Form templates", "form_templates"], ["Visit checklists", "visit_checklist_templates"], ["Routes", "route_deviations"],
    ["Users", "profiles"], ["Roles", "user_roles"],
  ]),
  gwfofzqrfpwojejjodgz: tbl([ // event (event mgmt)
    ["Events", "events"], ["Sessions", "sessions"], ["Session speakers", "session_speakers"], ["Speakers", "speakers"],
    ["Registrations", "registrations"], ["Attendee schedules", "attendee_schedules"], ["Check-ins", "check_ins"],
    ["Invitations", "invitations"], ["Badges", "badges"], ["Badge awards", "badge_awards"], ["Certificates", "certificates"],
    ["Certificate templates", "certificate_templates"], ["Rewards", "rewards"], ["Reward claims", "reward_claims"],
    ["Meeting bookings", "meeting_bookings"], ["Meeting requests", "meeting_requests"], ["Meeting slots", "meeting_slots"],
    ["Sponsors", "sponsors"], ["Content library", "content_library"], ["Landing pages", "landing_pages"],
    ["Engagement scores", "engagement_scores"], ["Billing accounts", "billing_accounts"], ["Users", "profiles"], ["Roles", "user_roles"],
  ]),
  hmqwmmlqfrrktfsiowdh: tbl([ // expense
    ["Expense claims", "travel_expense_claims"], ["Expense items", "travel_expense_items"], ["Teams", "teams"],
    ["Team members", "team_members"], ["Org memberships", "org_memberships"], ["Users", "profiles"], ["Roles", "user_roles"],
  ]),
  fibpamjksquymscdlfal: tbl([ // vendorverification (vendor empanelment)
    ["Vendors", "vendors"], ["Vendor documents", "vendor_documents"], ["Verifications", "vendor_verifications"],
    ["Vendor users", "vendor_users"], ["Vendor invitations", "vendor_invitations"], ["Categories", "vendor_categories"],
    ["Category documents", "category_documents"], ["Document types", "document_types"], ["Document analyses", "document_analyses"],
    ["Consent records", "consent_records"], ["Data requests", "data_requests"], ["Fraud alerts", "fraud_alerts"],
    ["Breach notifications", "breach_notifications"], ["Coupons", "coupons"], ["Subscriptions", "org_subscriptions"],
    ["Billing", "billing_transactions"], ["WhatsApp", "whatsapp_messages"], ["WhatsApp templates", "whatsapp_templates"],
    ["Webhooks", "webhook_endpoints"], ["Workflows", "workflow_assignments"], ["Tenants", "tenants"],
    ["Users", "profiles"], ["Roles", "user_roles"],
  ]),
  zcmfxpknsybponbudyqb: tbl([ // smbconnect
    ["Companies", "companies"], ["Members", "members"], ["Associations", "associations"],
    ["Association managers", "association_managers"], ["Connections", "connections"], ["Posts", "posts"],
    ["Post comments", "post_comments"], ["Events", "events"], ["Event registrations", "event_registrations"],
    ["Event coupons", "event_coupons"], ["Email campaigns", "email_campaigns"], ["Email lists", "email_lists"],
    ["Email templates", "email_templates"], ["Email conversations", "email_conversations"], ["WhatsApp", "whatsapp_messages"],
    ["WhatsApp lists", "whatsapp_lists"], ["WhatsApp templates", "whatsapp_templates"], ["Chats", "chats"],
    ["Messages", "messages"], ["Member invitations", "member_invitations"], ["Certifications", "certifications"],
    ["Skills", "skills"], ["Key functionaries", "key_functionaries"], ["Analytics events", "analytics_events"],
    ["Admin users", "admin_users"], ["Company admins", "company_admins"], ["Users", "profiles"],
  ]),
  htdwkhtfdifwajdkkpul: tbl([ // ats (applicant tracking)
    ["Candidates", "candidates"], ["Candidate resumes", "candidate_resumes"], ["Jobs", "jobs"], ["Mandates", "mandates"],
    ["Mandate candidates", "mandate_candidates"], ["Clients", "clients"], ["Pipeline stages", "pipeline_stages"],
    ["Call logs", "call_logs"], ["Call dispositions", "call_dispositions"], ["Sites", "sites"],
    ["Site coordinators", "site_coordinators"], ["Site headcount", "site_headcount_agreements"], ["General tasks", "general_tasks"],
    ["Public applications", "public_job_applications"], ["Email templates", "email_templates"], ["SMS templates", "sms_templates"],
    ["WhatsApp templates", "whatsapp_templates"], ["Teams", "teams"], ["Designations", "designations"],
    ["Webhook connectors", "webhook_connectors"], ["Bulk import", "bulk_import_history"], ["Project teams", "project_team_members"],
    ["Users", "profiles"], ["Roles", "user_roles"],
  ]),
  upnhhrhobvdmpfnldvgb: tbl([ // website (core marketing site)
    ["Blogs", "blogs"], ["Contacts", "contacts"], ["Demo requests", "demo_requests"], ["Events", "events"],
    ["Tickets", "tickets"], ["Support tickets", "support_tickets"], ["Tutorials", "tutorials"], ["Whitepapers", "whitepapers"],
    ["Onboarding applications", "onboarding_applications"], ["Unanswered queries", "unanswered_queries"],
    ["Chat logs", "chat_logs"], ["Users", "profiles"], ["Roles", "user_roles"],
  ]),
};

// Canonical module catalog for the sibling CRM apps that don't have a hand-built
// MODULE_MAP. Each module lists candidate relation names (to absorb name drift
// across apps) and/or candidate RPC names. At runtime we probe ONLY the modules
// whose table/view/function actually exists in that project — so it auto-fits
// every app and never cries wolf about a module an app simply doesn't have.
type CanonMod = { m: string; rels?: string[]; rpcs?: string[] };
const CANONICAL: CanonMod[] = [
  { m: "Dashboard", rpcs: ["get_dashboard_stats"] },
  { m: "Contacts / Leads", rels: ["contacts", "leads"] },
  { m: "Pipeline stages", rels: ["pipeline_stages", "stages"] },
  { m: "Pipeline (disposition view)", rels: ["contact_latest_disposition"] },
  { m: "Clients", rels: ["clients"] },
  { m: "Calling", rels: ["call_logs", "calls"] },
  { m: "Call dispositions", rels: ["call_dispositions", "dispositions"] },
  { m: "WhatsApp", rels: ["whatsapp_messages", "whatsapp_logs"] },
  { m: "Email", rels: ["email_conversations", "emails", "email_logs"] },
  { m: "Chat", rels: ["chat_conversations", "conversations"] },
  { m: "Templates", rels: ["communication_templates", "whatsapp_templates", "email_templates", "templates"] },
  { m: "Notes", rels: ["notes", "contact_notes"] },
  { m: "Tasks / Activities", rels: ["contact_activities", "activities", "tasks"] },
  { m: "Calendar / Meetings", rels: ["meetings", "calendar_events", "company_holidays"] },
  { m: "Attendance", rels: ["attendance_records", "attendance"] },
  { m: "Leave", rels: ["leave_applications", "leave_requests", "leaves"] },
  { m: "HR approvals", rels: ["attendance_regularizations", "hr_approvals", "approvals"] },
  { m: "Users", rels: ["profiles"] },
  { m: "Roles", rels: ["user_roles"] },
  { m: "Teams", rels: ["teams"] },
  { m: "Designations", rels: ["designations"] },
  { m: "Custom fields", rels: ["custom_fields"] },
  { m: "Forms", rels: ["forms"] },
  { m: "Outbound webhooks", rels: ["outbound_webhooks", "webhooks"] },
  { m: "Billing / Subscriptions", rels: ["organization_subscriptions", "subscriptions"] },
];

async function checkCanonicalModules(ref: string): Promise<Check[]> {
  let relRows: any[], fnRows: any[];
  try {
    relRows = await sql(
      ref,
      "select table_name, table_type from information_schema.tables where table_schema='public'",
    );
    fnRows = await sql(ref, "select distinct proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'");
  } catch (e) {
    return [{ label: "Modules", status: "warn", detail: `schema read failed: ${e}` }];
  }
  const relType: Record<string, string> = {};
  for (const r of relRows) relType[r.table_name] = r.table_type; // 'BASE TABLE' | 'VIEW'
  const fns = new Set(fnRows.map((r) => r.proname));

  const out: Check[] = [];
  for (const c of CANONICAL) {
    const rel = (c.rels || []).find((r) => r in relType);
    const fn = (c.rpcs || []).find((f) => fns.has(f));
    if (!rel && !fn) continue; // module not present in this app — skip, don't flag
    if (rel && relType[rel] === "VIEW") {
      // Views can exist in the catalog but break at runtime — actually select.
      try {
        await sql(ref, `select 1 from "${rel}" limit 1`);
        out.push({ label: `Module · ${c.m}`, status: "ok", detail: `${rel} (view) ok` });
      } catch (e) {
        out.push({ label: `Module · ${c.m}`, status: "fail", detail: `view "${rel}" broken: ${String(e).slice(0, 100)}` });
      }
    } else {
      out.push({ label: `Module · ${c.m}`, status: "ok", detail: rel ? `${rel} present` : `rpc ${fn} present` });
    }
  }
  return out;
}

async function checkModules(ref: string): Promise<Check[]> {
  const specs = MODULE_MAP[ref];
  if (!specs) return await checkCanonicalModules(ref); // sibling apps: self-adapting catalog
  const out: Check[] = [];

  // One round-trip: pull every relevant table/view column from the catalog.
  const rels = [...new Set(specs.flatMap((s) => ("table" in s ? [s.table] : "view" in s ? [s.view] : [])))];
  const present: Record<string, Set<string>> = {};
  if (rels.length) {
    try {
      const rows = await sql(
        ref,
        `select table_name, column_name from information_schema.columns where table_schema='public' and table_name in (${rels.map((r) => `'${r}'`).join(",")})`,
      );
      for (const r of rows) (present[r.table_name] ??= new Set()).add(r.column_name);
    } catch (e) {
      return [{ label: "Modules", status: "warn", detail: `catalog read failed: ${e}` }];
    }
  }

  for (const s of specs) {
    if ("rpc" in s) {
      try {
        await sql(ref, `select ${s.rpc}`);
        out.push({ label: `Module · ${s.m}`, status: "ok", detail: "function executes" });
      } catch (e) {
        out.push({ label: `Module · ${s.m}`, status: "fail", detail: `RPC broken: ${String(e).slice(0, 120)}` });
      }
      continue;
    }
    const rel = "table" in s ? s.table : s.view;
    const cols = present[rel];
    if (!cols || cols.size === 0) {
      out.push({ label: `Module · ${s.m}`, status: "fail", detail: `${"view" in s ? "view" : "table"} "${rel}" missing` });
      continue;
    }
    const missing = (s.cols || []).filter((c) => !cols.has(c));
    out.push(
      missing.length
        ? { label: `Module · ${s.m}`, status: "fail", detail: `"${rel}" missing column(s): ${missing.join(", ")}` }
        : { label: `Module · ${s.m}`, status: "ok", detail: `${rel} ok` },
    );
  }
  return out;
}

async function runProject(ref: string): Promise<{ ref: string; name: string; checks: Check[] }> {
  const m = META[ref] ?? { name: ref };
  const checks: Check[] = [];
  checks.push(await checkDb(ref));
  // Skip the heavy checks if the DB itself is down.
  if (checks[0].status !== "fail") {
    checks.push(await checkRegistration(ref));
    checks.push(await checkRlsExposure(ref));
    if (m.dialer) checks.push(...(await checkDialer(ref)));
    if (m.marketing) checks.push(await checkMarketing(ref));
    checks.push(...(await checkModules(ref)));
  }
  return { ref, name: m.name, checks };
}

// --- report ------------------------------------------------------------------

function dot(s: Status) { return s === "ok" ? "🟢" : s === "warn" ? "🟡" : "🔴"; }

function buildEmail(results: { ref: string; name: string; checks: Check[] }[], istDate: string) {
  const reds = results.flatMap((r) => r.checks.filter((c) => c.status === "fail").map((c) => ({ p: r.name, c })));
  const ambers = results.flatMap((r) => r.checks.filter((c) => c.status === "warn").map((c) => ({ p: r.name, c })));
  const allGreen = reds.length === 0 && ambers.length === 0;
  const subject = reds.length
    ? `🔴 Health Sentinel — ${reds.length} issue(s) need attention (${istDate})`
    : ambers.length
    ? `🟡 Health Sentinel — ${ambers.length} thing(s) to watch (${istDate})`
    : `🟢 Health Sentinel — all clear (${istDate})`;

  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  let html = `<div style="font-family:system-ui,Arial,sans-serif;font-size:14px;color:#111">`;
  html += `<h2 style="margin:0 0 4px">${subject}</h2>`;
  html += `<p style="color:#666;margin:0 0 16px">Daily fleet pre-flight across ${results.length} projects.</p>`;

  if (reds.length) {
    html += `<h3 style="color:#b91c1c">🔴 Broken — fix today</h3><ul>`;
    for (const { p, c } of reds) html += `<li><b>${esc(p)}</b> — ${esc(c.label)}: ${esc(c.detail)}</li>`;
    html += `</ul>`;
  }
  if (ambers.length) {
    html += `<h3 style="color:#b45309">🟡 Watch</h3><ul>`;
    for (const { p, c } of ambers) html += `<li><b>${esc(p)}</b> — ${esc(c.label)}: ${esc(c.detail)}</li>`;
    html += `</ul>`;
  }
  if (allGreen) html += `<p style="color:#15803d;font-weight:600">✅ Every check passed on every project.</p>`;

  html += `<h3 style="margin-top:20px">Full checklist</h3><table style="border-collapse:collapse;width:100%">`;
  for (const r of results) {
    html += `<tr><td colspan="2" style="padding:10px 6px 2px;font-weight:700;border-top:1px solid #eee">${esc(r.name)}</td></tr>`;
    for (const c of r.checks) {
      html += `<tr><td style="padding:2px 6px;white-space:nowrap">${dot(c.status)} ${esc(c.label)}</td><td style="padding:2px 6px;color:#555">${esc(c.detail)}</td></tr>`;
    }
  }
  html += `</table></div>`;
  return { subject, html };
}

async function sendEmail(subject: string, html: string) {
  // The Resend account is shared with the crm marketing engine, so a momentary
  // per-second 429 is expected; retry with backoff so the daily report never
  // silently drops (the watchman must not go silent — the whole point).
  const body = JSON.stringify({ from: FROM, to: [OPS_EMAIL], subject, html });
  let last = { s: 0, t: "" };
  for (let i = 0; i < 4; i++) {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" },
      body,
    });
    last = { s: r.status, t: await r.text() };
    if (r.status !== 429) break;
    await new Promise((res) => setTimeout(res, 1200 * (i + 1)));
  }
  return last;
}

Deno.serve(async (req) => {
  try {
    if (!token()) return new Response(JSON.stringify({ error: "MGMT_TOKEN not set" }), { status: 500 });

    // Discover the live project list (so new projects are covered automatically).
    const { s, j } = await mgmtGet("/v1/projects");
    if (s !== 200 || !Array.isArray(j)) {
      return new Response(JSON.stringify({ error: `project list failed (${s})` }), { status: 502 });
    }
    const refs: string[] = j.filter((p: any) => p.status !== "INACTIVE").map((p: any) => p.id);

    const results = [];
    for (const ref of refs) results.push(await runProject(ref));
    // Stable, friendly ordering.
    results.sort((a, b) => a.name.localeCompare(b.name));

    const istDate = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
    const { subject, html } = buildEmail(results, istDate);

    const dryRun = new URL(req.url).searchParams.get("dry") === "1";
    let emailStatus = "skipped (dry run)";
    if (!dryRun) {
      const e = await sendEmail(subject, html);
      emailStatus = `resend ${e.s}`;
    }

    const summary = results.map((r) => ({
      project: r.name,
      red: r.checks.filter((c) => c.status === "fail").length,
      amber: r.checks.filter((c) => c.status === "warn").length,
    }));
    const verbose = new URL(req.url).searchParams.get("verbose");
    const body: any = { ok: true, subject, email: emailStatus, summary };
    if (dryRun || verbose) {
      const want = verbose && verbose !== "1" ? verbose : null; // filter to one project by name
      body.detail = results
        .filter((r) => !want || r.name.includes(want))
        .map((r) => ({ project: r.name, checks: r.checks.map((c) => `${c.status === "ok" ? "OK" : c.status === "warn" ? "WARN" : "FAIL"} ${c.label}${c.status === "ok" ? "" : " — " + c.detail}`) }));
    }
    return new Response(JSON.stringify(body, null, 2), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
