-- Clients could previously only be created by "converting" a Won contact from
-- the Pipeline. The general Contacts/Pipeline module is being removed (crm's
-- scope is narrowing to marketing + health sentinel + billing/accounting +
-- tickets), so clients needs a standalone add path. contact_id becomes optional
-- to allow a client created directly, with no originating contact.
ALTER TABLE public.clients ALTER COLUMN contact_id DROP NOT NULL;
