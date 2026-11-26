import { sendSupportEmail } from '../server/resend.js';
import { isRateLimited, isSameOrigin, isValidEmail } from '../server/request-guards.js';

const plans = new Map([
  ['basico', 'Básico'],
  ['profesional', 'Profesional'],
  ['empresarial', 'Empresarial'],
]);

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Método no permitido.' });
  }
  if (!isSameOrigin(request)) return response.status(403).json({ error: 'Origen no permitido.' });
  if (isRateLimited(request, 'contact-sales')) {
    return response.status(429).json({ error: 'Espera un minuto antes de enviar otra solicitud.' });
  }

  const data = request.body && typeof request.body === 'object' ? request.body : {};
  const name = typeof data.name === 'string' ? data.name.trim() : '';
  const company = typeof data.company === 'string' ? data.company.trim() : '';
  const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
  const phone = typeof data.phone === 'string' ? data.phone.trim() : '';
  const message = typeof data.message === 'string' ? data.message.trim() : '';
  const planId = typeof data.plan === 'string' ? data.plan : '';
  const planName = plans.get(planId);

  if (data.website) return response.status(400).json({ error: 'No se pudo procesar la solicitud.' });
  if (!name || name.length > 120 || !planName) {
    return response.status(400).json({ error: 'Verifica tu nombre y el plan seleccionado.' });
  }
  if (!isValidEmail(email)) return response.status(400).json({ error: 'Verifica el correo electrónico.' });
  if (company.length > 120 || phone.length > 40 || message.length > 2000) {
    return response.status(400).json({ error: 'Verifica los datos ingresados.' });
  }

  try {
    await sendSupportEmail(
      `Solicitud comercial de Cenit: plan ${planName}`,
      [
        'Nueva solicitud de contacto comercial desde Cenit.',
        '',
        `Plan seleccionado: ${planName}`,
        `Nombre: ${name}`,
        `Empresa: ${company || 'No indicada'}`,
        `Correo: ${email}`,
        `Teléfono: ${phone || 'No indicado'}`,
        '',
        'Mensaje:',
        message || 'Sin mensaje adicional.',
      ].join('\n'),
      email,
    );
    return response.status(200).json({ sent: true });
  } catch (error) {
    console.error('Vercel contact-sales email failed', {
      planId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return response.status(503).json({ error: 'No se pudo enviar la solicitud ahora. Inténtalo más tarde.' });
  }
}
