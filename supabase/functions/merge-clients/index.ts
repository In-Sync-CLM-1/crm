import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

    const { primaryClientId, duplicateClientIds, org_id } = await req.json();

    if (!primaryClientId || !duplicateClientIds || duplicateClientIds.length === 0) {
      throw new Error("primaryClientId and duplicateClientIds are required");
    }

    // If org_id is provided, use the atomic PostgreSQL function
    if (org_id) {
      console.log(`Calling merge_clients_atomic for org ${org_id}`);
      
      const { data, error } = await supabaseClient.rpc('merge_clients_atomic', {
        _primary_client_id: primaryClientId,
        _duplicate_client_ids: duplicateClientIds,
        _org_id: org_id
      });

      if (error) {
        console.error('Error calling merge_clients_atomic:', error);
        throw error;
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: `Merged ${duplicateClientIds.length} clients into primary client`,
          deletedCount: data?.deleted_count || duplicateClientIds.length,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    // Fallback to original logic if org_id not provided
    console.log('Using legacy merge logic (no org_id provided)');

    // Transfer documents
    const { error: docsError } = await supabaseClient
      .from("client_documents")
      .update({ client_id: primaryClientId })
      .in("client_id", duplicateClientIds);

    if (docsError) throw docsError;

    // Transfer invoices
    const { error: invoicesError } = await supabaseClient
      .from("client_invoices")
      .update({ client_id: primaryClientId })
      .in("client_id", duplicateClientIds);

    if (invoicesError) throw invoicesError;

    // Transfer alternate contacts
    const { error: contactsError } = await supabaseClient
      .from("client_alternate_contacts")
      .update({ client_id: primaryClientId })
      .in("client_id", duplicateClientIds);

    if (contactsError) throw contactsError;

    // Delete duplicate clients
    const { error: deleteError } = await supabaseClient
      .from("clients")
      .delete()
      .in("id", duplicateClientIds);

    if (deleteError) throw deleteError;

    return new Response(
      JSON.stringify({
        success: true,
        message: `Merged ${duplicateClientIds.length} clients into primary client`,
        deletedCount: duplicateClientIds.length,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: unknown) {
    console.error("Error merging clients:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
