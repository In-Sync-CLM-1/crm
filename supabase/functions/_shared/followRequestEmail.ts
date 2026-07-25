/**
 * Copy + HTML for the founder-sent "follow our LinkedIn page" request.
 *
 * Positioning (set by Amit, 2026-07-25): In-Sync is an AI-first solutions
 * company working the efficiency / cost / time trade-off for the SMB segment.
 * The earlier draft said "business software", which says nothing — it covers
 * both AI and conventional software and leaves the reader no reason to care.
 * The copy now states the AI-first position in plain words and, rather than
 * asserting it, points at one real post as evidence.
 *
 * Design constraints, all deliberate:
 * - Nothing is sold. No product names, no pricing, no demo link, no attachment,
 *   no gated asset. Anything else turns this into the cold sales email people
 *   delete, and the whole premise of the ask is that it isn't one.
 * - ONE button, and it is the follow. The post is an inline text link, so
 *   visual hierarchy keeps a single obvious action even though there are two
 *   places to click. The post is proof; the follow is the ask.
 * - The post link appears in the FIRST email only. The reminder stays short —
 *   re-arguing the case is what makes a second email feel like pressure.
 * - Two variants because the tiers follow for different reasons: a founder or
 *   director cares about the cost structure; an engineer or manager cares about
 *   how the work actually gets done. Same ask, different reason to care.
 * - No images at all — not even a logo. Image-heavy cold mail is a spam signal,
 *   and a blocked image makes a plain-text-feeling note look broken. This is
 *   also why the LinkedIn post is a link and not the embed iframe: no email
 *   client renders an iframe, so the embed would have shown up as nothing.
 * - Plain-text alternative ships alongside the HTML. HTML-only is itself a
 *   deliverability penalty.
 */

export type FollowSegment = 'leader' | 'individual';

/**
 * Campaign identity. One named campaign per tier — the top-up job stamps these
 * onto every row and the marketing dashboard reports on them by name, so the
 * name lives here rather than being reinvented in three places.
 */
export const FOLLOW_CAMPAIGNS: Record<FollowSegment, { key: string; name: string }> = {
  leader: {
    key: 'founder-follow-decision-makers',
    name: 'Founder Follow — Decision Makers',
  },
  individual: {
    key: 'founder-follow-practitioners',
    name: 'Founder Follow — Practitioners',
  },
};

export const LINKEDIN_PAGE_URL = 'https://www.linkedin.com/company/insyncclm/';

/**
 * The proof post: Amit's own account of running a ₹6-7 lakh/month team, losing
 * customers anyway, then rebuilding the whole product alone with AI for about
 * ₹30,000/month. It is the cost/time/efficiency argument as lived experience
 * rather than a claim, which is why it carries the first email.
 */
export const PROOF_POST_URL =
  'https://www.linkedin.com/posts/trgxtrainingexchange_6-7-lakh-a-month-thats-what-building-activity-7486190600501813248-9QKW';

/**
 * Facebook page. Asked of the practitioner tier only — that group is far more
 * likely to actually be on Facebook, and adding a second network to the
 * decision-maker email would dilute a single clean ask for no gain.
 */
export const FACEBOOK_PAGE_URL = 'https://www.facebook.com/122129596563175408';

export interface FollowEmailInput {
  firstName: string | null;
  segment: FollowSegment;
  followUrl: string;        // tracked redirect → LINKEDIN_PAGE_URL
  postUrl: string;          // tracked redirect → PROOF_POST_URL
  /** Tracked redirect → FACEBOOK_PAGE_URL. Supplied for the 'individual' tier. */
  facebookUrl?: string;
  unsubscribeUrl: string;
  isReminder: boolean;
}

export interface BuiltEmail {
  subject: string;
  html: string;
  text: string;
}

/** "Amit" if we have no usable name — never "Hi ," or "Hi there,". */
function greeting(firstName: string | null): string {
  const n = (firstName || '').trim();
  // Reject junk that would read worse than no name at all.
  if (!n || n.length < 2 || n.length > 24 || /[0-9@_]/.test(n)) return 'Hello';
  return `Hi ${n}`;
}

