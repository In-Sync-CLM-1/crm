import { getSupabaseClient } from '../_shared/supabaseClient.ts';
import { replaceVariables } from '../_shared/templateVariables.ts';

const PARALLEL_BATCH_SIZE = 10; // Process 10 executions in parallel

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Automation email sender started');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabase = getSupabaseClient();

    // Find scheduled executions that are due
    const now = new Date().toISOString();
    const { data: executions, error: fetchError } = await supabase
      .from('email_automation_executions')
      .select(`
        *,
        email_automation_rules(*),
        contacts(*)
      `)
      .eq('status', 'scheduled')
      .lte('scheduled_for', now)
      .limit(100);

    if (fetchError) throw fetchError;

    if (!executions || executions.length === 0) {
      console.log('No scheduled emails to send');
      return new Response(
        JSON.stringify({ message: 'No scheduled emails', count: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    console.log(`Processing ${executions.length} scheduled emails in batches of ${PARALLEL_BATCH_SIZE}`);

    // Prefetch all templates and organization settings to avoid N+1 queries
    const templateIds = [...new Set(executions.map(e => e.email_template_id).filter(Boolean))];
    const orgIds = [...new Set(executions.map(e => e.contacts?.org_id).filter(Boolean))];
    
    const [templatesData, orgSettingsData] = await Promise.all([
      supabase.from('email_templates').select('*').in('id', templateIds),
      supabase.from('organizations').select('id, max_automation_emails_per_day').in('id', orgIds)
    ]);

    const templatesMap = new Map(templatesData.data?.map(t => [t.id, t]) || []);
    const orgSettingsMap = new Map(orgSettingsData.data?.map(o => [o.id, o]) || []);

    let sentCount = 0;
    let failedCount = 0;

    // Process executions in parallel batches
    for (let i = 0; i < executions.length; i += PARALLEL_BATCH_SIZE) {
      const batch = executions.slice(i, i + PARALLEL_BATCH_SIZE);
      console.log(`Processing batch ${Math.floor(i / PARALLEL_BATCH_SIZE) + 1}/${Math.ceil(executions.length / PARALLEL_BATCH_SIZE)}`);

      const batchResults = await Promise.allSettled(
        batch.map(async (execution) => processExecution(execution, supabase, supabaseUrl, templatesMap, orgSettingsMap))
      );

      // Count results
      batchResults.forEach(result => {
        if (result.status === 'fulfilled') {
          if (result.value === 'sent') sentCount++;
          else if (result.value === 'failed') failedCount++;
        } else {
          failedCount++;
          console.error('Batch execution error:', result.reason);
        }
      });
    }

    console.log(`Completed: ${sentCount} sent, ${failedCount} failed`);

    return new Response(
      JSON.stringify({ 
        message: 'Scheduled emails processed', 
        sent: sentCount,
        failed: failedCount
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error: any) {
    console.error('Automation email sender error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

/**
 * Process a single execution with all checks and sending logic
 */
async function processExecution(
  execution: any,
  supabase: any,
  supabaseUrl: string,
  templatesMap: Map<string, any>,
  orgSettingsMap: Map<string, any>
): Promise<'sent' | 'failed' | 'skipped'> {
  try {
    const rule = execution.email_automation_rules;
    const contact = execution.contacts;

    if (!contact?.email) {
      throw new Error('Contact has no email address');
    }

    // Get organization settings
    const orgSettings = orgSettingsMap.get(contact.org_id);
    const maxPerDay = orgSettings?.max_automation_emails_per_day || 3;

    // 1. Check daily email limit
    const { data: canSend } = await supabase.rpc('check_and_increment_daily_limit', {
      _org_id: contact.org_id,
      _contact_id: contact.id,
      _max_per_day: maxPerDay
    });

    if (!canSend) {
      console.log(`Daily limit reached for contact ${contact.id} (${maxPerDay} emails)`);
      await supabase.from('email_automation_executions').update({ 
        status: 'failed', 
        error_message: `Daily email limit reached (${maxPerDay} emails per day)` 
      }).eq('id', execution.id);
      return 'failed';
    }

    // 2. Check if email is unsubscribed
    const { data: isUnsubscribed } = await supabase.rpc('is_email_unsubscribed', {
      _org_id: contact.org_id,
      _email: contact.email
    });

    if (isUnsubscribed) {
      console.log(`Email ${contact.email} has unsubscribed, skipping`);
      await supabase.from('email_automation_executions').update({ 
        status: 'failed', 
        error_message: 'Recipient has unsubscribed from automation emails' 
      }).eq('id', execution.id);
      return 'failed';
    }

    // 3. Check suppression list
    const { data: isSuppressed } = await supabase.rpc('is_email_suppressed', {
      _org_id: contact.org_id,
      _email: contact.email
    });

    if (isSuppressed) {
      console.log(`Email ${contact.email} is suppressed, skipping`);
      await supabase.from('email_automation_executions').update({ 
        status: 'failed', 
        error_message: 'Email is on suppression list' 
      }).eq('id', execution.id);
      return 'failed';
    }

    // 4. Check business hours if enforcement enabled
    if (rule.enforce_business_hours) {
      const { data: withinHours } = await supabase.rpc('is_within_business_hours', {
        _org_id: contact.org_id,
        _check_time: new Date().toISOString()
      });

      if (!withinHours) {
        console.log(`Outside business hours, rescheduling`);
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(9, 0, 0, 0);
        
        await supabase.from('email_automation_executions').update({ 
          status: 'scheduled',
          scheduled_for: tomorrow.toISOString()
        }).eq('id', execution.id);
        return 'skipped';
      }
    }

    // Mark as processing
    await supabase.from('email_automation_executions').update({ status: 'pending' }).eq('id', execution.id);

    // 5. Handle A/B testing
    let templateId = execution.email_template_id;
    let subjectOverride = null;

    if (rule.ab_test_enabled) {
      const { data: abTest } = await supabase
        .from('automation_ab_tests')
        .select('*')
        .eq('rule_id', rule.id)
        .eq('status', 'active')
        .single();

      if (abTest) {
        const variants = abTest.variants as any[];
        const totalWeight = variants.reduce((sum, v) => sum + (v.weight || 0), 0);
        const random = Math.random() * totalWeight;
        
        let cumulativeWeight = 0;
        for (const variant of variants) {
          cumulativeWeight += variant.weight || 0;
          if (random <= cumulativeWeight) {
            templateId = variant.template_id;
            subjectOverride = variant.subject;
            
            await supabase.from('email_automation_executions').update({
              ab_test_id: abTest.id,
              ab_variant_name: variant.name
            }).eq('id', execution.id);
            break;
          }
        }
      }
    }

    // Get template from prefetched map
    const template = templatesMap.get(templateId);

    if (!template) {
      await supabase.from('email_automation_executions').update({ 
        status: 'failed', 
        error_message: 'Template not found' 
      }).eq('id', execution.id);
      return 'failed';
    }

    // Replace variables using shared utility
    const subjectTemplate = subjectOverride || template.subject;
    const personalizedSubject = await replaceVariables(
      subjectTemplate, 
      contact, 
      execution.trigger_data,
      supabase
    );
    
    // Generate unique IDs for tracking and unsubscribe
    const trackingPixelId = `${execution.id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const unsubscribeToken = crypto.randomUUID();
    
    let personalizedHtml = await replaceVariables(
      template.html_content, 
      contact, 
      execution.trigger_data,
      supabase
    );

    // Add unsubscribe link (before tracking pixel)
    const unsubscribeUrl = `${supabaseUrl}/functions/v1/unsubscribe?token=${unsubscribeToken}`;
    const unsubscribeLink = `
      <div style="margin: 40px 0 20px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center;">
        <p style="margin: 0; font-size: 12px; color: #6b7280; line-height: 1.5;">
          You're receiving this email because of your interaction with our platform.<br>
          <a href="${unsubscribeUrl}" style="color: #6b7280; text-decoration: underline;">Unsubscribe</a> from automated emails
        </p>
      </div>
    `;
    personalizedHtml = personalizedHtml.replace('</body>', `${unsubscribeLink}</body>`);

    // Add tracking pixel
    const trackingPixel = `<img src="${supabaseUrl}/functions/v1/email-tracking/open?id=${trackingPixelId}" width="1" height="1" style="display:none" alt="" />`;
    personalizedHtml = personalizedHtml.replace('</body>', `${trackingPixel}</body>`);
    
    // Wrap links with tracking (detect CTA buttons vs regular links)
    personalizedHtml = personalizedHtml.replace(
      /<a\s+([^>]*href=["']([^"']+)["'][^>]*)>([^<]+)<\/a>/gi,
      (match, attrs, url, linkText) => {
        if (url.includes('unsubscribe')) return match; // Don't track unsubscribe link
        
        // Detect if this is a CTA button (has padding, background-color, etc.)
        const isCTAButton = attrs.includes('padding:') && attrs.includes('background-color');
        
        if (isCTAButton) {
          // Generate button ID from text
          const buttonId = `btn-${linkText.trim().toLowerCase().replace(/\s+/g, '-')}`;
          const trackedUrl = `${supabaseUrl}/functions/v1/email-tracking/cta-click?id=${trackingPixelId}&button_id=${buttonId}&button_text=${encodeURIComponent(linkText.trim())}&url=${encodeURIComponent(url)}`;
          return `<a ${attrs.replace(url, trackedUrl)}>${linkText}</a>`;
        } else {
          // Regular link tracking
          const trackedUrl = `${supabaseUrl}/functions/v1/email-tracking/click?id=${trackingPixelId}&url=${encodeURIComponent(url)}`;
          return `<a ${attrs.replace(url, trackedUrl)}>${linkText}</a>`;
        }
      }
    );

    // Send email via send-email function
    const { error: sendError } = await supabase.functions.invoke('send-email', {
      body: {
        to: contact.email,
        subject: personalizedSubject,
        html: personalizedHtml,
        contactId: execution.contact_id,
        trackingPixelId: trackingPixelId,
        unsubscribeToken: unsubscribeToken,
      }
    });

    if (sendError) throw sendError;

    // Update execution status
    const { error: updateError } = await supabase
      .from('email_automation_executions')
      .update({ 
        status: 'sent', 
        sent_at: new Date().toISOString(),
        email_subject: personalizedSubject
      })
      .eq('id', execution.id);

    if (updateError) {
      console.error(`[automation-email-sender] Error updating execution status for ${execution.id}:`, updateError);
    }

    // Update rule stats
    const { error: statsError } = await supabase.rpc('increment_automation_rule_stats', {
      _rule_id: execution.rule_id,
      _stat_type: 'sent',
    });

    if (statsError) {
      console.error(`[automation-email-sender] Error updating rule stats for ${execution.rule_id}:`, statsError);
    }

    // Record cooldown using atomic function
    await supabase.rpc('increment_automation_cooldown', {
      _rule_id: execution.rule_id,
      _contact_id: execution.contact_id,
      _org_id: contact.org_id
    });

    console.log(`Successfully sent email for execution ${execution.id}`);
    return 'sent';

  } catch (error: any) {
    console.error(`Failed to send email for execution ${execution.id}:`, error);
    
    // Implement retry logic
    const retryCount = execution.retry_count || 0;
    const maxRetries = execution.max_retries || 3;

    if (retryCount < maxRetries) {
      // Exponential backoff: 5min, 30min, 2hours
      const backoffMinutes = Math.pow(6, retryCount) * 5;
      const nextRetry = new Date(Date.now() + backoffMinutes * 60 * 1000);
      
      await supabase.from('email_automation_executions').update({
        status: 'scheduled',
        retry_count: retryCount + 1,
        next_retry_at: nextRetry.toISOString(),
        scheduled_for: nextRetry.toISOString(),
        error_message: `${error.message} (retry ${retryCount + 1}/${maxRetries})`
      }).eq('id', execution.id);
      
      console.log(`Scheduled retry ${retryCount + 1} at ${nextRetry}`);
      return 'skipped';
    } else {
      // Max retries reached
      await supabase.from('email_automation_executions').update({ 
        status: 'failed', 
        error_message: `${error.message} (failed after ${retryCount} retries)` 
      }).eq('id', execution.id);

      await supabase.rpc('increment_automation_rule_stats', {
        _rule_id: execution.rule_id,
        _stat_type: 'failed',
      });

      return 'failed';
    }
  }
}

// Original replaceVariables function removed - now using shared utility from _shared/templateVariables.ts
