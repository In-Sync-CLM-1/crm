import { getSupabaseClient } from '../_shared/supabaseClient.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AutoTopupRequest {
  org_id: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = getSupabaseClient();

    const body: AutoTopupRequest = await req.json();
    const { org_id } = body;

    console.log('Checking auto top-up for org:', org_id);

    // Get subscription
    const { data: sub, error: subError } = await supabase
      .from('organization_subscriptions')
      .select('wallet_balance, wallet_minimum_balance, wallet_auto_topup_enabled')
      .eq('org_id', org_id)
      .single();

    if (subError || !sub) {
      throw new Error('Subscription not found');
    }

    // Check if balance is below minimum
    if (sub.wallet_balance < sub.wallet_minimum_balance) {
      console.log('Wallet balance below minimum:', {
        current: sub.wallet_balance,
        minimum: sub.wallet_minimum_balance,
      });

      // Get auto top-up amount
      const { data: pricing } = await supabase
        .from('subscription_pricing')
        .select('auto_topup_amount')
        .eq('is_active', true)
        .single();

      if (!pricing) {
        throw new Error('No active pricing found');
      }

      // Check if auto-top-up is enabled
      if (sub.wallet_auto_topup_enabled) {
        // Send notification to org admins
        await supabase.functions.invoke('send-subscription-email', {
          body: {
            org_id,
            template_type: 'auto_topup_required',
            data: {
              current_balance: sub.wallet_balance,
              min_balance: sub.wallet_minimum_balance,
              topup_amount: pricing.auto_topup_amount,
            },
          },
        });

        console.log('Auto top-up notification sent');

        return new Response(
          JSON.stringify({
            requires_topup: true,
            current_balance: sub.wallet_balance,
            min_balance: sub.wallet_minimum_balance,
            topup_amount: pricing.auto_topup_amount,
            notification_sent: true,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else {
        // Send low balance warning
        await supabase.functions.invoke('send-subscription-email', {
          body: {
            org_id,
            template_type: 'wallet_critical_balance',
            data: {
              current_balance: sub.wallet_balance,
              min_balance: sub.wallet_minimum_balance,
            },
          },
        });

        console.log('Low balance warning sent');

        return new Response(
          JSON.stringify({
            requires_topup: true,
            current_balance: sub.wallet_balance,
            min_balance: sub.wallet_minimum_balance,
            auto_topup_disabled: true,
            notification_sent: true,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Check if balance is at 30% of minimum (early warning)
    const thirtyPercentThreshold = sub.wallet_minimum_balance * 0.3;
    if (sub.wallet_balance < thirtyPercentThreshold && sub.wallet_balance >= sub.wallet_minimum_balance) {
      console.log('Wallet balance below 30% threshold');

      // Send low balance warning
      await supabase.functions.invoke('send-subscription-email', {
        body: {
          org_id,
          template_type: 'wallet_low_balance',
          data: {
            current_balance: sub.wallet_balance,
            min_balance: sub.wallet_minimum_balance,
            threshold_percentage: 30,
          },
        },
      });

      console.log('Low balance warning sent (30% threshold)');

      return new Response(
        JSON.stringify({
          requires_topup: false,
          low_balance_warning: true,
          current_balance: sub.wallet_balance,
          min_balance: sub.wallet_minimum_balance,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        requires_topup: false,
        current_balance: sub.wallet_balance,
        min_balance: sub.wallet_minimum_balance,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in auto-topup-check:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