/**
 * Subjects lead with the specific, slightly jarring number from the post rather
 * than announcing the ask — a subject line that says "asking for a follow" gets
 * filed as marketing before it is read. The honest framing is not lost, it
 * moves to the preheader (PREHEADERS below), which every major client shows
 * next to the subject in the inbox list. So the inbox row reads as an unusual
 * hook plus an immediate "this is not a pitch" — which is the actual truth of
 * the email, in the order that gets it opened.
 *
 * Deliberately avoided: capitals, exclamation marks, "free", brackets and emoji.
 * All of them are scored as promotional, and this is sending from the domain the
 * whole product fleet relies on.
 */
const SUBJECTS: Record<FollowSegment, { first: string; reminder: string }> = {
  leader: {
    first: '₹6-7 lakh a month, and I still lost customers',
    reminder: 'One more note, then I stop',
  },
  individual: {
    first: 'I rebuilt our whole product alone. Here is what broke.',
    reminder: 'Last note from me',
  },
};

/** Inbox preview text — carries the honesty the subject deliberately omits. */
const PREHEADERS: Record<FollowSegment, string> = {
  leader: "Not a pitch. I'm asking you to follow a page, nothing else.",
  individual: "Nothing to sell. Just asking for a follow.",
};

/**
 * The body of the first email. `POST_LINK` is substituted with the inline
 * "read it" link by buildFollowEmail, so the HTML and plain-text builds can
 * render the same sentence differently without the copy diverging.
 */
function pitchLines(segment: FollowSegment): string[] {
  if (segment === 'leader') {
    return [
      "I'm Amit, founder of In-Sync. This isn't a pitch, and there's nothing to buy here.",
      "We're an AI-first company building for Indian SMBs. Everything we make is aimed at one trade-off: the same output for less cost and less time.",
      "I post about that from what I've actually lived, not theory. The last one was about the ₹6-7 lakh a month I used to spend on a team, why it lost me customers anyway, and what happened when I rebuilt the entire product alone with AI for about ₹30,000 a month — POST_LINK.",
      "If that's the kind of thing you want in your feed, following the page is the entire ask.",
    ];
  }
  return [
    "I'm Amit, founder of In-Sync. Nothing to sell here.",
    "We're an AI-first company building for Indian SMBs — the work is making the same output take less time and less money.",
    'I post about how that plays out in practice, not in theory. The last one was about running a full dev team for years, then rebuilding the whole product alone with AI — what got faster, what broke, and what it costs to run now — POST_LINK.',
    "If that's worth having in your feed, that's the whole ask.",
  ];
}

function reminderLines(segment: FollowSegment): string[] {
  if (segment === 'leader') {
    return [
      "I wrote last week asking if you'd follow In-Sync's LinkedIn page — we're an AI-first company building for Indian SMBs, and I post about the cost and time side of that. No selling.",
      "Sending this once more in case it got buried, and then I'll leave it alone either way.",
    ];
  }
  return [
    "I wrote last week asking if you'd follow In-Sync — we're an AI-first company building for Indian SMBs, and I post about how the work actually gets done.",
    "This is the second and last time I'll ask.",
  ];
}

/**
 * Bulletproof email button. Table-based with a VML fallback so it renders as a
 * real button in Outlook's Word engine, which ignores padding on <a>.
 *
 * `secondary` renders an outlined button. The practitioner email asks for two
 * follows, and two identical buttons would read as a template and split the
 * decision; one filled and one outlined keeps a single obvious primary action
 * while still making the second ask properly clickable.
 */
