type OutboxRow = {
  id: number;
  recipient_email: string;
  subject: string;
  html_body: string;
  attempts: number;
};

const jsonHeaders = { 'content-type': 'application/json' };

Deno.serve(async (request) => {
  if (request.method !== 'POST')
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: jsonHeaders,
    });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const from =
    Deno.env.get('RESEND_FROM_EMAIL') ??
    'AAFM Content Ops <notifications@updates.buildablelabs.com>';
  if (!supabaseUrl || !serviceRoleKey || !resendApiKey) {
    return new Response(
      JSON.stringify({ error: 'Email delivery is not configured' }),
      { status: 503, headers: jsonHeaders },
    );
  }

  const databaseHeaders = {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
    'content-type': 'application/json',
  };
  for (const job of [
    'enqueue_due_date_reminders',
    'enqueue_cadence_reminders',
  ]) {
    const result = await fetch(`${supabaseUrl}/rest/v1/rpc/${job}`, {
      method: 'POST',
      headers: databaseHeaders,
      body: '{}',
    });
    if (!result.ok)
      return new Response(
        JSON.stringify({ error: 'Could not queue reminders' }),
        { status: 502, headers: jsonHeaders },
      );
  }
  const pendingResponse = await fetch(
    `${supabaseUrl}/rest/v1/email_outbox?select=id,recipient_email,subject,html_body,attempts&status=in.(pending,failed)&attempts=lt.5&order=created_at.asc&limit=25`,
    { headers: databaseHeaders },
  );
  if (!pendingResponse.ok)
    return new Response(
      JSON.stringify({ error: 'Could not read the email outbox' }),
      { status: 502, headers: jsonHeaders },
    );
  const pending = (await pendingResponse.json()) as OutboxRow[];

  let sent = 0;
  let failed = 0;
  for (const message of pending) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${resendApiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [message.recipient_email],
        subject: message.subject,
        html: message.html_body,
      }),
    });
    const update = response.ok
      ? {
          status: 'sent',
          sent_at: new Date().toISOString(),
          attempts: message.attempts + 1,
          last_error: null,
        }
      : {
          status: 'failed',
          attempts: message.attempts + 1,
          last_error: (await response.text()).slice(0, 1000),
        };
    await fetch(`${supabaseUrl}/rest/v1/email_outbox?id=eq.${message.id}`, {
      method: 'PATCH',
      headers: databaseHeaders,
      body: JSON.stringify(update),
    });
    if (response.ok) sent += 1;
    else failed += 1;
  }

  return new Response(
    JSON.stringify({ processed: pending.length, sent, failed }),
    { headers: jsonHeaders },
  );
});
