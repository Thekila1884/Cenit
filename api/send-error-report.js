import { sendSupportEmail } from '../server/resend.js';
import { getFirebaseAdmin } from '../server/firebase-admin.js';
import { HttpError } from '../server/http-error.js';
import { isRateLimited, isSameOrigin, isValidEmail } from '../server/request-guards.js';
import { hasAuthorizationHeader, isValidCompanyId, requireTenantUser } from '../server/tenant-auth.js';
import { FieldValue } from 'firebase-admin/firestore';

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
  const description = typeof data.description === 'string' ? data.description.trim() : '';
  const email = typeof data.email === 'string' ? data.email.trim() : '';
  const route = typeof data.route === 'string' ? data.route.slice(0, 120) : '';
  const requestedCompanyId = typeof data.companyId === 'string' ? data.companyId.trim() : '';

  if (data.website) return response.status(400).json({ error: 'No se pudo procesar el reporte.' });
  if (!description || description.length > 2000 || !isValidCompanyId(requestedCompanyId)) {
    return response.status(400).json({ error: 'Verifica la descripción del error.' });
  }
  if (email && !isValidEmail(email)) return response.status(400).json({ error: 'Verifica el correo de contacto.' });

  try {
    const { auth, db } = getFirebaseAdmin();
    const reporter = hasAuthorizationHeader(request)
      ? await requireTenantUser(request, auth, db)
      : null;
    if (reporter && reporter.companyId !== requestedCompanyId) {
      throw new HttpError(403, 'El reporte no corresponde a la empresa de tu perfil.');
    }

    const companyId = reporter?.companyId ?? requestedCompanyId;
    const companySnapshot = await db.doc(`companies/${companyId}`).get();
    if (!companySnapshot.exists || companySnapshot.get('active') !== true) {
      throw new HttpError(400, 'Verifica el ID de empresa.');
    }
    const companyName = typeof companySnapshot.get('name') === 'string'
      ? companySnapshot.get('name')
      : companyId;

    const reportRef = db.collection('errorReports').doc();
    await reportRef.set({
      description,
      reporterEmail: email || reporter?.email || null,
      reporterUid: reporter?.uid ?? null,
      companyId,
      route,
      createdAt: FieldValue.serverTimestamp(),
      emailStatus: 'sending',
      reviewStatus: 'pending',
    });

    let sent = false;
    try {
      await sendSupportEmail(
        'Nuevo reporte de error en Cenit',
        [
          'Se recibió un nuevo reporte de error en Cenit.',
          '',
          `Reporte: ${reportRef.id}`,
          `Empresa: ${companyName} (${companyId})`,
          `Correo de contacto: ${email || reporter?.email || 'No indicado'}`,
          `Pantalla: ${route || 'No especificada'}`,
          '',
          'Descripción:',
          description,
        ].join('\n'),
      );
      sent = true;
    } catch (error) {
      console.error('Vercel error-report email failed', {
        reportId: reportRef.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    await reportRef.update({ emailStatus: sent ? 'sent' : 'failed' });
    return response.status(200).json({
      saved: true,
      sent,
      reportId: reportRef.id,
      ...(sent ? {} : { message: 'El reporte se guardó, pero no se pudo enviar el correo.' }),
    });
  } catch (error) {
    if (error instanceof HttpError) return response.status(error.status).json({ error: error.message });
    console.error('Vercel error-report request failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return response.status(503).json({ error: 'No se pudo guardar el reporte ahora.' });
  }
}
