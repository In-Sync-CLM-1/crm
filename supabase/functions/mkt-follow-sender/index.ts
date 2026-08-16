/**
 * mkt-follow-sender — sends the founder's daily follow requests.
 *
 * The daily number is a DELIVERY target, not a send count: 100 emails that
 * actually land in an inbox per tier per day. Sends are therefore overshot to
 * cover whatever bounces, using the tier's own recent delivered/sent ratio —
 * see plannedSendCount(). A send that bounces was never a delivery and doesn't
 * count against the day.
 *
 * Two passes per run:
 *   1. NEW    — people never written to, sized to land DAILY_DELIVERY_TARGET
 *   2. REMIND — people written to REMINDER_AFTER_DAYS ago who haven't clicked,
 *               bounced or unsubscribed. Exactly one reminder each, ever, and
 *               the same delivery-targeted sizing applies.
 *
 * The caps are the campaign's whole safety model. This sends from
 * in-sync.co.in, the same domain the entire product fleet uses for invoices,
 * password resets and system alerts, so a reputation hit here is not contained
 * to marketing. A few hundred messages a day is slow enough that a bad signal
 * shows up in the numbers long before it can do domain-level harm — which is
 * also why the overshoot is bounded by MAX_OVERSHOOT rather than being allowed
 * to chase the target upward without limit.
 *
 * Nothing here retries a failed send. A send that fails is marked 'failed' and
 * left alone — retrying into an already-unhappy mailbox is how a soft problem
 * becomes a blocklisting.
 */
import { sendViaResend, buildUnsubscribeHeaders } from '../_shared/resendEmailClient.ts';
import { buildFollowEmail, FOLLOW_CAMPAIGNS, type FollowSegment } from '../_shared/followRequestEmail.ts';
import { corsHeaders } from '../_shared/corsHeaders.ts';
import { getSupabaseClient } from '../_shared/supabaseClient.ts';

/** Emails that must actually LAND, per tier, per day. */
const DAILY_DELIVERY_TARGET = 100;
/** Never send more than this multiple of the target, whatever the maths says. */
const MAX_OVERSHOOT = 1.6;
/** Assumed delivery rate before this tier has any measured history. */
const ASSUMED_DELIVERY_RATE = 0.92;
/** Ignore sends younger than this when measuring — they haven't resolved yet. */
const SETTLE_HOURS = 6;
/** How far back to measure the delivered/sent ratio. */
const RATE_WINDOW_DAYS = 7;

const REMINDER_AFTER_DAYS = 7;
const FROM = 'Amit from In-Sync <amit@in-sync.co.in>';
const REPLY_TO = 'amit@in-sync.co.in';
const LINK_BASE = 'https://go.in-sync.co.in';

// Resend's published rate limit is 2 requests/second. Stay under it.
const SEND_INTERVAL_MS = 600;

/**
 * Stop sending and return normally before the platform kills the request.
 *
 * Edge functions are terminated at 150s of no response bytes, and this function
 * writes nothing until the very end — so a run is "idle" for its entire length
 * however much work it is doing. At SEND_INTERVAL_MS a full two-tier run is
 * ~131s of pure sleeping plus query overhead, which sails straight past that
 * limit: the first real run died mid-way through the second tier.
 *
 * A kill is not silent data loss (every row is marked the instant its own send
 * returns, so nothing double-sends on the next run) but it does mean the reply
 * is an error page instead of the stats, which is how a partial run looks
 * identical to a total failure. Finishing early and saying so is strictly
 * better than being killed.
 */
const DEADLINE_MS = 110_000;

/**
 * Send this campaign through its own Resend account.
 *
 * The fleet's default account is on a free plan whose daily quota this campaign
 * alone exhausts — the first real run had its last 19 sends rejected outright
 * with "you have reached your daily email sending quota", which is a silent cap
 * on the campaign and, worse, a cap shared with the invoices and password
 * resets that go out from the same account.
 *
 * Splitting the accounts fixes both halves: the campaign gets a paid quota, and
 * a bad day of cold-email bounces is recorded against an account that carries
 * nothing else. The sending DOMAIN is unchanged — in-sync.co.in is verified on
 * both accounts, so the mail still comes from amit@in-sync.co.in exactly as
 * before, with no DNS change and no difference to the recipient.
 *
 * Falls back to the fleet key if unset, so a missing secret degrades to the old
 * behaviour rather than halting the campaign.
 */
const FOLLOW_RESEND_KEY = Deno.env.get('FOLLOW_RESEND_API_KEY') || undefined;

