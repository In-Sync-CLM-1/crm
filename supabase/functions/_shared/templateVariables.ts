import { SupabaseClient } from 'npm:@supabase/supabase-js@2.58.0';

/**
 * Replace template variables with actual contact data
 * Supports standard fields, custom fields, trigger data, and custom mappings
 */
export async function replaceVariables(
  template: string,
  contact: any,
  triggerData: any = {},
  supabase: SupabaseClient,
  customMappings?: any
): Promise<string> {
  let result = template;

  // Handle custom variable mappings (for bulk campaigns with CSV data)
  if (customMappings) {
    for (const [variable, mapping] of Object.entries(customMappings)) {
      const mappingObj = mapping as any;
      let value = '';
      
      if (mappingObj.source === 'crm' && contact) {
        value = (contact as any)[mappingObj.field] || '';
      } else if (mappingObj.source === 'csv' && triggerData) {
        value = triggerData[mappingObj.field] || '';
      } else if (mappingObj.source === 'static') {
        value = mappingObj.value || '';
      }
      
      const escapedVariable = variable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      result = result.replace(new RegExp(escapedVariable, 'g'), value);
    }
    return result;
  }

  // Standard contact variables
  result = result
    .replace(/{{first_name}}/g, contact?.first_name || '')
    .replace(/{{last_name}}/g, contact?.last_name || '')
    .replace(/{{full_name}}/g, `${contact?.first_name || ''} ${contact?.last_name || ''}`.trim() || 'there')
    .replace(/{{email}}/g, contact?.email || '')
    .replace(/{{phone}}/g, contact?.phone || '')
    .replace(/{{company}}/g, contact?.company || '')
    .replace(/{{job_title}}/g, contact?.job_title || '')
    .replace(/{{city}}/g, contact?.city || '')
    .replace(/{{state}}/g, contact?.state || '')
    .replace(/{{country}}/g, contact?.country || '')
    .replace(/{{status}}/g, contact?.status || '')
    .replace(/{{source}}/g, contact?.source || '');

  // Date fields
  if (contact?.created_at) {
    const createdDate = new Date(contact.created_at);
    result = result
      .replace(/{{created_date}}/g, createdDate.toLocaleDateString())
      .replace(/{{created_date_long}}/g, createdDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }));
  }

  // Days since last contact
  if (contact?.updated_at) {
    const daysSince = Math.floor((Date.now() - new Date(contact.updated_at).getTime()) / (1000 * 60 * 60 * 24));
    result = result.replace(/{{days_since_last_contact}}/g, String(daysSince));
  }

  // Fetch pipeline stage (if needed)
  if (contact?.pipeline_stage_id && result.includes('{{pipeline_stage}}')) {
    try {
      const { data: stage } = await supabase
        .from('pipeline_stages')
        .select('name')
        .eq('id', contact.pipeline_stage_id)
        .single();
      result = result.replace(/{{pipeline_stage}}/g, stage?.name || '');
    } catch (e) {
      console.error('[TemplateVariables] Error fetching stage:', e);
    }
  }

  // Fetch assigned user (if needed)
  if (contact?.assigned_to && (result.includes('{{assigned_to_name}}') || result.includes('{{assigned_to_email}}'))) {
    try {
      const { data: assignedUser } = await supabase
        .from('profiles')
        .select('first_name, last_name, email')
        .eq('id', contact.assigned_to)
        .single();

      if (assignedUser) {
        result = result
          .replace(/{{assigned_to_name}}/g, `${assignedUser.first_name} ${assignedUser.last_name}`.trim())
          .replace(/{{assigned_to_email}}/g, assignedUser.email || '');
      }
    } catch (e) {
      console.error('[TemplateVariables] Error fetching assigned user:', e);
    }
  }

  // Fetch custom fields (if needed)
  if (contact?.id && result.includes('{{custom_field.')) {
    try {
      const { data: customFields } = await supabase
        .from('contact_custom_fields')
        .select('custom_field_id, field_value, custom_fields(field_name)')
        .eq('contact_id', contact.id);

      if (customFields) {
        customFields.forEach((cf: any) => {
          const fieldName = cf.custom_fields?.field_name;
          if (fieldName) {
            const regex = new RegExp(`{{custom_field\\.${fieldName}}}`, 'g');
            result = result.replace(regex, cf.field_value || '');
          }
        });
      }
    } catch (e) {
      console.error('[TemplateVariables] Error fetching custom fields:', e);
    }
  }

  // Trigger-specific variables
  if (triggerData && Object.keys(triggerData).length > 0) {
    Object.keys(triggerData).forEach(key => {
      const regex = new RegExp(`{{trigger\\.${key}}}`, 'g');
      result = result.replace(regex, String(triggerData[key] || ''));
    });

    // Stage change specific
    if (triggerData.from_stage_id || triggerData.to_stage_id) {
      try {
        if (triggerData.from_stage_id && (result.includes('{{trigger.old_stage}}') || result.includes('{{trigger.from_stage}}'))) {
          const { data: fromStage } = await supabase
            .from('pipeline_stages')
            .select('name')
            .eq('id', triggerData.from_stage_id)
            .single();
          result = result
            .replace(/{{trigger\.old_stage}}/g, fromStage?.name || '')
            .replace(/{{trigger\.from_stage}}/g, fromStage?.name || '');
        }

        if (triggerData.to_stage_id && (result.includes('{{trigger.new_stage}}') || result.includes('{{trigger.to_stage}}'))) {
          const { data: toStage } = await supabase
            .from('pipeline_stages')
            .select('name')
            .eq('id', triggerData.to_stage_id)
            .single();
          result = result
            .replace(/{{trigger\.new_stage}}/g, toStage?.name || '')
            .replace(/{{trigger\.to_stage}}/g, toStage?.name || '');
        }
      } catch (e) {
        console.error('[TemplateVariables] Error fetching stages:', e);
      }
    }

    // Disposition specific
    if (triggerData.disposition_id && result.includes('{{trigger.disposition')) {
      try {
        const { data: disposition } = await supabase
          .from('call_dispositions')
          .select('name, description')
          .eq('id', triggerData.disposition_id)
          .single();
        result = result
          .replace(/{{trigger\.disposition}}/g, disposition?.name || '')
          .replace(/{{trigger\.disposition_description}}/g, disposition?.description || '');
      } catch (e) {
        console.error('[TemplateVariables] Error fetching disposition:', e);
      }
    }

    // Activity specific
    if (triggerData.activity_type) {
      result = result.replace(/{{trigger\.activity_type}}/g, triggerData.activity_type);
    }

    // Call duration formatting
    if (triggerData.call_duration) {
      const minutes = Math.floor(triggerData.call_duration / 60);
      const seconds = triggerData.call_duration % 60;
      result = result
        .replace(/{{trigger\.call_duration}}/g, `${minutes}m ${seconds}s`)
        .replace(/{{trigger\.call_duration_minutes}}/g, String(minutes));
    }
  }

  return result;
}

/**
 * Batch fetch related data for multiple contacts to avoid N+1 queries
 */
export async function batchFetchContactData(
  contactIds: string[],
  supabase: SupabaseClient
): Promise<Map<string, any>> {
  const dataMap = new Map<string, any>();

  if (contactIds.length === 0) return dataMap;

  try {
    // Fetch all contacts with related data in one query
    const { data: contacts } = await supabase
      .from('contacts')
      .select(`
        *,
        pipeline_stages(name),
        assigned_user:profiles!assigned_to(first_name, last_name, email),
        contact_custom_fields(field_value, custom_fields(field_name))
      `)
      .in('id', contactIds);

    if (contacts) {
      contacts.forEach(contact => {
        dataMap.set(contact.id, contact);
      });
    }
  } catch (e) {
    console.error('[TemplateVariables] Error batch fetching contact data:', e);
  }

  return dataMap;
}
