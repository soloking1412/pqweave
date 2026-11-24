export const dynamic = 'force-dynamic';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

interface Inquiry {
  name: string;
  email: string;
  organization: string;
  handle: string;
  type: string;
  message: string;
  receivedAt: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Send the inquiry to the team inbox via Resend's REST API (no SDK needed).
// reply_to is the submitter so a reply from the inbox goes straight back to them.
async function sendEmail(inquiry: Inquiry): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.PARTNER_NOTIFY_TO;
  if (!apiKey || !to) return false;

  // onboarding@resend.dev works with no domain setup, but only delivers to the
  // address that owns the Resend account. Set PARTNER_NOTIFY_FROM to a verified
  // domain sender to reach any inbox.
  const from = process.env.PARTNER_NOTIFY_FROM ?? 'PQWeave <onboarding@resend.dev>';

  const rows: Array<[string, string]> = [
    ['Name', inquiry.name],
    ['Email', inquiry.email],
    ['Organization', inquiry.organization || '—'],
    ['Telegram / X', inquiry.handle || '—'],
    ['Building', inquiry.type || '—'],
  ];
  const table = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 16px 4px 0;color:#71717a;white-space:nowrap">${k}</td>` +
        `<td style="padding:4px 0;color:#18181b"><strong>${escapeHtml(v)}</strong></td></tr>`,
    )
    .join('');

  const html = `<div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:560px">
    <h2 style="margin:0 0 4px;font-size:18px;color:#18181b">New partner inquiry</h2>
    <p style="margin:0 0 16px;color:#71717a;font-size:13px">Received ${escapeHtml(inquiry.receivedAt)}</p>
    <table style="border-collapse:collapse;font-size:14px">${table}</table>
    <p style="margin:16px 0 4px;color:#71717a;font-size:13px">Message</p>
    <p style="margin:0;white-space:pre-wrap;color:#18181b;font-size:14px;line-height:1.5">${escapeHtml(
      inquiry.message,
    )}</p>
  </div>`;

  const text =
    `New partner inquiry (${inquiry.receivedAt})\n\n` +
    rows.map(([k, v]) => `${k}: ${v}`).join('\n') +
    `\n\nMessage:\n${inquiry.message}\n`;

  const subject = `Partner inquiry, ${inquiry.name}${
    inquiry.organization ? ` (${inquiry.organization})` : ''
  }`;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: to.split(',').map((address) => address.trim()),
        reply_to: inquiry.email,
        subject,
        html,
        text,
      }),
    });
    if (!response.ok) {
      console.error('[partner] Resend send failed', response.status, await response.text());
      return false;
    }
    return true;
  } catch (error) {
    console.error('[partner] Resend request error', error);
    return false;
  }
}

async function sendWebhook(inquiry: Inquiry): Promise<boolean> {
  const webhook = process.env.PARTNER_WEBHOOK_URL;
  if (!webhook) return false;
  try {
    await fetch(webhook, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(inquiry),
    });
    return true;
  } catch {
    // Never fail the user because a downstream webhook is unavailable.
    return false;
  }
}

export async function POST(request: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const name = String(body.name ?? '').trim();
  const email = String(body.email ?? '').trim();
  const message = String(body.message ?? '').trim();

  if (!name || !email || !message) {
    return Response.json(
      { error: 'Name, email, and a short message are required.' },
      { status: 400 },
    );
  }
  if (!EMAIL.test(email)) {
    return Response.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }

  const inquiry: Inquiry = {
    name,
    email,
    organization: String(body.organization ?? '').trim(),
    handle: String(body.handle ?? '').trim(),
    type: String(body.type ?? '').trim(),
    message,
    receivedAt: new Date().toISOString(),
  };

  // Best-effort delivery across every configured channel. Always log a record so
  // an inquiry is recoverable from server logs even if all channels are down.
  const [emailed, hooked] = await Promise.all([sendEmail(inquiry), sendWebhook(inquiry)]);
  console.log('[partner inquiry]', { emailed, hooked, ...inquiry });

  return Response.json({ ok: true });
}
