-- Distinguish company bank statements from director's personal account statements
ALTER TABLE public.bank_statements
  ADD COLUMN IF NOT EXISTS statement_type text NOT NULL DEFAULT 'company'
  CHECK (statement_type IN ('company', 'director_personal'));
