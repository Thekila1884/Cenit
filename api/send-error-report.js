import { sendSupportEmail } from '../server/resend.js';
import { isRateLimited, isSameOrigin, isValidEmail } from '../server/request-guards.js';

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Método no permitido.' });
  }
  if (!isSameOrigin(request)) return response.status(403).json({ error: 'Origen no permitido.' });
  if (isRateLimited(request, 'error-report')) {
    return response.status(429).json({ error: 'Espera un minuto antes de enviar otro reporte.' });
  }

  const data = request.body && typeof request.body === 'object' ? request.body : {};
  const reportId = typeof data.reportId === 'string' ? data.reportId : '';
  const description = typeof data.description === 'string' ? data.description.trim() : '';
  const email = typeof data.email === 'string' ? data.email.trim() : '';
  const route = typeof data.route === 'string' ? data.route.slice(0, 120) : '';

  if (data.website) return response.status(400).json({ error: 'No se pudo procesar el reporte.' });
  if (!/^[A-Za-z0-9]{20}$/.test(reportId) || !description || description.length > 2000) {
    return response.status(400).json({ error: 'Verifica la descripción del error.' });
  }
  if (email && !isValidEmail(email)) return response.status(400).json({ error: 'Verifica el correo de contacto.' });

  try {
    await sendSupportEmail(
      'Nuevo reporte de error en Cenit',
      [
        'Se recibió un nuevo reporte de error en Cenit.',
        '',
        `Reporte: ${reportId}`,
        `Correo de contacto: ${email || 'No indicado'}`,
        `Pantalla: ${route || 'No especificada'}`,
        '',
        'Descripción:',
        description,
      ].join('\n'),
    );
    return response.status(200).json({ sent: true });
  } catch (error) {
    console.error('Vercel error-report email failed', {
      reportId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return response.status(503).json({ error: 'El reporte quedó guardado, pero no se pudo enviar el correo.' });
  }
}
