export const dynamic = 'force-dynamic';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

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

  const inquiry = {
    name,
    email,
    organization: String(body.organization ?? '').trim(),
    handle: String(body.handle ?? '').trim(),
    type: String(body.type ?? '').trim(),
    message,
    receivedAt: new Date().toISOString(),
  };

  // Forward to a webhook (Slack/Discord/CRM) when configured; otherwise record it.
  const webhook = process.env.PARTNER_WEBHOOK_URL;
  if (webhook) {
    try {
      await fetch(webhook, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(inquiry),
      });
    } catch {
      // Never fail the user because a downstream webhook is unavailable.
    }
  } else {
    console.log('[partner inquiry]', inquiry);
  }

  return Response.json({ ok: true });
}
