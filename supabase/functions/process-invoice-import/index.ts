import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExtractedData {
  client_company?: string;
  client_name?: string;
  client_email?: string;
  client_phone?: string;
  client_address?: string;
  client_gstin?: string;
  invoice_number?: string;
  invoice_date?: string;
  due_date?: string;
  amount?: number;
  tax_amount?: number;
  total_amount?: number;
  currency?: string;
  description?: string;
  vendor_company?: string;
  fileName?: string;
  fileUrl?: string;
}

interface DuplicateMatch {
  id: string;
  type: 'client' | 'contact';
  first_name: string;
  last_name?: string;
  company?: string;
  email?: string;
  phone?: string;
  match_reason: string;
}

interface MatchRecord {
  id: string;
  first_name: string;
  last_name: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
}

function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return '';
  return phone.replace(/[\s\-().]/g, '').replace(/^\+91/, '').replace(/^0/, '');
}

function normalizeEmail(email: string | null | undefined): string {
  if (!email) return '';
  return email.toLowerCase().trim();
}

function normalizeCompany(company: string | null | undefined): string {
  if (!company) return '';
  return company.toLowerCase()
    .replace(/\b(pvt|private|ltd|limited|llp|inc|incorporated|corp|corporation)\b/gi, '')
    .replace(/[^\w\s]/g, '')
    .trim();
}

async function detectDuplicates(
  supabase: SupabaseClient,
  orgId: string,
  extractedData: ExtractedData
): Promise<{ status: 'none' | 'exact_match' | 'potential_match'; matches: DuplicateMatch[] }> {
  const matches: DuplicateMatch[] = [];
  const { client_email, client_phone, client_company } = extractedData;

  // Check exact email match in clients
  if (client_email) {
    const normalizedEmail = normalizeEmail(client_email);
    const { data: clientEmailMatches } = await supabase
      .from('clients')
      .select('id, first_name, last_name, company, email, phone')
      .eq('org_id', orgId)
      .ilike('email', normalizedEmail);

    if (clientEmailMatches && clientEmailMatches.length > 0) {
      matches.push(...(clientEmailMatches as MatchRecord[]).map((c: MatchRecord) => ({
        id: c.id,
        type: 'client' as const,
        first_name: c.first_name,
        last_name: c.last_name || undefined,
        company: c.company || undefined,
        email: c.email || undefined,
        phone: c.phone || undefined,
        match_reason: 'Exact email match'
      })));
    }

    // Check in contacts too
    const { data: contactEmailMatches } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, company, email, phone')
      .eq('org_id', orgId)
      .ilike('email', normalizedEmail);

    if (contactEmailMatches && contactEmailMatches.length > 0) {
      matches.push(...(contactEmailMatches as MatchRecord[]).map((c: MatchRecord) => ({
        id: c.id,
        type: 'contact' as const,
        first_name: c.first_name,
        last_name: c.last_name || undefined,
        company: c.company || undefined,
        email: c.email || undefined,
        phone: c.phone || undefined,
        match_reason: 'Exact email match'
      })));
    }
  }

  // Check phone match
  if (client_phone && matches.length === 0) {
    const normalizedPhone = normalizePhone(client_phone);
    if (normalizedPhone.length >= 10) {
      const phoneSuffix = normalizedPhone.slice(-10);
      
      const { data: clientPhoneMatches } = await supabase
        .from('clients')
        .select('id, first_name, last_name, company, email, phone')
        .eq('org_id', orgId)
        .ilike('phone', `%${phoneSuffix}`);

      if (clientPhoneMatches && clientPhoneMatches.length > 0) {
        matches.push(...(clientPhoneMatches as MatchRecord[]).map((c: MatchRecord) => ({
          id: c.id,
          type: 'client' as const,
          first_name: c.first_name,
          last_name: c.last_name || undefined,
          company: c.company || undefined,
          email: c.email || undefined,
          phone: c.phone || undefined,
          match_reason: 'Phone number match'
        })));
      }

      const { data: contactPhoneMatches } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, company, email, phone')
        .eq('org_id', orgId)
        .ilike('phone', `%${phoneSuffix}`);

      if (contactPhoneMatches && contactPhoneMatches.length > 0) {
        matches.push(...(contactPhoneMatches as MatchRecord[]).map((c: MatchRecord) => ({
          id: c.id,
          type: 'contact' as const,
          first_name: c.first_name,
          last_name: c.last_name || undefined,
          company: c.company || undefined,
          email: c.email || undefined,
          phone: c.phone || undefined,
          match_reason: 'Phone number match'
        })));
      }
    }
  }

  // Check company name similarity
  if (client_company && matches.length === 0) {
    const normalizedCompanyName = normalizeCompany(client_company);
    if (normalizedCompanyName.length >= 3) {
      const { data: clientCompanyMatches } = await supabase
        .from('clients')
        .select('id, first_name, last_name, company, email, phone')
        .eq('org_id', orgId)
        .not('company', 'is', null);

      const companyMatches = ((clientCompanyMatches || []) as MatchRecord[]).filter((c: MatchRecord) => {
        const existingNormalized = normalizeCompany(c.company);
        return existingNormalized.includes(normalizedCompanyName) || 
               normalizedCompanyName.includes(existingNormalized);
      });

      if (companyMatches.length > 0) {
        matches.push(...companyMatches.map((c: MatchRecord) => ({
          id: c.id,
          type: 'client' as const,
          first_name: c.first_name,
          last_name: c.last_name || undefined,
          company: c.company || undefined,
          email: c.email || undefined,
          phone: c.phone || undefined,
          match_reason: 'Similar company name'
        })));
      }

      const { data: contactCompanyMatches } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, company, email, phone')
        .eq('org_id', orgId)
        .not('company', 'is', null);

      const contactCompMatches = ((contactCompanyMatches || []) as MatchRecord[]).filter((c: MatchRecord) => {
        const existingNormalized = normalizeCompany(c.company);
        return existingNormalized.includes(normalizedCompanyName) || 
               normalizedCompanyName.includes(existingNormalized);
      });

      if (contactCompMatches.length > 0) {
        matches.push(...contactCompMatches.map((c: MatchRecord) => ({
          id: c.id,
          type: 'contact' as const,
          first_name: c.first_name,
          last_name: c.last_name || undefined,
          company: c.company || undefined,
          email: c.email || undefined,
          phone: c.phone || undefined,
          match_reason: 'Similar company name'
        })));
      }
    }
  }

  // Determine status
  if (matches.length === 0) {
    return { status: 'none', matches: [] };
  }

  const hasExactMatch = matches.some(m => 
    m.match_reason === 'Exact email match' || m.match_reason === 'Phone number match'
  );

  return {
    status: hasExactMatch ? 'exact_match' : 'potential_match',
    matches
  };
}

