// Monthly interest accrual on Director's Loan from Amit Sengupta.
// Rate: 8% p.a. → 8/12 % per month on the closing principal balance.
// Journal entry: Debit Interest on Director's Loan (5080)
//                Credit Accrued Interest — Director's Loan (2111)
// Idempotent: skips months where a system_interest entry already exists.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANNUAL_RATE  = 0.08;

Deno.serve(async () => {
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  // Fetch all orgs
  const { data: orgs } = await sb.from("organizations").select("id");
  if (!orgs?.length) return new Response("no orgs\n");

  const results: string[] = [];

  for (const { id: orgId } of orgs) {
    // Find account IDs by code
    const { data: accts } = await sb
      .from("chart_of_accounts")
      .select("id, code")
      .in("code", ["2110", "2111", "5080"])
      .or(`org_id.eq.${orgId},org_id.is.null`);

    const byCode = Object.fromEntries((accts ?? []).map(a => [a.code, a.id]));
    const loanAccId     = byCode["2110"];
    const accruedAccId  = byCode["2111"];
    const interestExpId = byCode["5080"];

    if (!loanAccId || !accruedAccId || !interestExpId) {
      results.push(`${orgId}: skipped (accounts not found)`);
      continue;
    }

    // Compute last full month
    const now   = new Date();
    const year  = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    const month = now.getMonth() === 0 ? 12 : now.getMonth(); // 1-12
    const lastDayOfMonth = new Date(year, month, 0).getDate();
    const periodEnd   = `${year}-${String(month).padStart(2,"0")}-${String(lastDayOfMonth).padStart(2,"0")}`;
    const periodLabel = `${year}-${String(month).padStart(2,"0")}`;

    // Check if already accrued for this month
    const { data: existing } = await sb
      .from("journal_entries")
      .select("id")
      .eq("org_id", orgId)
      .eq("source", "system_interest")
      .ilike("reference", `INT-${periodLabel}%`)
      .maybeSingle();

    if (existing) {
      results.push(`${orgId}: already accrued for ${periodLabel}`);
      continue;
    }

    // Get running balance of Loan from Director account up to period end
    const { data: lines } = await sb
      .from("journal_entry_lines")
      .select("debit, credit, entry:journal_entries!inner(org_id, entry_date)")
      .eq("account_id", loanAccId)
      .lte("entry.entry_date", periodEnd)
      .eq("entry.org_id", orgId);

    const loanBalance = (lines ?? []).reduce((sum, l) => {
      // Loan is credit-normal: balance = credits - debits
      return sum + (l.credit - l.debit);
    }, 0);

    if (loanBalance <= 0) {
      results.push(`${orgId}: no loan balance, skipping`);
      continue;
    }

    const interestAmount = parseFloat(((loanBalance * ANNUAL_RATE) / 12).toFixed(2));

    // Create journal entry
    const { data: je, error: jeErr } = await sb
      .from("journal_entries")
      .insert({
        org_id:     orgId,
        entry_date: periodEnd,
        reference:  `INT-${periodLabel}`,
        narration:  `Interest on Director's Loan @ 8% p.a. for ${periodLabel} (principal ₹${loanBalance.toLocaleString("en-IN")})`,
        source:     "system_interest",
      })
      .select()
      .single();

    if (jeErr || !je) {
      results.push(`${orgId}: failed to create entry — ${jeErr?.message}`);
      continue;
    }

    await sb.from("journal_entry_lines").insert([
      { entry_id: je.id, account_id: interestExpId, debit: interestAmount, credit: 0,              sort_order: 0 },
      { entry_id: je.id, account_id: accruedAccId,  debit: 0,              credit: interestAmount, sort_order: 1 },
    ]);

    results.push(`${orgId}: accrued ₹${interestAmount} for ${periodLabel} on loan balance ₹${loanBalance}`);
  }

  return new Response(results.join("\n") + "\n");
});
