import { supabase } from "@/integrations/supabase/client";

/**
 * Updates a contact's pipeline stage from "New" to "Contacted" after successful communication.
 * Only updates if the contact is currently in the "New" stage.
 */
export async function updateContactStageToContacted(contactId: string): Promise<void> {
  try {
    // Get the contact's current stage and org_id
    const { data: contact, error: contactError } = await supabase
      .from("contacts")
      .select("pipeline_stage_id, org_id")
      .eq("id", contactId)
      .single();

    if (contactError || !contact) {
      console.error("Error fetching contact for stage update:", contactError);
      return;
    }

    // Get the "New" stage for this org
    const { data: newStage, error: newStageError } = await supabase
      .from("pipeline_stages")
      .select("id")
      .eq("org_id", contact.org_id)
      .ilike("name", "new")
      .eq("is_active", true)
      .maybeSingle();

    if (newStageError) {
      console.error("Error fetching New stage:", newStageError);
      return;
    }

    // Only proceed if contact is in "New" stage
    if (!newStage || contact.pipeline_stage_id !== newStage.id) {
      return; // Contact is not in "New" stage, no update needed
    }

    // Get the "Contacted" stage for this org
    const { data: contactedStage, error: contactedStageError } = await supabase
      .from("pipeline_stages")
      .select("id")
      .eq("org_id", contact.org_id)
      .ilike("name", "contacted")
      .eq("is_active", true)
      .maybeSingle();

    if (contactedStageError || !contactedStage) {
      console.error("Error fetching Contacted stage:", contactedStageError);
      return;
    }

    // Update the contact's pipeline stage to "Contacted"
    const { error: updateError } = await supabase
      .from("contacts")
      .update({ 
        pipeline_stage_id: contactedStage.id,
        updated_at: new Date().toISOString()
      })
      .eq("id", contactId);

    if (updateError) {
      console.error("Error updating contact pipeline stage:", updateError);
      return;
    }

    console.log(`Contact ${contactId} moved from New to Contacted stage`);
  } catch (error) {
    console.error("Error in updateContactStageToContacted:", error);
  }
}
