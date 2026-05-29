import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { getSupabaseClient } from '../_shared/supabaseClient.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// 1x1 transparent pixel
const TRACKING_PIXEL = Uint8Array.from(atob(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
), (c) => c.charCodeAt(0));

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = getSupabaseClient();

  const url = new URL(req.url);
  const trackingId = url.searchParams.get("id");
  const buttonId = url.searchParams.get("button_id");
  const buttonText = url.searchParams.get("button_text");
  
  // Determine action type and target table
  let action = "open";
  let isCampaignEmail = false;
  
  if (url.pathname.includes("/campaign-open")) {
    action = "open";
    isCampaignEmail = true;
  } else if (url.pathname.includes("/campaign-click")) {
    action = "click";
    isCampaignEmail = true;
  } else if (url.pathname.includes("/cta-click")) {
    action = "cta-click";
  } else if (url.pathname.includes("/click")) {
    action = "click";
  }

  if (!trackingId) {
    return new Response("Invalid tracking ID", { status: 400 });
  }

  try {
    // Handle campaign email tracking
    if (isCampaignEmail) {
      const { data: recipient, error: lookupError } = await supabase
        .from("email_campaign_recipients")
        .select("id, open_count, click_count, opened_at, first_clicked_at, button_clicks")
        .eq("tracking_pixel_id", trackingId)
        .single();

      if (lookupError || !recipient) {
        console.error("Campaign tracking lookup error:", lookupError);
        if (action === "open") {
          return new Response(TRACKING_PIXEL, {
            headers: { "Content-Type": "image/png", "Cache-Control": "no-cache" },
          });
        }
        return new Response(null, { status: 302, headers: { Location: "/" } });
      }

      // Update tracking data based on action type
      if (action === "open") {
        const updates: any = {
          open_count: (recipient.open_count || 0) + 1,
        };

        if (!recipient.opened_at) {
          updates.opened_at = new Date().toISOString();
        }

        await supabase
          .from("email_campaign_recipients")
          .update(updates)
          .eq("id", recipient.id);

        return new Response(TRACKING_PIXEL, {
          headers: { "Content-Type": "image/png", "Cache-Control": "no-cache" },
        });
      } else if (action === "click") {
        const targetUrl = url.searchParams.get("url") || "/";
        
        const updates: any = {
          click_count: (recipient.click_count || 0) + 1,
        };

        if (!recipient.first_clicked_at) {
          updates.first_clicked_at = new Date().toISOString();
        }

        await supabase
          .from("email_campaign_recipients")
          .update(updates)
          .eq("id", recipient.id);

        console.log(`Campaign link clicked in recipient ${recipient.id}`);

        return new Response(null, {
          status: 302,
          headers: { Location: decodeURIComponent(targetUrl) },
        });
      }
    }

    // Handle regular email conversation tracking
    const { data: conversation, error: lookupError } = await supabase
      .from("email_conversations")
      .select("id, open_count, click_count, opened_at, first_clicked_at, button_clicks")
      .eq("tracking_pixel_id", trackingId)
      .single();

    if (lookupError || !conversation) {
      console.error("Tracking lookup error:", lookupError);
      // Still return the pixel/redirect to avoid broken images
      if (action === "open") {
        return new Response(TRACKING_PIXEL, {
          headers: { "Content-Type": "image/png", "Cache-Control": "no-cache" },
        });
      }
      return new Response(null, { status: 302, headers: { Location: "/" } });
    }

    // Update tracking data based on action type
    if (action === "open") {
      const updates: any = {
        open_count: (conversation.open_count || 0) + 1,
      };

      if (!conversation.opened_at) {
        updates.opened_at = new Date().toISOString();
      }

      await supabase
        .from("email_conversations")
        .update(updates)
        .eq("id", conversation.id);

      // Return tracking pixel
      return new Response(TRACKING_PIXEL, {
        headers: { "Content-Type": "image/png", "Cache-Control": "no-cache" },
      });
    } else if (action === "cta-click") {
      // Handle CTA button click tracking
      const targetUrl = url.searchParams.get("url") || "/";
      
      const updates: any = {
        click_count: (conversation.click_count || 0) + 1,
      };

      if (!conversation.first_clicked_at) {
        updates.first_clicked_at = new Date().toISOString();
      }

      // Add button click to button_clicks array
      const buttonClick = {
        button_id: buttonId,
        button_text: buttonText,
        clicked_at: new Date().toISOString()
      };

      // Append to existing button_clicks array
      const existingClicks = conversation.button_clicks || [];
      updates.button_clicks = [...existingClicks, buttonClick];

      await supabase
        .from("email_conversations")
        .update(updates)
        .eq("id", conversation.id);

      console.log(`CTA button clicked: ${buttonText} (${buttonId}) in conversation ${conversation.id}`);

      // Redirect to target URL
      return new Response(null, {
        status: 302,
        headers: { Location: decodeURIComponent(targetUrl) },
      });
    } else if (action === "click") {
      // Handle regular link click tracking
      const targetUrl = url.searchParams.get("url") || "/";
      
      const updates: any = {
        click_count: (conversation.click_count || 0) + 1,
      };

      if (!conversation.first_clicked_at) {
        updates.first_clicked_at = new Date().toISOString();
      }

      await supabase
        .from("email_conversations")
        .update(updates)
        .eq("id", conversation.id);

      // Redirect to target URL
      return new Response(null, {
        status: 302,
        headers: { Location: decodeURIComponent(targetUrl) },
      });
    }

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("Tracking error:", error);
    
    // Return pixel/redirect even on error to avoid broken images/links
    if (action === "open") {
      return new Response(TRACKING_PIXEL, {
        headers: { "Content-Type": "image/png", "Cache-Control": "no-cache" },
      });
    }
    return new Response(null, { status: 302, headers: { Location: "/" } });
  }
});