function button(url: string, label: string, secondary = false): string {
  const brand = secondary ? '#1877F2' : '#0A66C2';
  const fill = secondary ? '#ffffff' : brand;
  const text = secondary ? brand : '#ffffff';
  const margin = secondary ? '0 0 22px' : '26px 0 10px';
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:${margin};">
    <tr>
      <td align="center" bgcolor="${fill}" style="border-radius:6px;border:1px solid ${brand};">
        <!--[if mso]>
        <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
          href="${url}" style="height:44px;v-text-anchor:middle;width:266px;" arcsize="14%" strokecolor="${brand}" fillcolor="${fill}">
          <w:anchorlock/>
          <center style="color:${text};font-family:Arial,sans-serif;font-size:15px;font-weight:bold;">${label}</center>
        </v:roundrect>
        <![endif]-->
        <!--[if !mso]><!-- -->
        <a href="${url}"
           style="display:inline-block;padding:13px 26px;font-family:-apple-system,'Segoe UI',Arial,sans-serif;
                  font-size:15px;font-weight:600;color:${text};text-decoration:none;border-radius:6px;
                  background-color:${fill};">${label}</a>
        <!--<![endif]-->
      </td>
    </tr>
  </table>`;
}

export function buildFollowEmail(input: FollowEmailInput): BuiltEmail {
  const { firstName, segment, followUrl, postUrl, facebookUrl, unsubscribeUrl, isReminder } = input;
  const subject = isReminder ? SUBJECTS[segment].reminder : SUBJECTS[segment].first;
  const rawBody = isReminder ? reminderLines(segment) : pitchLines(segment);
  const liLabel = 'Follow In-Sync on LinkedIn';
  const fbLabel = 'Follow on Facebook';

  // Facebook is asked of the practitioner tier only, and only on the first send.
  const askFacebook = segment === 'individual' && !isReminder && !!facebookUrl;

  const closing = isReminder
    ? 'Thanks either way,'
    : "If it's not, just ignore this — I won't write again.";

  const htmlBody = rawBody.map((p) =>
    p.replace(
      'POST_LINK',
      `<a href="${postUrl}" style="color:#0A66C2;text-decoration:underline;">read it here</a>`,
    ),
  );
  const textBody = rawBody.map((p) => p.replace('POST_LINK', `read it here: ${postUrl}`));

  const paras = htmlBody
    .map((p) => `<p style="margin:0 0 15px;">${p}</p>`)
    .join('\n        ');

  const fbLine = askFacebook
    ? `<p style="margin:0 0 8px;font-size:14px;color:#4b5563;">Same posts go up on Facebook, if that's more where you are:</p>
          ${button(facebookUrl!, fbLabel, true)}`
    : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#ffffff;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${PREHEADERS[segment]}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;">
    <tr>
      <td align="left" style="padding:24px 20px;">
        <div style="max-width:540px;font-family:-apple-system,'Segoe UI',Arial,sans-serif;
                    font-size:15px;line-height:1.6;color:#1f2937;">
          <p style="margin:0 0 15px;">${greeting(firstName)},</p>
          ${paras}
          ${button(followUrl, liLabel)}
          ${fbLine}
          <p style="margin:0 0 15px;">${closing}</p>
          <p style="margin:0;">Amit<br><span style="color:#6b7280;">In-Sync</span></p>
          <div style="margin-top:30px;padding-top:14px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;line-height:1.5;">
            <p style="margin:0 0 6px;">You're receiving this because your work email is in our business contact records. It's a one-time request, not a mailing list.</p>
            <p style="margin:0;"><a href="${unsubscribeUrl}" style="color:#9ca3af;text-decoration:underline;">Don't email me again</a></p>
          </div>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    `${greeting(firstName)},`,
    '',
    ...textBody.flatMap((p) => [p, '']),
    `${liLabel}: ${followUrl}`,
    ...(askFacebook ? ['', `${fbLabel}: ${facebookUrl}`] : []),
    '',
    closing,
    '',
    'Amit',
    'In-Sync',
    '',
    '---',
    "You're receiving this because your work email is in our business contact records.",
    "It's a one-time request, not a mailing list.",
    `Don't email me again: ${unsubscribeUrl}`,
  ].join('\n');

  return { subject, html, text };
}
