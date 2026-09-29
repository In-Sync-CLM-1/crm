-- Allow Amit's personal credit-card statements as a third statement type.
ALTER TABLE public.bank_statements DROP CONSTRAINT IF EXISTS bank_statements_statement_type_check;
ALTER TABLE public.bank_statements
  ADD CONSTRAINT bank_statements_statement_type_check
  CHECK (statement_type IN ('company', 'director_personal', 'director_card'));
