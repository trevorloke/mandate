// Outbound notifications — email + SMS behind provider-pluggable adapters.
// No SDKs: plain fetch against provider REST APIs, so there are zero new
// dependencies and a missing provider degrades to an honest 'queued' status:
// nothing was sent and nothing sends by itself. The message is kept, and once
// the provider is configured a person sends it — blast.resend ("Send now")
// for newsletters and press, shift.notify again ("Notify again") for shifts.
//
//   Email: set RESEND_API_KEY (+ optional MAIL_FROM, default onboarding@resend.dev)
//   SMS:   set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM

export const emailConfigured = () => !!process.env.RESEND_API_KEY;
export const textConfigured = () =>
  !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM);

export const sendEmail = async ({ to, subject, text }) => {
  if (!emailConfigured()) {
    return { sent: false, status: 'queued', detail: 'no email provider configured (set RESEND_API_KEY)' };
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.MAIL_FROM || 'onboarding@resend.dev',
        to: [to],
        subject,
        text,
      }),
    });
    if (!res.ok) {
      return { sent: false, status: 'failed', detail: `email provider ${res.status}: ${(await res.text()).slice(0, 200)}` };
    }
    return { sent: true, status: 'sent' };
  } catch (e) {
    return { sent: false, status: 'failed', detail: String(e.message).slice(0, 200) };
  }
};

export const sendText = async ({ to, body }) => {
  if (!textConfigured()) {
    return { sent: false, status: 'queued', detail: 'no SMS provider configured (set TWILIO_ACCOUNT_SID/AUTH_TOKEN/FROM)' };
  }
  try {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const auth = Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
    const form = new URLSearchParams({ To: to, From: process.env.TWILIO_FROM, Body: body });
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });
    if (!res.ok) {
      return { sent: false, status: 'failed', detail: `sms provider ${res.status}: ${(await res.text()).slice(0, 200)}` };
    }
    return { sent: true, status: 'sent' };
  } catch (e) {
    return { sent: false, status: 'failed', detail: String(e.message).slice(0, 200) };
  }
};

// Shift notification copy: time, place, instructions, link — one message,
// both channels.
// Times render in the campaign's zone, never the server's (a UTC host would
// otherwise tell Surrey volunteers the wrong hour).
export const shiftMessage = (shift, workspaceName, timeZone = 'America/Vancouver') => {
  const when = new Date(shift.starts_at).toLocaleString('en-CA', {
    weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone,
  });
  const lines = [
    `You're scheduled: ${shift.title}`,
    when + (shift.ends_at ? ` – ${new Date(shift.ends_at).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit', timeZone })}` : ''),
    shift.location ? `Where: ${shift.location}` : null,
    shift.instructions ? `Instructions: ${shift.instructions}` : null,
    shift.link ? `Details: ${shift.link}` : null,
    `— ${workspaceName}`,
  ].filter(Boolean);
  return lines.join('\n');
};
