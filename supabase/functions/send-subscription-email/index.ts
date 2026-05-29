import { getSupabaseClient } from '../_shared/supabaseClient.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EmailRequest {
  org_id: string;
  template_type: 'payment_reminder' | 'suspension_warning' | 'services_suspended' | 'services_restored' | 'payment_successful' | 'invoice_generated';
  data: {
    amount?: number;
    due_date?: string;
    invoice_id?: string;
    payment_id?: string;
    invoice_number?: string;
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = getSupabaseClient();

    const body: EmailRequest = await req.json();
    const { org_id, template_type, data } = body;

    console.log('Sending subscription email:', { org_id, template_type });

    // Get organization and admin email
    const { data: org } = await supabase
      .from('organizations')
      .select('name, email_settings:email_settings(sending_domain)')
      .eq('id', org_id)
      .single();

    const { data: admins } = await supabase
      .from('user_roles')
      .select('profiles:user_id(id, first_name, last_name)')
      .eq('org_id', org_id)
      .in('role', ['admin', 'super_admin'])
      .limit(1);

    if (!admins || admins.length === 0) {
      throw new Error('No admin found for organization');
    }

    // Get admin user email
    const adminProfile = admins[0].profiles as any;
    const { data: { user } } = await supabase.auth.admin.getUserById(adminProfile.id);
    
    if (!user?.email) {
      throw new Error('Admin email not found');
    }

    const adminEmail = user.email;
    const adminName = `${adminProfile.first_name} ${adminProfile.last_name}`;
    const orgName = org?.name || 'Your Organization';

    // Build email content based on template type
    let subject = '';
    let html = '';

    switch (template_type) {
      case 'payment_reminder':
        subject = `Payment Reminder - ${orgName}`;
        html = `
          <h2>Payment Reminder</h2>
          <p>Dear ${adminName},</p>
          <p>This is a reminder that your subscription payment of ₹${data.amount} is due on ${data.due_date}.</p>
          <p>Please ensure timely payment to avoid service interruption.</p>
          <p>Invoice ID: ${data.invoice_id}</p>
          <p>Best regards,<br>Billing Team</p>
        `;
        break;

      case 'suspension_warning':
        subject = `⚠️ Service Suspension Warning - ${orgName}`;
        html = `
          <h2>⚠️ Service Suspension Warning</h2>
          <p>Dear ${adminName},</p>
          <p>Your payment is overdue. If payment is not received soon, your services may be suspended.</p>
          <p>Outstanding Amount: ₹${data.amount}</p>
          <p>Due Date: ${data.due_date}</p>
          <p>Please make payment immediately to avoid service disruption.</p>
          <p>Best regards,<br>Billing Team</p>
        `;
        break;

      case 'services_suspended':
        subject = `🚫 Services Suspended - ${orgName}`;
        html = `
          <h2>🚫 Services Suspended</h2>
          <p>Dear ${adminName},</p>
          <p>Your services have been suspended due to non-payment.</p>
          <p>Outstanding Amount: ₹${data.amount}</p>
          <p>Invoice: ${data.invoice_number}</p>
          <p>Please make payment immediately to restore services.</p>
          <p>Best regards,<br>Billing Team</p>
        `;
        break;

      case 'services_restored':
        subject = `✅ Services Restored - ${orgName}`;
        html = `
          <h2>✅ Services Restored</h2>
          <p>Dear ${adminName},</p>
          <p>Thank you for your payment! Your services have been restored.</p>
          <p>Invoice: ${data.invoice_number}</p>
          <p>You can now access all features without restrictions.</p>
          <p>Best regards,<br>Billing Team</p>
        `;
        break;

      case 'payment_successful':
        subject = `✅ Payment Received - ${orgName}`;
        html = `
          <h2>✅ Payment Successful</h2>
          <p>Dear ${adminName},</p>
          <p>We have received your payment of ₹${data.amount}.</p>
          <p>Payment ID: ${data.payment_id}</p>
          <p>Thank you for your payment!</p>
          <p>Best regards,<br>Billing Team</p>
        `;
        break;

      case 'invoice_generated':
        subject = `New Invoice Generated - ${orgName}`;
        html = `
          <h2>New Invoice Generated</h2>
          <p>Dear ${adminName},</p>
          <p>A new invoice has been generated for your subscription.</p>
          <p>Invoice Number: ${data.invoice_number}</p>
          <p>Amount: ₹${data.amount}</p>
          <p>Due Date: ${data.due_date}</p>
          <p>Please make payment by the due date to avoid service interruption.</p>
          <p>Best regards,<br>Billing Team</p>
        `;
        break;

      default:
        throw new Error('Invalid template type');
    }

    // Send email via Resend API
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'Billing <noreply@' + (org?.email_settings?.[0]?.sending_domain || 'resend.dev') + '>',
        to: [adminEmail],
        subject,
        html,
      }),
    });

    if (!emailResponse.ok) {
      const error = await emailResponse.json();
      throw new Error(error.message || 'Failed to send email');
    }

    // Log notification
    await supabase
      .from('subscription_notifications')
      .insert({
        org_id,
        notification_type: template_type,
        recipient_emails: [adminEmail],
        email_subject: subject,
        metadata: data,
      });

    console.log('Subscription email sent successfully');

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in send-subscription-email:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
