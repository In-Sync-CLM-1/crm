-- Move the Vendorsync product key from 'vendorverification' to 'vendorsync'.
-- Templates and scripts are found by the "<product_key>-" name prefix, so the
-- key, the display name and the template names have to change together.
-- URLs, the Supabase project and WhatsApp template_name (registered with Meta)
-- keep their old spelling. Idempotent.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT table_name, column_name FROM information_schema.columns
           WHERE table_schema = 'public'
             AND column_name IN ('product_key', 'source_product_key', 'target_product_key')
             AND table_name IN (SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE')
  LOOP
    EXECUTE format('UPDATE public.%I SET %I = %L WHERE %I = %L', r.table_name, r.column_name, 'vendorsync', r.column_name, 'vendorverification');
  END LOOP;
END $$;

UPDATE public.mkt_products SET product_name = 'Vendorsync' WHERE product_name = 'Vendorverification';
UPDATE public.mkt_email_templates    SET name = regexp_replace(name, '^vendorverification-', 'vendorsync-') WHERE name LIKE 'vendorverification-%';
UPDATE public.mkt_whatsapp_templates SET name = regexp_replace(name, '^vendorverification-', 'vendorsync-') WHERE name LIKE 'vendorverification-%';
UPDATE public.mkt_call_scripts       SET name = regexp_replace(name, '^vendorverification-', 'vendorsync-') WHERE name LIKE 'vendorverification-%';
