import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgContext } from "@/hooks/useOrgContext";
import { useAuth } from "@/contexts/AuthProvider";
import { isProsyncIssuedDoc } from "@/utils/billingUtils";
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
      statementType = "company",
    }: {
      rows: ParsedBankRow[];
      filename: string;
      fromDate: string;
      toDate: string;
      statementType?: "company" | "director_personal";
    }) => {
      if (!effectiveOrgId) throw new Error("No org");

      // For personal statements: only import debit rows (expenses paid by Amit)
      const rowsToProcess = statementType === "director_personal"
        ? rows.filter(r => r.debit > 0)
        : rows;

      // 1. Create statement record
      const { data: stmt, error: stmtErr } = await supabase
        .from("bank_statements")
        .insert({
          org_id: effectiveOrgId,
          filename,
          from_date: fromDate,
          to_date: toDate,
          row_count: rowsToProcess.length,
          uploaded_by: user?.id,
          statement_type: statementType,
        })
        .select()
        .single();
      if (stmtErr) throw stmtErr;

      if (statementType === "director_personal") {
        // Director personal: all debits → director_expense, need manual categorization
        const { data: existing } = await supabase
          .from("bank_transactions")
          .select("transaction_date, narration, debit, credit")
          .eq("org_id", effectiveOrgId);
        const existingKeys = new Set(
          (existing || []).map(r => `${r.transaction_date}|${r.narration}|${r.debit}|${r.credit}`)
        );
        const toInsert = rowsToProcess
          .filter(r => !existingKeys.has(`${r.transaction_date}|${r.narration}|${r.debit}|${r.credit}`))
          .map(row => ({
            org_id: effectiveOrgId,
            statement_id: stmt.id,
            transaction_date: row.transaction_date,
            value_date: row.value_date || null,
            narration: row.narration,
            reference: row.reference || null,
            debit: row.debit,
            credit: 0,
            balance: row.balance,
            status: "pending" as const,
            auto_rule: "director_expense",
            suggested_invoice_id: null,
          }));
        if (toInsert.length > 0) {
          const { error: txnErr } = await supabase.from("bank_transactions").insert(toInsert);
          if (txnErr) throw txnErr;
        }
        qc.invalidateQueries({ queryKey: ["bank-transactions-pending"] });
        qc.invalidateQueries({ queryKey: ["bank-statements"] });
        return { imported: toInsert.length, skipped: rowsToProcess.length - toInsert.length, statementId: stmt.id };
      }

      // 2. Company bank: Fetch outstanding invoices for amount matching.
      // Accounting only represents Prosync's own books — older ECR-issued
      // invoices must not be auto-matched against Prosync's bank statement.
      const { data: invoicesRaw } = await supabase
        .from("billing_documents")
        .select("id, doc_number, client_name, total_amount, balance_due, seller_snapshot")
        .eq("org_id", effectiveOrgId)
        .in("status", ["issued", "sent", "partially_paid", "overdue"])
        .gt("balance_due", 0);
      const invoices = (invoicesRaw ?? []).filter(isProsyncIssuedDoc);

      const bankAccountId     = accounts.find(a => a.code === "1111")?.id;
      const loanAccountId     = accounts.find(a => a.code === "2110")?.id;
      const salaryAccountId   = accounts.find(a => a.code === "5010")?.id;
      const suspenseAccountId = accounts.find(a => a.code === "1170")?.id;
      const dueToDirectorAccId = accounts.find(a => a.code === "2241")?.id;

      // 3. Deduplicate against existing rows
      const { data: existing } = await supabase
        .from("bank_transactions")
        .select("transaction_date, narration, debit, credit")
        .eq("org_id", effectiveOrgId);

      const existingKeys = new Set(
        (existing || []).map(r => `${r.transaction_date}|${r.narration}|${r.debit}|${r.credit}`)
      );

      const toInsert = rowsToProcess
        .filter(r => !existingKeys.has(`${r.transaction_date}|${r.narration}|${r.debit}|${r.credit}`))
        .map(row => {
          const narrationUpper = row.narration.toUpperCase();
          const isAmit = narrationUpper.includes("AMIT SENGUPTA");

          let auto_rule: string | null = null;
          let status: "pending" | "suggested" = "pending";
          let suggested_invoice_id: string | null = null;

          if (isAmit && row.credit > 0) {
            auto_rule = "amit_loan";
          } else if (isAmit && row.debit > 0) {
            auto_rule = "amit_drawing";
          } else if (row.credit > 0 && invoices) {
            const match = invoices.find(inv => Math.abs(inv.balance_due - row.credit) < 1);
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

      if (toInsert.length === 0) return { imported: 0, skipped: rowsToProcess.length, statementId: stmt.id };

      const { error: txnErr } = await supabase.from("bank_transactions").insert(toInsert);
      if (txnErr) throw txnErr;

      // 4. Auto-categorize Amit rows immediately.
      if (bankAccountId && loanAccountId && suspenseAccountId) {
        const amitRows = toInsert.filter(r => r.auto_rule === "amit_loan" || r.auto_rule === "amit_drawing");
        for (const row of amitRows) {
          await createJournalEntryForAutoRule(row, bankAccountId, loanAccountId, suspenseAccountId);
        }
        // After parking drawings in suspense, settle against any outstanding Director expenses
        if (dueToDirectorAccId && effectiveOrgId) {
          await runSettlement(effectiveOrgId, suspenseAccountId, dueToDirectorAccId);
        }
      }

      qc.invalidateQueries({ queryKey: ["bank-transactions-pending"] });
      qc.invalidateQueries({ queryKey: ["bank-statements"] });

      return {
        imported: toInsert.length,
        skipped: rowsToProcess.length - toInsert.length,
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
    suspenseAccountId: string,
  ) {
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

    const narration = isLoan
      ? `Director's Loan received - ${row.narration}`
      : `Director Drawing - ${row.narration}`;

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

    const lines = isLoan
      ? [
          { entry_id: je.id, account_id: bankAccountId,     debit: amount, credit: 0,      sort_order: 0 },
          { entry_id: je.id, account_id: loanAccountId,     debit: 0,      credit: amount,  sort_order: 1 },
        ]
      : [
          // Park drawing in suspense — settled later via runSettlement / closeDirectorSalary
          { entry_id: je.id, account_id: suspenseAccountId, debit: amount, credit: 0,      sort_order: 0 },
          { entry_id: je.id, account_id: bankAccountId,     debit: 0,      credit: amount,  sort_order: 1 },
        ];

    await supabase.from("journal_entry_lines").insert(lines);
    await supabase
      .from("bank_transactions")
      .update({ status: "categorized", journal_entry_id: je.id })
      .eq("id", txn.id);
  }

  // ── Director settlement: match suspense (1170) against Due to Director (2241) ──
  async function runSettlement(orgId: string, suspenseAccId: string, dueAccId: string) {
    const [{ data: suspenseLines }, { data: dueLines }] = await Promise.all([
      supabase.from("journal_entry_lines")
        .select("debit, credit, entry:journal_entries!inner(org_id)")
        .eq("account_id", suspenseAccId)
        .eq("entry.org_id", orgId),
      supabase.from("journal_entry_lines")
        .select("debit, credit, entry:journal_entries!inner(org_id)")
        .eq("account_id", dueAccId)
        .eq("entry.org_id", orgId),
    ]);

    // Suspense is debit-normal; Due to Director is credit-normal
    const suspenseBalance = ((suspenseLines ?? []) as Array<{ debit: number; credit: number }>)
      .reduce((s, l) => s + (l.debit - l.credit), 0);
    const dueBalance = ((dueLines ?? []) as Array<{ debit: number; credit: number }>)
      .reduce((s, l) => s + (l.credit - l.debit), 0);

    const settleable = Math.min(suspenseBalance, Math.max(0, dueBalance));
    if (settleable <= 0) return;

    const today = new Date().toISOString().slice(0, 10);
    const monthLabel = new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" });

    const { data: je } = await supabase.from("journal_entries")
      .insert({
        org_id: orgId,
        entry_date: today,
        narration: `Director Expense Settlement — ${monthLabel}`,
        source: "director_settlement",
        created_by: user?.id,
      })
      .select()
      .single();
    if (!je) return;

    await supabase.from("journal_entry_lines").insert([
      { entry_id: je.id, account_id: dueAccId,       debit: settleable, credit: 0,          sort_order: 0 },
      { entry_id: je.id, account_id: suspenseAccId,   debit: 0,          credit: settleable,  sort_order: 1 },
    ]);

    qc.invalidateQueries({ queryKey: ["journal-entries"] });
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

  // ── Dismiss a transaction as "not a business expense" ──────────
  const ignoreTransaction = useMutation({
    mutationFn: async (bankTransactionId: string) => {
      const { error } = await supabase
        .from("bank_transactions")
        .update({ status: "ignored" })
        .eq("id", bankTransactionId);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["bank-transactions-pending"] });
    },
  });

  // ── Update an existing journal entry ─────────────────────────────
  const updateJournalEntry = useMutation({
    mutationFn: async ({
      id,
      entry_date,
      narration,
      reference,
      lines,
    }: {
      id: string;
      entry_date: string;
      narration: string;
      reference?: string;
      lines: Array<{ account_id: string; debit: number; credit: number; narration?: string }>;
    }) => {
      const { error: jeErr } = await supabase
        .from("journal_entries")
        .update({ entry_date, narration, reference: reference || null })
        .eq("id", id);
      if (jeErr) throw jeErr;

      const { error: delErr } = await supabase
        .from("journal_entry_lines")
        .delete()
        .eq("entry_id", id);
      if (delErr) throw delErr;

      const newLines = lines.map((l, i) => ({
        entry_id: id,
        account_id: l.account_id,
        debit: l.debit,
        credit: l.credit,
        narration: l.narration || null,
        sort_order: i,
      }));
      const { error: insertErr } = await supabase.from("journal_entry_lines").insert(newLines);
      if (insertErr) throw insertErr;

      qc.invalidateQueries({ queryKey: ["journal-entries"] });
    },
  });

  // ── Settle director drawings against expenses on demand ──────────
  const settleDirectorDrawings = useMutation({
    mutationFn: async () => {
      if (!effectiveOrgId) throw new Error("No org");
      const suspenseAccId = accounts.find(a => a.code === "1170")?.id;
      const dueAccId      = accounts.find(a => a.code === "2241")?.id;
      if (!suspenseAccId || !dueAccId) throw new Error("Accounts not loaded");
      await runSettlement(effectiveOrgId, suspenseAccId, dueAccId);
    },
  });

  // ── Month-end: close remaining suspense to salary ─────────────────
  const closeDirectorSalary = useMutation({
    mutationFn: async (monthLabel: string) => {
      if (!effectiveOrgId) throw new Error("No org");
      const suspenseAccId  = accounts.find(a => a.code === "1170")?.id;
      const dueAccId       = accounts.find(a => a.code === "2241")?.id;
      const salaryAccId    = accounts.find(a => a.code === "5010")?.id;
      if (!suspenseAccId || !salaryAccId) throw new Error("Accounts not loaded");

      // Settle any outstanding expenses first
      if (dueAccId) await runSettlement(effectiveOrgId, suspenseAccId, dueAccId);

      // Get remaining suspense balance (debit-normal)
      const { data: lines } = await supabase.from("journal_entry_lines")
        .select("debit, credit, entry:journal_entries!inner(org_id)")
        .eq("account_id", suspenseAccId)
        .eq("entry.org_id", effectiveOrgId);

      const remaining = ((lines ?? []) as Array<{ debit: number; credit: number }>)
        .reduce((s, l) => s + (l.debit - l.credit), 0);

      if (remaining <= 0) return { closed: 0 };

      const today = new Date().toISOString().slice(0, 10);
      const { data: je } = await supabase.from("journal_entries")
        .insert({
          org_id: effectiveOrgId,
          entry_date: today,
          narration: `Director Salary — ${monthLabel}`,
          source: "director_salary",
          created_by: user?.id,
        })
        .select()
        .single();
      if (!je) throw new Error("Failed to create journal entry");

      await supabase.from("journal_entry_lines").insert([
        { entry_id: je.id, account_id: salaryAccId,    debit: remaining, credit: 0,        sort_order: 0 },
        { entry_id: je.id, account_id: suspenseAccId,  debit: 0,         credit: remaining, sort_order: 1 },
      ]);

      qc.invalidateQueries({ queryKey: ["journal-entries"] });
      return { closed: remaining };
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
    ignoreTransaction,
    updateJournalEntry,
    settleDirectorDrawings,
    closeDirectorSalary,
  };
}
