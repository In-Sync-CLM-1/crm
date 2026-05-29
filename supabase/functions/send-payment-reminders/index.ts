import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { getSupabaseClient } from '../_shared/supabaseClient.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = getSupabaseClient();

    console.log('Starting payment reminder check...');

    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const threeDaysFromNow = new Date(today);
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

    // Get pending/overdue invoices
    const { data: invoices, error: invoicesError } = await supabase
      .from('subscription_invoices')
      .select('id, org_id, invoice_number, total_amount, due_date, payment_status')
      .in('payment_status', ['pending', 'overdue'])
      .order('due_date', { ascending: true });

    if (invoicesError) {
      console.error('Error fetching invoices:', invoicesError);
      throw invoicesError;
    }

    console.log(`Found ${invoices?.length || 0} pending/overdue invoices`);

    let remindersSent = 0;

    for (const invoice of invoices || []) {
      try {
        const dueDate = new Date(invoice.due_date);
        const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        let shouldSendReminder = false;
        let notificationType = '';

        // Check if we should send a reminder
        if (daysUntilDue === 3) {
          // 3 days before due date
          notificationType = 'payment_reminder';
          shouldSendReminder = true;
        } else if (daysUntilDue === 1) {
          // 1 day before due date
          notificationType = 'payment_reminder';
          shouldSendReminder = true;
        } else if (daysUntilDue === 0) {
          // Due today
          notificationType = 'payment_reminder';
          shouldSendReminder = true;
        } else if (daysUntilDue < 0 && invoice.payment_status === 'overdue') {
          // Overdue - send warning
          if (daysUntilDue === -2) {
            notificationType = 'service_suspension_warning';
            shouldSendReminder = true;
          } else if (daysUntilDue === -5) {
            notificationType = 'service_suspension_warning';
            shouldSendReminder = true;
          } else if (daysUntilDue === -9) {
            notificationType = 'service_suspension_final';
            shouldSendReminder = true;
          }
        }

        if (shouldSendReminder) {
          // Check if we already sent this notification today
          const { data: existingNotif } = await supabase
            .from('subscription_notifications')
            .select('id')
            .eq('org_id', invoice.org_id)
            .eq('notification_type', notificationType)
            .gte('created_at', today.toISOString().split('T')[0])
            .single();

          if (!existingNotif) {
            // Send reminder
            await supabase.functions.invoke('send-subscription-email', {
              body: {
                org_id: invoice.org_id,
                notification_type: notificationType,
                invoice_number: invoice.invoice_number,
                amount: invoice.total_amount,
                due_date: invoice.due_date,
              },
            });

            remindersSent++;
            console.log(`Sent ${notificationType} for invoice ${invoice.invoice_number}`);
          }
        }
      } catch (error) {
        console.error(`Error processing invoice ${invoice.id}:`, error);
      }
    }

    console.log(`Payment reminders complete: ${remindersSent} reminders sent`);

    return new Response(
      JSON.stringify({
        success: true,
        sent: remindersSent,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  } catch (error) {
    console.error('Payment reminder error:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  }
});