function ok(data: unknown) {
  return new Response(JSON.stringify(data), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
function err(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Row {
  id: string;
  email: string;
  first_name: string | null;
  segment: FollowSegment;
  token: string;
}

interface SendPlan {
  send: number;
  rate: number;
  measured: boolean;
  sample: number;
}

/**
 * How many to send so that DAILY_DELIVERY_TARGET actually land.
 *
 * Delivery is only knowable from Resend's webhook, which arrives minutes to
 * hours after the send — so this uses the tier's own trailing delivered/sent
 * ratio rather than trying to confirm today's deliveries in-flight. The ratio
 * self-corrects: a day with more bounces raises tomorrow's send count.
 *
 * The critical guard is the `delivered === 0` case. A silently dead webhook —
 * exactly what happened to a Resend endpoint on this account, unnoticed for a
 * week — makes every send look undelivered. Chasing that signal would multiply
 * the send volume day after day while the real deliveries were fine. So zero
 * measured deliveries is treated as "no information" and falls back to sending
 * the plain target, never more.
 */
function plannedSendCount(target: number, sent: number, delivered: number): SendPlan {
  const enoughToTrust = sent >= 30;

  // No history yet — assume a normal delivery rate and overshoot modestly.
  if (!enoughToTrust) {
    return {
      send: Math.round(target / ASSUMED_DELIVERY_RATE),
      rate: ASSUMED_DELIVERY_RATE,
      measured: false,
      sample: sent,
    };
  }

  // Plenty sent and NOTHING recorded as delivered. Far more likely a broken
  // webhook than a 100% bounce rate, so treat it as no information and send the
  // plain target rather than multiplying volume against a phantom signal.
  if (delivered === 0) {
    return { send: target, rate: 0, measured: false, sample: sent };
  }

  const rate = delivered / sent;
  const want = Math.ceil(target / rate);
  const ceiling = Math.round(target * MAX_OVERSHOOT);
  return { send: Math.min(want, ceiling), rate, measured: true, sample: sent };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = getSupabaseClient();

  const body = await req.json().catch(() => ({}));
  const dryRun = body.dry_run === true;
  // Override the delivery target for a controlled first run (a pilot), never upward.
  const target: number = Math.min(Number(body.target) || DAILY_DELIVERY_TARGET, DAILY_DELIVERY_TARGET);
  // A single address to prove the pipeline end to end without touching the queue.
  const testTo: string | null = typeof body.test_to === 'string' ? body.test_to : null;

  const { data: org } = await supabase.from('organizations').select('id').limit(1).single();
  if (!org) return err(500, 'no organization');
  const orgId = org.id;

  // --- test mode: render + send one of each variant to a named address -------
  if (testTo) {
    const out: unknown[] = [];
    for (const segment of ['leader', 'individual'] as const) {
      for (const isReminder of [false, true]) {
        const mail = buildFollowEmail({
          firstName: 'Amit',
          segment,
          followUrl: `${LINK_BASE}/f/TESTTOKEN0000000`,
          postUrl: `${LINK_BASE}/p/TESTTOKEN0000000`,
          facebookUrl: `${LINK_BASE}/b/TESTTOKEN0000000`,
          unsubscribeUrl: `${LINK_BASE}/u/TESTTOKEN0000000`,
          isReminder,
        });
        if (dryRun) {
          out.push({ segment, isReminder, subject: mail.subject, text: mail.text });
        } else {
          const r = await sendViaResend({
            from: FROM,
            to: [testTo],
            subject: `[TEST ${segment}${isReminder ? ' reminder' : ''}] ${mail.subject}`,
            html: mail.html,
            text: mail.text,
            reply_to: [REPLY_TO],
            headers: buildUnsubscribeHeaders(`${LINK_BASE}/u/TESTTOKEN0000000`),
            apiKeyOverride: FOLLOW_RESEND_KEY,
          });
          out.push({ segment, isReminder, sent: r.success, id: r.id, error: r.error });
          await sleep(SEND_INTERVAL_MS);
        }
      }
    }
    return ok({ success: true, mode: 'test', to: testTo, results: out });
  }

  const stats: Record<string, Record<string, number>> = {};
  const errors: string[] = [];

  const startedAt = Date.now();
  const outOfTime = () => Date.now() - startedAt > DEADLINE_MS;
  let ranOutOfTime = false;

  // One tier per invocation keeps a run inside the platform's window. The two
  // tiers are scheduled as separate cron workers; passing no segment still does
  // both, which is what a manual catch-up run wants.
  const only = body.segment === 'leader' || body.segment === 'individual' ? body.segment : null;
  const segments = (only ? [only] : ['leader', 'individual']) as readonly FollowSegment[];

  async function deliver(row: Row, isReminder: boolean): Promise<boolean> {
    const mail = buildFollowEmail({
      firstName: row.first_name,
      segment: row.segment,
      followUrl: `${LINK_BASE}/f/${row.token}`,
      postUrl: `${LINK_BASE}/p/${row.token}`,
      facebookUrl: `${LINK_BASE}/b/${row.token}`,
      unsubscribeUrl: `${LINK_BASE}/u/${row.token}`,
      isReminder,
    });

    const res = await sendViaResend({
      from: FROM,
      to: [row.email],
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      reply_to: [REPLY_TO],
      headers: buildUnsubscribeHeaders(`${LINK_BASE}/u/${row.token}`),
      tags: [
        // Resend tag values allow only letters, numbers, underscore and dash.
        { name: 'campaign', value: FOLLOW_CAMPAIGNS[row.segment].key },
        { name: 'stage', value: isReminder ? 'reminder' : 'first' },
      ],
      apiKeyOverride: FOLLOW_RESEND_KEY,
    });

    const now = new Date().toISOString();
    if (!res.success) {
      await supabase.from('mkt_follow_campaign')
        .update({ status: 'failed', send_error: (res.error || 'unknown').slice(0, 300) })
        .eq('id', row.id);
      errors.push(`${row.email}: ${res.error}`);
      return false;
    }

    await supabase.from('mkt_follow_campaign').update(
      isReminder
        ? { status: 'reminded', reminder_sent_at: now, reminder_message_id: res.id }
        : { status: 'sent', sent_at: now, resend_message_id: res.id },
    ).eq('id', row.id);
    return true;
  }

  for (const segment of segments) {
    stats[segment] = { new_sent: 0, reminders_sent: 0, failed: 0 };

    // Measure this tier's own delivered/sent ratio over the recent window,
    // ignoring sends too fresh to have resolved either way yet.
    const windowStart = new Date(Date.now() - RATE_WINDOW_DAYS * 86_400_000).toISOString();
    const settled = new Date(Date.now() - SETTLE_HOURS * 3_600_000).toISOString();

    const [{ count: sentCount }, { count: deliveredCount }] = await Promise.all([
      supabase.from('mkt_follow_campaign').select('id', { count: 'exact', head: true })
        .eq('org_id', orgId).eq('segment', segment)
        .gte('sent_at', windowStart).lte('sent_at', settled),
      supabase.from('mkt_follow_campaign').select('id', { count: 'exact', head: true })
        .eq('org_id', orgId).eq('segment', segment)
        .gte('sent_at', windowStart).lte('sent_at', settled)
        .not('delivered_at', 'is', null),
    ]);

    const plan = plannedSendCount(target, sentCount ?? 0, deliveredCount ?? 0);
    stats[segment].planned_send = plan.send;
    stats[segment].delivery_rate_pct = Math.round(plan.rate * 1000) / 10;
    stats[segment].rate_measured = plan.measured ? 1 : 0;
    stats[segment].rate_sample = plan.sample;

    // --- pass 1: brand new -------------------------------------------------
    const { data: fresh } = await supabase
      .from('mkt_follow_campaign')
      .select('id,email,first_name,segment,token')
      .eq('org_id', orgId)
      .eq('segment', segment)
      .eq('status', 'queued')
      .order('created_at', { ascending: true })
      .limit(plan.send);

    for (const row of (fresh || []) as Row[]) {
      if (dryRun) { stats[segment].new_sent++; continue; }
      if (outOfTime()) { ranOutOfTime = true; break; }
      const sent = await deliver(row, false);
      sent ? stats[segment].new_sent++ : stats[segment].failed++;
      await sleep(SEND_INTERVAL_MS);
    }

    // --- pass 2: the one and only reminder ---------------------------------
    const cutoff = new Date(Date.now() - REMINDER_AFTER_DAYS * 86_400_000).toISOString();
    const { data: due } = await supabase
      .from('mkt_follow_campaign')
      .select('id,email,first_name,segment,token')
      .eq('org_id', orgId)
      .eq('segment', segment)
      .eq('status', 'sent')                 // not clicked / bounced / unsubscribed
      .is('reminder_sent_at', null)         // never reminded before
      .lte('sent_at', cutoff)
      .order('sent_at', { ascending: true })
      .limit(plan.send);

    for (const row of (due || []) as Row[]) {
      if (dryRun) { stats[segment].reminders_sent++; continue; }
      if (outOfTime()) { ranOutOfTime = true; break; }
      const sent = await deliver(row, true);
      sent ? stats[segment].reminders_sent++ : stats[segment].failed++;
      await sleep(SEND_INTERVAL_MS);
    }
  }

  // Queue depth, so a drained queue is visible before it silently stops sending.
  const { count: remaining } = await supabase
    .from('mkt_follow_campaign')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('status', 'queued');

  return ok({
    success: true,
    dry_run: dryRun,
    segments,
    stats,
    // True means the run stopped short of its own plan; the leftovers stay
    // queued and the next run picks them up. Silence here is the normal case.
    stopped_early_on_time: ranOutOfTime,
    elapsed_ms: Date.now() - startedAt,
    queue_remaining: remaining ?? null,
    errors: errors.slice(0, 10),
  });
});
