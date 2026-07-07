// Monthly close: treat any drawings the director took that are still sitting
// in suspense (1170) as-of month-end as Director Salary, once any recorded
// director expenses (Due to Director — 2241) have been netted off first.
//
// Step 1 — settle: Debit Due to Director / Credit Suspense, for whatever
//   Suspense can cover against recorded expenses (mirrors the manual
//   "Settle against Director Expenses" action).
// Step 2 — close: whatever remains in Suspense becomes salary —
//   Debit Director Salary (5010) / Credit Suspense (1170).
//
// Idempotent per org+month via a unique reference (SAL-YYYY-MM); recomputes
// from the ledger each run rather than a flag, so a partial prior failure
// can't double-count.

import { getSupabaseClient } from '../_shared/supabaseClient.ts';

type Line = { debit: number; credit: number };

async function settleAgainstDueToDirector(
  sb: ReturnType<typeof getSupabaseClient>,
  orgId: string,
  suspenseAccId: string,
  dueAccId: string,
  periodEnd: string,
  monthLabel: string,
): Promise<number> {
  const [{ data: suspenseLines }, { data: dueLines }] = await Promise.all([
    sb.from("journal_entry_lines")
      .select("debit, credit, entry:journal_entries!inner(org_id, entry_date)")
      .eq("account_id", suspenseAccId)
      .lte("entry.entry_date", periodEnd)
      .eq("entry.org_id", orgId),
    sb.from("journal_entry_lines")
      .select("debit, credit, entry:journal_entries!inner(org_id, entry_date)")
      .eq("account_id", dueAccId)
      .lte("entry.entry_date", periodEnd)
      .eq("entry.org_id", orgId),
  ]);

  const suspenseBalance = ((suspenseLines ?? []) as Line[]).reduce((s, l) => s + (l.debit - l.credit), 0);
  const dueBalance = ((dueLines ?? []) as Line[]).reduce((s, l) => s + (l.credit - l.debit), 0);

  const settleable = Math.round(Math.min(suspenseBalance, Math.max(0, dueBalance)) * 100) / 100;
  if (settleable <= 0) return 0;

  const { data: je } = await sb.from("journal_entries")
    .insert({
      org_id: orgId,
      entry_date: periodEnd,
      narration: `Director Expense Settlement — ${monthLabel}`,
      source: "director_settlement",
    })
    .select()
    .single();
  if (!je) return 0;

  await sb.from("journal_entry_lines").insert([
    { entry_id: je.id, account_id: dueAccId,      debit: settleable, credit: 0,          sort_order: 0 },
    { entry_id: je.id, account_id: suspenseAccId, debit: 0,           credit: settleable, sort_order: 1 },
  ]);

  return settleable;
}

Deno.serve(async () => {
  const sb = getSupabaseClient();

  const { data: orgs } = await sb.from("organizations").select("id");
  if (!orgs?.length) return new Response("no orgs\n");

  // Close the last full calendar month, same convention as accounting-interest-accrual.
  const now   = new Date();
  const year  = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const month = now.getMonth() === 0 ? 12 : now.getMonth(); // 1-12
  const lastDayOfMonth = new Date(year, month, 0).getDate();
  const periodEnd   = `${year}-${String(month).padStart(2, "0")}-${String(lastDayOfMonth).padStart(2, "0")}`;
  const periodLabel = `${year}-${String(month).padStart(2, "0")}`;
  const monthLabel  = new Date(year, month - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  const results: string[] = [];

  for (const { id: orgId } of orgs) {
    const { data: existing } = await sb
      .from("journal_entries")
      .select("id")
      .eq("org_id", orgId)
      .eq("source", "director_salary")
      .ilike("reference", `SAL-${periodLabel}%`)
      .maybeSingle();

    if (existing) {
      results.push(`${orgId}: already closed for ${periodLabel}`);
      continue;
    }

    const { data: accts } = await sb
      .from("chart_of_accounts")
      .select("id, code")
      .in("code", ["1170", "2241", "5010"])
      .or(`org_id.eq.${orgId},org_id.is.null`);

    const byCode = Object.fromEntries((accts ?? []).map((a: { code: string; id: string }) => [a.code, a.id]));
    const suspenseAccId = byCode["1170"];
    const dueAccId      = byCode["2241"];
    const salaryAccId   = byCode["5010"];

    if (!suspenseAccId || !salaryAccId) {
      results.push(`${orgId}: skipped (accounts not found)`);
      continue;
    }

    if (dueAccId) {
      const settled = await settleAgainstDueToDirector(sb, orgId, suspenseAccId, dueAccId, periodEnd, monthLabel);
      if (settled > 0) results.push(`${orgId}: settled ₹${settled} against Due to Director`);
    }

    const { data: lines } = await sb
      .from("journal_entry_lines")
      .select("debit, credit, entry:journal_entries!inner(org_id, entry_date)")
      .eq("account_id", suspenseAccId)
      .lte("entry.entry_date", periodEnd)
      .eq("entry.org_id", orgId);

    const remaining = Math.round(
      ((lines ?? []) as Line[]).reduce((s, l) => s + (l.debit - l.credit), 0) * 100
    ) / 100;

    if (remaining <= 0) {
      results.push(`${orgId}: no drawings to close for ${periodLabel}`);
      continue;
    }

    const { data: je, error: jeErr } = await sb
      .from("journal_entries")
      .insert({
        org_id: orgId,
        entry_date: periodEnd,
        reference: `SAL-${periodLabel}`,
        narration: `Director Salary — ${monthLabel}`,
        source: "director_salary",
      })
      .select()
      .single();

    if (jeErr || !je) {
      results.push(`${orgId}: failed — ${jeErr?.message}`);
      continue;
    }

    await sb.from("journal_entry_lines").insert([
      { entry_id: je.id, account_id: salaryAccId,   debit: remaining, credit: 0,         sort_order: 0 },
      { entry_id: je.id, account_id: suspenseAccId, debit: 0,          credit: remaining, sort_order: 1 },
    ]);

    results.push(`${orgId}: closed ₹${remaining} as Director Salary for ${periodLabel}`);
  }

  return new Response(results.join("\n") + "\n");
});
