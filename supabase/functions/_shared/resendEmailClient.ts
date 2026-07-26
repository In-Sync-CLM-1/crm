/**
 * Shared Resend email sending utility.
 * Used by: send-email, mkt-send-email, send-bulk-email, send-subscription-email
 */

export interface ResendEmailPayload {
  from: string;
  to: string[];
  subject: string;
  html: string;
  /**
   * Plain-text alternative. Optional, but supply it for anything sent to a
   * cold or external audience — an HTML-only message is itself a spam signal.
   */
  text?: string;
  reply_to?: string[];
  cc?: string[];
  headers?: Record<string, string>;
  tags?: Array<{ name: string; value: string }>;
  /**
   * Send through a specific Resend account instead of the fleet's default.
   *
   * Only cold/bulk marketing should ever set this. The default key carries
   * invoices, password resets and system alerts for every product, and the
   * whole point of overriding it is to keep a campaign's sending quota and
   * bounce record off that account.
   */
  apiKeyOverride?: string;
}

export interface ResendResult {
  success: boolean;
  id?: string;
  error?: string;
}

/**
 * Send an email via the Resend API.
 */
export async function sendViaResend(payload: ResendEmailPayload): Promise<ResendResult> {
  const { apiKeyOverride, ...body } = payload;
  const apiKey = apiKeyOverride || Deno.env.get('RESEND_API_KEY');
  if (!apiKey) {
    return { success: false, error: 'RESEND_API_KEY not configured' };
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const result = await response.json();

  if (!response.ok) {
    return { success: false, error: result?.message || result?.error || `Resend error ${response.status}` };
  }

  return { success: true, id: result.id };
}

/**
 * Build the "from" address string: "Name <email>"
 */
export function buildFromAddress(name: string, email: string): string {
  return `${name} <${email}>`;
}

/**
 * Inject an unsubscribe footer into HTML email content.
 * Inserts before </body> or appends to end.
 */
export function buildUnsubscribeFooter(unsubscribeUrl: string): string {
  return `
    <div style="text-align:center;margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;">
      <p style="font-size:12px;color:#6b7280;">
        <a href="${unsubscribeUrl}" style="color:#6b7280;text-decoration:underline;">Unsubscribe</a>
        from these emails.
      </p>
    </div>`;
}

/**
 * Inject content (footer, pixel) before </body> or append to end.
 */
export function injectBeforeBodyClose(html: string, content: string): string {
  if (html.includes('</body>')) {
    return html.replace('</body>', `${content}</body>`);
  }
  return html + content;
}

/**
 * Build a 1x1 tracking pixel img tag.
 */
export function injectTrackingPixel(trackingUrl: string): string {
  return `<img src="${trackingUrl}" width="1" height="1" style="display:none" alt="" />`;
}

/**
 * Build RFC 8058 List-Unsubscribe headers.
 */
export function buildUnsubscribeHeaders(unsubscribeUrl: string): Record<string, string> {
  return {
    'List-Unsubscribe': `<${unsubscribeUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}
