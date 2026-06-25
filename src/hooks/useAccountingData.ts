import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgContext } from "@/hooks/useOrgContext";
import { useAuth } from "@/contexts/AuthProvider";
import type {
  ChartOfAccount, BankStatement, BankTransaction,
  JournalEntry, NewJournalEntry, ParsedBankRow,
} from "@/types/accounting";

export function useAccountingData() {
  const { effectiveOrgId } = useOrgContext();
  const { user } = useAuth();
  const qc = useQueryClient();

  // ── Chart of Accounts ─────────────────────────────────────────
  const { data: accounts = [], isLoading: accountsLoading } = useQuery<ChartOfAccount[]>({
    queryKey: ["coa"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chart_of_accounts")
        .select("*")
        .eq("is_active", true)
        .order("code");
      if (error) throw error;
      return (data || []) as ChartOfAccount[];
    },
    staleTime: 10 * 60 * 1000,
  });

  const accountByCode = (code: string) => accounts.find(a => a.code === code);
  const leafAccounts = accounts.filter(a => !accounts.some(b => b.parent_code === a.code));

  // ── Bank Statements ────────────────────────────────────────────
  const { data: statements = [], isLoading: statementsLoading } = useQuery<BankStatement[]>({
    queryKey: ["bank-statements", effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) return [];
      const { data, error } = await supabase
        .from("bank_statements")
        .select("*")
        .eq("org_id", effectiveOrgId)
        .order("uploaded_at", { ascending: false });
      if (error) throw error;
      return (data || []) as BankStatement[];
    },
    enabled: !!effectiveOrgId,
  });

  // ── Pending (review queue) transactions ───────────────────────
  const { data: pendingTransactions = [], isLoading: pendingLoading } = useQuery<BankTransaction[]>({
    queryKey: ["bank-transactions-pending", effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) return [];
      const { data, error } = await supabase
        .from("bank_transactions")
        .select(`
          *,
          suggested_invoice:billing_documents!suggested_invoice_id(
            id, doc_number, client_name, total_amount, balance_due
          )
        `)
        .eq("org_id", effectiveOrgId)
        .in("status", ["pending", "suggested"])
        .order("transaction_date", { ascending: true });
      if (error) throw error;
      return (data || []) as BankTransaction[];
    },
    enabled: !!effectiveOrgId,
  });

  // ── All transactions (for ledger / reports) ───────────────────
  const useTransactions = (from?: string, to?: string) =>
    useQuery<BankTransaction[]>({
      queryKey: ["bank-transactions-all", effectiveOrgId, from, to],
      queryFn: async () => {
        if (!effectiveOrgId) return [];
        let q = supabase
          .from("bank_transactions")
          .select("*, statement:bank_statements(bank_name, account_number)")
          .eq("org_id", effectiveOrgId)
          .order("transaction_date", { ascending: false });
        if (from) q = q.gte("transaction_date", from);
        if (to)   q = q.lte("transaction_date", to);
        const { data, error } = await q;
        if (error) throw error;
        return (data || []) as BankTransaction[];
      },
      enabled: !!effectiveOrgId,
    });

  // ── Journal entries with lines ────────────────────────────────
  const useJournalEntries = (from?: string, to?: string) =>
    useQuery<JournalEntry[]>({
      queryKey: ["journal-entries", effectiveOrgId, from, to],
      queryFn: async () => {
        if (!effectiveOrgId) return [];
        let q = supabase
          .from("journal_entries")
          .select(`
            *,
            lines:journal_entry_lines(
              *, account:chart_of_accounts(*)
            )
          `)
          .eq("org_id", effectiveOrgId)
          .order("entry_date", { ascending: false });
        if (from) q = q.gte("entry_date", from);
        if (to)   q = q.lte("entry_date", to);
        const { data, error } = await q;
        if (error) throw error;
        return (data || []) as JournalEntry[];
      },
      enabled: !!effectiveOrgId,
    });

  // ── Import CSV ────────────────────────────────────────────────
  const importStatement = useMutation({
    mutationFn: async ({
      rows,
      filename,
      fromDate,
      toDate,
    }: {
      rows: ParsedBankRow[];
      filename: string;
      fromDate: string;
      toDate: string;
    }) => {
      if (!effectiveOrgId) throw new Error("No org");

      // 1. Create statement record
      const { data: stmt, error: stmtErr } = await supabase
        .from("bank_statements")
        .insert({
          org_id: effectiveOrgId,
          filename,
          from_date: fromDate,
          to_date: toDate,
          row_count: rows.length,
          uploaded_by: user?.id,
        })
        .select()
        .single();
      if (stmtErr) throw stmtErr;

      // 2. Fetch outstanding invoices for amount matching
      const { data: invoices } = await supabase
        .from("billing_documents")
        .select("id, doc_number, client_name, total_amount, balance_due")
        .eq("org_id", effectiveOrgId)
        .in("status", ["issued", "sent", "partially_paid", "overdue"])
        .gt("balance_due", 0);

      const bankAccountId = accounts.find(a => a.code === "1111")?.id;
      const loanAccountId = accounts.find(a => a.code === "2110")?.id;
      const salaryAccountId = accounts.find(a => a.code === "5010")?.id;

      // 3. Deduplicate against existing rows
      const { data: existing } = await supabase
        .from("bank_transactions")
        .select("transaction_date, narration, debit, credit")
        .eq("org_id", effectiveOrgId);

      const existingKeys = new Set(
        (existing || []).map(r => `${r.transaction_date}|${r.narration}|${r.debit}|${r.credit}`)
      );

      const toInsert = rows
        .filter(r => !existingKeys.has(`${r.transaction_date}|${r.narration}|${r.debit}|${r.credit}`))
        .map(row => {
          const narrationUpper = row.narration.toUpperCase();
          const isAmit = narrationUpper.includes("AMIT SENGUPTA");

          // Auto-rule detection
          let auto_rule: string | null = null;
          let status: "pending" | "suggested" = "pending";
          let suggested_invoice_id: string | null = null;

          if (isAmit && row.credit > 0) {
            auto_rule = "amit_loan";
          } else if (isAmit && row.debit > 0) {
            auto_rule = "amit_salary";
          } else if (row.credit > 0 && invoices) {
            // Look for an invoice amount match (exact or within ₹1 rounding)
            const match = invoices.find(
              inv => Math.abs(inv.balance_due - row.credit) < 1
            );
            if (match) {
              auto_rule = "invoice_match";
              status = "suggested";
              suggested_invoice_id = match.id;
            }
          }

          return {
            org_id: effectiveOrgId,
            statement_id: stmt.id,
            transaction_date: row.transaction_date,
            value_date: row.value_date || null,
            narration: row.narration,
            reference: row.reference || null,
            debit: row.debit,
            credit: row.credit,
            balance: row.balance,
            status,
            auto_rule,
            suggested_invoice_id,
          };
        });

      if (toInsert.length === 0) return { imported: 0, skipped: rows.length, statementId: stmt.id };

      const { error: txnErr } = await supabase
        .from("bank_transactions")
        .insert(toInsert);
      if (txnErr) throw txnErr;

      // 4. Auto-categorize Amit rows immediately.
      //    Credit → Director's Loan (auto-posted).
      //    Debit  → settle Due to Director balance first, rest is Salary.
      if (bankAccountId && loanAccountId && salaryAccountId) {
        const amitRows = toInsert.filter(r => r.auto_rule === "amit_loan" || r.auto_rule === "amit_salary");
        for (const row of amitRows) {
          await createJournalEntryForAutoRule(row, bankAccountId, loanAccountId, salaryAccountId);
        }
      }

      qc.invalidateQueries({ queryKey: ["bank-transactions-pending"] });
      qc.invalidateQueries({ queryKey: ["bank-statements"] });

      return {
        imported: toInsert.length,
        skipped: rows.length - toInsert.length,
        statementId: stmt.id,
      };
    },
  });

  async function createJournalEntryForAutoRule(
    row: {
      org_id: string;
      statement_id: string;
      transaction_date: string;
      narration: string;
      debit: number;
      credit: number;
      auto_rule: string | null;
    },
    bankAccountId: string,
    loanAccountId: string,
    salaryAccountId: string,
  ) {
    // Fetch the just-inserted bank_transaction id
    const { data: txn } = await supabase
      .from("bank_transactions")
      .select("id")
      .eq("org_id", row.org_id)
      .eq("statement_id", row.statement_id)
      .eq("transaction_date", row.transaction_date)
      .eq("narration", row.narration)
      .eq("debit", row.debit)
      .eq("credit", row.credit)
      .maybeSingle();
    if (!txn) return;

    const isLoan = row.auto_rule === "amit_loan";
    const amount = isLoan ? row.credit : row.debit;

    // For Amit debits: settle outstanding Due to Director balance first, rest is salary
    let settleAmount = 0;
    let salaryAmount = amount;

    if (!isLoan) {
      const dueToDirectorId = (await supabase
        .from("chart_of_accounts")
        .select("id")
        .eq("code", "2241")
        .or(`org_id.eq.${row.org_id},org_id.is.null`)
        .maybeSingle()
      ).data?.id;

      if (dueToDirectorId) {
        // Compute outstanding Due to Director balance (credit-normal)
        const { data: dueLines } = await supabase
          .from("journal_entry_lines")
          .select("debit, credit, entry:journal_entries!inner(org_id)")
          .eq("account_id", dueToDirectorId)
          .eq("entry.org_id", row.org_id);

        const dueBalance = ((dueLines ?? []) as Array<{ debit: number; credit: number }>)
          .reduce((s, l) => s + (l.credit - l.debit), 0);

        settleAmount = Math.min(amount, Math.max(0, dueBalance));
        salaryAmount = amount - settleAmount;
      }
    }

    const narration = isLoan
      ? `Director's Loan received - ${row.narration}`
      : settleAmount > 0 && salaryAmount > 0
        ? `Reimbursement (₹${settleAmount.toLocaleString("en-IN")}) + Salary (₹${salaryAmount.toLocaleString("en-IN")}) - ${row.narration}`
        : settleAmount > 0
          ? `Reimbursement to Amit Sengupta - ${row.narration}`
          : `Salary paid - ${row.narration}`;

    const { data: je, error: jeErr } = await supabase
      .from("journal_entries")
      .insert({
        org_id: row.org_id,
        entry_date: row.transaction_date,
        narration,
        source: "bank_import",
        bank_transaction_id: txn.id,
        created_by: user?.id,
      })
      .select()
      .single();
    if (jeErr || !je) return;

    let lines: Array<{ entry_id: string; account_id: string; debit: number; credit: number; sort_order: number }>;

    if (isLoan) {
      lines = [
        { entry_id: je.id, account_id: bankAccountId, debit: amount,  credit: 0,      sort_order: 0 },
        { entry_id: je.id, account_id: loanAccountId, debit: 0,       credit: amount,  sort_order: 1 },
      ];
    } else {
      // Build debit legs: settle Due to Director first, then salary for the rest
      const debitLegs: Array<{ entry_id: string; account_id: string; debit: number; credit: number; sort_order: number }> = [];
      let order = 0;

      if (settleAmount > 0) {
        const dueAccId = (await supabase
          .from("chart_of_accounts").select("id").eq("code", "2241")
          .or(`org_id.eq.${row.org_id},org_id.is.null`).maybeSingle()
        ).data?.id;
        if (dueAccId) {
          debitLegs.push({ entry_id: je.id, account_id: dueAccId, debit: settleAmount, credit: 0, sort_order: order++ });
        } else {
          salaryAmount += settleAmount; // fallback: treat all as salary
        }
      }
      if (salaryAmount > 0) {
        debitLegs.push({ entry_id: je.id, account_id: salaryAccountId, debit: salaryAmount, credit: 0, sort_order: order++ });
      }
      debitLegs.push({ entry_id: je.id, account_id: bankAccountId, debit: 0, credit: amount, sort_order: order });
      lines = debitLegs;
    }

    await supabase.from("journal_entry_lines").insert(lines);
    await supabase
      .from("bank_transactions")
      .update({ status: "categorized", journal_entry_id: je.id })
      .eq("id", txn.id);
  }

  // ── Categorize a single transaction (or record a manual entry) ─
  const categorize = useMutation({
    mutationFn: async (entry: NewJournalEntry & { bank_transaction_id?: string }) => {
      if (!effectiveOrgId) throw new Error("No org");

      const { data: je, error: jeErr } = await supabase
        .from("journal_entries")
        .insert({
          org_id: effectiveOrgId,
          entry_date: entry.entry_date,
          narration: entry.narration,
          source: entry.source,
          bank_transaction_id: entry.bank_transaction_id || null,
          billing_document_id: entry.billing_document_id || null,
          invoice_url: entry.invoice_url || null,
          created_by: user?.id,
        })
        .select()
        .single();
      if (jeErr) throw jeErr;

      const lines = entry.lines.map((l, i) => ({
        entry_id: je.id,
        account_id: l.account_id,
        debit: l.debit,
        credit: l.credit,
        narration: l.narration || null,
        sort_order: i,
      }));
      const { error: lineErr } = await supabase.from("journal_entry_lines").insert(lines);
      if (lineErr) throw lineErr;

      if (entry.bank_transaction_id) {
        await supabase
          .from("bank_transactions")
          .update({ status: "categorized", journal_entry_id: je.id })
          .eq("id", entry.bank_transaction_id);
      }

      qc.invalidateQueries({ queryKey: ["bank-transactions-pending"] });
      qc.invalidateQueries({ queryKey: ["journal-entries"] });
      return je;
    },
  });

  return {
    accounts,
    accountByCode,
    leafAccounts,
    accountsLoading,
    statements,
    statementsLoading,
    pendingTransactions,
    pendingLoading,
    useTransactions,
    useJournalEntries,
    importStatement,
    categorize,
  };
}
