const recipient = 'soporte@vendedores.site';
const defaultSender = 'Cenit <soporte@vendedores.site>';

export async function sendEmail(to, subject, text, replyTo) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY no está configurada en Vercel.');

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL || defaultSender,
      to: [to],
      subject,
      text,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) throw new Error(`Resend respondió con el estado ${response.status}.`);
}

export async function sendSupportEmail(subject, text, replyTo) {
  return sendEmail(recipient, subject, text, replyTo);
}