interface ImportItem {
  id: string;
  file_name: string;
  action: string;
  client_name: string | null;
  client_email: string | null;
  client_phone: string | null;
  client_company: string | null;
  client_address: string | null;
}

interface ClientData {
  name?: string;
  company?: string;
  email?: string;
  phone?: string;
  address?: string;
}

interface InvoiceData {
  invoice_number: string;
  invoice_date: string;
  due_date?: string | null;
  amount: number;
  tax_amount: number;
  currency: string;
  notes?: string | null;
  file_url?: string | null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single();

    if (!profile?.org_id) {
      throw new Error('User organization not found');
    }

    const body = await req.json();
    const { action, importId, itemId, extractedData, itemUpdates, totalFiles, finalAction, matchId, matchType, clientData, invoiceData } = body;
    console.log('Process invoice import called with action:', action);

    // Action: Check duplicates only (for smart upload)
    if (action === 'check_duplicates') {
      if (!extractedData) {
        throw new Error('Extracted data is required');
      }

      const duplicateResult = await detectDuplicates(supabase, profile.org_id, extractedData);

      return new Response(JSON.stringify({ 
        success: true, 
        status: duplicateResult.status,
        matches: duplicateResult.matches
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Action: Auto process single invoice (new streamlined flow)
    if (action === 'auto_process_single') {
      console.log('Auto process single invoice:', { finalAction, matchId, matchType, clientData, invoiceData });
      
      if (!invoiceData) {
        throw new Error('Invoice data is required');
      }

      let clientId: string | null = null;
      let contactId: string | null = null;

      if (finalAction === 'link_existing' && matchId) {
        // Link to existing entity
        if (matchType === 'client') {
          clientId = matchId;
          // Get the contact_id from the client
          const { data: existingClient } = await supabase
            .from('clients')
            .select('contact_id')
            .eq('id', matchId)
            .single();
          contactId = existingClient?.contact_id || null;
        } else if (matchType === 'contact') {
          contactId = matchId;
          // Check if this contact is already a client
          const { data: existingClient } = await supabase
            .from('clients')
            .select('id')
            .eq('contact_id', matchId)
            .single();
          clientId = existingClient?.id || null;
        }
        console.log('Linking to existing:', { clientId, contactId });
      } else {
        // Create new client
        const cd = clientData as ClientData;
        const nameParts = (cd?.name || 'Unknown').split(' ');
        const firstName = nameParts[0] || 'Unknown';
        const lastName = nameParts.slice(1).join(' ') || null;

        // Create contact first
        const { data: newContact, error: contactError } = await supabase
          .from('contacts')
          .insert({
            org_id: profile.org_id,
            first_name: firstName,
            last_name: lastName,
            company: cd?.company || null,
            email: cd?.email || null,
            phone: cd?.phone || null,
            address: cd?.address || null,
            source: 'Invoice Import',
            created_by: user.id
          })
          .select()
          .single();

        if (contactError) {
          console.error('Contact creation error:', contactError);
          throw contactError;
        }

        contactId = newContact.id;
        console.log('Created contact:', contactId);

        // Create client from contact
        const { data: newClient, error: clientError } = await supabase
          .from('clients')
          .insert({
            org_id: profile.org_id,
            contact_id: newContact.id,
            first_name: firstName,
            last_name: lastName,
            company: cd?.company || null,
            email: cd?.email || null,
            phone: cd?.phone || null,
            address: cd?.address || null,
            converted_by: user.id
          })
          .select()
          .single();

        if (clientError) {
          console.error('Client creation error:', clientError);
          throw clientError;
        }

        clientId = newClient.id;
        console.log('Created client:', clientId);
      }

      // Create the invoice
      const inv = invoiceData as InvoiceData;

      // Check for existing invoice with same number in this org
      const { data: existingInvoice } = await supabase
        .from('client_invoices')
        .select('id, invoice_number')
        .eq('org_id', profile.org_id)
        .eq('invoice_number', inv.invoice_number)
        .maybeSingle();

      if (existingInvoice) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: `Invoice number "${inv.invoice_number}" already exists. Please use a different invoice number.`,
          errorType: 'duplicate_invoice'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: invoice, error: invoiceError } = await supabase
        .from('client_invoices')
        .insert({
          org_id: profile.org_id,
          invoice_number: inv.invoice_number,
          invoice_date: inv.invoice_date,
          due_date: inv.due_date || null,
          amount: inv.amount || 0,
          tax_amount: inv.tax_amount || 0,
          currency: inv.currency || 'INR',
          status: 'draft',
          notes: inv.notes || null,
          file_url: inv.file_url || null,
          document_type: 'invoice',
          client_id: clientId,
          contact_id: contactId,
          created_by: user.id
        })
        .select()
        .single();

      if (invoiceError) {
        console.error('Invoice creation error:', invoiceError);
        // Handle unique constraint violation
        if (invoiceError.code === '23505' || invoiceError.message?.includes('unique') || invoiceError.message?.includes('duplicate')) {
          return new Response(JSON.stringify({ 
            success: false, 
            error: `Invoice number "${inv.invoice_number}" already exists. Please use a different invoice number.`,
            errorType: 'duplicate_invoice'
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        throw invoiceError;
      }

      console.log('Created invoice:', invoice.id);

      return new Response(JSON.stringify({ 
        success: true, 
        invoice,
        clientId,
        contactId,
        action: finalAction
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Action: Create import session
    if (action === 'create_import') {
      const { data: importSession, error: importError } = await supabase
        .from('invoice_imports')
        .insert({
          org_id: profile.org_id,
          created_by: user.id,
          total_files: totalFiles || 0,
          status: 'processing'
        })
        .select()
        .single();

      if (importError) throw importError;

      return new Response(JSON.stringify({ 
        success: true, 
        import: importSession 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Action: Process extracted data and detect duplicates
    if (action === 'process_extraction') {
      if (!importId || !extractedData) {
        throw new Error('Import ID and extracted data are required');
      }

      const duplicateResult = await detectDuplicates(supabase, profile.org_id, extractedData);

      const itemData = {
        import_id: importId,
        org_id: profile.org_id,
        file_name: extractedData.fileName || 'Unknown',
        file_url: extractedData.fileUrl,
        extracted_data: extractedData,
        client_name: extractedData.client_name,
        client_email: extractedData.client_email,
        client_phone: extractedData.client_phone,
        client_company: extractedData.client_company,
        client_address: extractedData.client_address,
        invoice_number: extractedData.invoice_number,
        invoice_date: extractedData.invoice_date,
        due_date: extractedData.due_date,
        amount: extractedData.amount,
        tax_amount: extractedData.tax_amount,
        currency: extractedData.currency || 'INR',
        duplicate_status: duplicateResult.status,
        potential_matches: duplicateResult.matches.length > 0 ? duplicateResult.matches : null,
        matched_client_id: duplicateResult.matches.find(m => m.type === 'client')?.id || null,
        matched_contact_id: duplicateResult.matches.find(m => m.type === 'contact')?.id || null,
        status: 'extracted'
      };

      const { data: item, error: itemError } = await supabase
        .from('invoice_import_items')
        .insert(itemData)
        .select()
        .single();

      if (itemError) throw itemError;

      // Update processed count
      const { data: currentImport } = await supabase
        .from('invoice_imports')
        .select('processed_files')
        .eq('id', importId)
        .single();
      
      if (currentImport) {
        await supabase
          .from('invoice_imports')
          .update({ processed_files: (currentImport.processed_files || 0) + 1 })
          .eq('id', importId);
      }

      return new Response(JSON.stringify({ 
        success: true, 
        item 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Action: Update item (user review)
    if (action === 'update_item') {
      if (!itemId || !itemUpdates) {
        throw new Error('Item ID and updates are required');
      }

      const { data: item, error: updateError } = await supabase
        .from('invoice_import_items')
        .update({
          ...itemUpdates,
          status: 'reviewed',
          updated_at: new Date().toISOString()
        })
        .eq('id', itemId)
        .eq('org_id', profile.org_id)
        .select()
        .single();

      if (updateError) throw updateError;

      return new Response(JSON.stringify({ 
        success: true, 
        item 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Action: Process items (create clients/leads)
    if (action === 'process_items') {
      if (!importId) {
        throw new Error('Import ID is required');
      }

      const { data: items, error: fetchError } = await supabase
        .from('invoice_import_items')
        .select('*')
        .eq('import_id', importId)
        .eq('org_id', profile.org_id)
        .in('action', ['create_client', 'create_lead', 'link_existing']);

      if (fetchError) throw fetchError;

      const results = {
        clients_created: 0,
        leads_created: 0,
        linked: 0,
        skipped: 0,
        errors: [] as string[]
      };

      for (const item of (items || []) as ImportItem[]) {
        try {
          if (item.action === 'create_client') {
            // First create a contact
            const nameParts = (item.client_name || 'Unknown').split(' ');
            const firstName = nameParts[0] || 'Unknown';
            const lastName = nameParts.slice(1).join(' ') || null;

            const { data: contact, error: contactError } = await supabase
              .from('contacts')
              .insert({
                org_id: profile.org_id,
                first_name: firstName,
                last_name: lastName,
                company: item.client_company,
                email: item.client_email,
                phone: item.client_phone,
                address: item.client_address,
                source: 'Invoice Import',
                created_by: user.id
              })
              .select()
              .single();

            if (contactError) throw contactError;

            // Create client from contact
            const { data: client, error: clientError } = await supabase
              .from('clients')
              .insert({
                org_id: profile.org_id,
                contact_id: contact.id,
                first_name: firstName,
                last_name: lastName,
                company: item.client_company,
                email: item.client_email,
                phone: item.client_phone,
                address: item.client_address,
                converted_by: user.id
              })
              .select()
              .single();

            if (clientError) throw clientError;

            await supabase
              .from('invoice_import_items')
              .update({ 
                created_client_id: client.id, 
                created_contact_id: contact.id,
                status: 'processed' 
              })
              .eq('id', item.id);

            results.clients_created++;

          } else if (item.action === 'create_lead') {
            const nameParts = (item.client_name || 'Unknown').split(' ');
            const firstName = nameParts[0] || 'Unknown';
            const lastName = nameParts.slice(1).join(' ') || null;

            const { data: contact, error: contactError } = await supabase
              .from('contacts')
              .insert({
                org_id: profile.org_id,
                first_name: firstName,
                last_name: lastName,
                company: item.client_company,
                email: item.client_email,
                phone: item.client_phone,
                address: item.client_address,
                source: 'Invoice Import',
                created_by: user.id
              })
              .select()
              .single();

            if (contactError) throw contactError;

            await supabase
              .from('invoice_import_items')
              .update({ 
                created_contact_id: contact.id,
                status: 'processed' 
              })
              .eq('id', item.id);

            results.leads_created++;

          } else if (item.action === 'link_existing') {
            await supabase
              .from('invoice_import_items')
              .update({ status: 'processed' })
              .eq('id', item.id);

            results.linked++;
          }
        } catch (error) {
          console.error('Error processing item:', item.id, error);
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          results.errors.push(`Failed to process ${item.file_name}: ${errorMessage}`);
        }
      }

      // Update import status
      await supabase
        .from('invoice_imports')
        .update({ 
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', importId);

      return new Response(JSON.stringify({ 
        success: true, 
        results 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    throw new Error('Invalid action');

  } catch (error) {
    console.error('Error in process-invoice-import:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ 
      success: false, 
      error: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
