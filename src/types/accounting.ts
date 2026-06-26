export type AccountType = 'asset' | 'liability' | 'equity' | 'income' | 'expense';
export type NormalBalance = 'debit' | 'credit';
export type TransactionStatus = 'pending' | 'suggested' | 'categorized';
export type JournalSource = 'bank_import' | 'manual' | 'system_interest' | 'director_settlement' | 'director_salary' | 'invoice' | 'credit_note';

export interface ChartOfAccount {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  sub_type: string;
  normal_balance: NormalBalance;
  is_bank_account: boolean;
  is_system: boolean;
  parent_code: string | null;
  is_active: boolean;
  org_id: string | null;
}

export interface BankStatement {
  id: string;
  org_id: string;
  bank_name: string;
  account_number: string | null;
  from_date: string | null;
  to_date: string | null;
  filename: string | null;
  row_count: number;
  uploaded_at: string;
}

export interface BankTransaction {
  id: string;
  org_id: string;
  statement_id: string;
  transaction_date: string;
  value_date: string | null;
  narration: string;
  reference: string | null;
  debit: number;
  credit: number;
  balance: number | null;
  status: TransactionStatus;
  journal_entry_id: string | null;
  auto_rule: string | null;
  suggested_invoice_id: string | null;
  created_at: string;
  // joined
  statement?: BankStatement;
  suggested_invoice?: {
    id: string;
    doc_number: string;
    client_name: string;
    total_amount: number;
    balance_due: number;
  };
}

export interface JournalEntry {
  id: string;
  org_id: string;
  entry_date: string;
  reference: string | null;
  narration: string;
  source: JournalSource;
  bank_transaction_id: string | null;
  billing_document_id: string | null;
  invoice_url: string | null;
  invoice_party: string | null;
  invoice_date: string | null;
  invoice_description: string | null;
  invoice_amount: number | null;
  created_at: string;
  lines?: JournalEntryLine[];
}

export interface JournalEntryLine {
  id: string;
  entry_id: string;
  account_id: string;
  debit: number;
  credit: number;
  narration: string | null;
  sort_order: number;
  // joined
  account?: ChartOfAccount;
}

// Used when creating a new journal entry from the review queue
export interface NewJournalEntry {
  entry_date: string;
  narration: string;
  source: JournalSource;
  bank_transaction_id?: string;
  billing_document_id?: string;
  invoice_url?: string;
  lines: Array<{
    account_id: string;
    debit: number;
    credit: number;
    narration?: string;
  }>;
}

// Parsed row from CSV before insert
export interface ParsedBankRow {
  transaction_date: string;
  value_date: string;
  narration: string;
  reference: string;
  debit: number;
  credit: number;
  balance: number | null;
}

// Trial balance row
export interface TrialBalanceRow {
  account_id: string;
  code: string;
  name: string;
  type: AccountType;
  sub_type: string;
  total_debit: number;
  total_credit: number;
  balance: number; // debit accounts: Dr-Cr, credit accounts: Cr-Dr
}

// Ledger row (with running balance)
export interface LedgerRow {
  entry_id: string;
  entry_date: string;
  narration: string;
  reference: string | null;
  source: JournalSource;
  debit: number;
  credit: number;
  running_balance: number;
  invoice_url: string | null;
}
