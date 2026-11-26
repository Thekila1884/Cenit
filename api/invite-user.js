import { randomBytes } from 'node:crypto';
import { getFirebaseAdmin } from '../server/firebase-admin.js';
import { HttpError } from '../server/http-error.js';
import { isRateLimited, isSameOrigin, isValidEmail } from '../server/request-guards.js';
import { sendEmail } from '../server/resend.js';
import { requireTenantUser } from '../server/tenant-auth.js';

const roles = new Set(['admin', 'agent', 'user']);

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Método no permitido.' });
  }
  if (!isSameOrigin(request)) return response.status(403).json({ error: 'Origen no permitido.' });
  if (isRateLimited(request, 'invite-user')) {
    return response.status(429).json({ error: 'Espera un minuto antes de enviar otra invitación.' });
  }

  const data = request.body && typeof request.body === 'object' ? request.body : {};
  const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
  const name = typeof data.name === 'string' ? data.name.trim() : '';
  const department = typeof data.department === 'string' ? data.department.trim() : '';
  const role = typeof data.role === 'string' ? data.role : '';
  if (!isValidEmail(email) || !name || name.length > 120 || department.length > 120 || !roles.has(role)) {
    return response.status(400).json({ error: 'Verifica nombre, correo, departamento y rol.' });
  }

  const requestId = typeof request.headers['x-vercel-id'] === 'string'
    ? request.headers['x-vercel-id']
    : 'unavailable';
  const logProgress = (event) => console.log('Vercel invite-user progress', { requestId, event });
  logProgress('request-accepted');

  let failureStage = 'firebase-admin';
  try {
    const { auth, db, FieldValue } = await getFirebaseAdmin();
    logProgress('firebase-admin-ready');
    failureStage = 'authenticate-inviter';
    const inviter = await requireTenantUser(request, auth, db);
    logProgress('inviter-authenticated');
    if (inviter.role !== 'admin') throw new HttpError(403, 'Solo un administrador puede invitar usuarios.');

    failureStage = 'check-company';
    const companySnapshot = await db.doc(`companies/${inviter.companyId}`).get();
    if (!companySnapshot.exists || companySnapshot.get('active') !== true) {
      throw new HttpError(409, 'La empresa asociada no está configurada o activa.');
    }
    const companyName = typeof companySnapshot.get('name') === 'string'
      ? companySnapshot.get('name')
      : inviter.companyId;
    logProgress('company-verified');

    let uid;
    try {
      failureStage = 'create-account';
      const user = await auth.createUser({
        email,
        displayName: name,
        password: randomBytes(32).toString('base64url'),
        disabled: false,
      });
      uid = user.uid;
      logProgress('account-created');

      failureStage = 'assign-claims';
      await auth.setCustomUserClaims(uid, { role, active: true, companyId: inviter.companyId });
      logProgress('claims-assigned');
      failureStage = 'save-profile';
      await db.doc(`users/${uid}`).set({
        uid,
        name,
        email,
        department,
        role,
        active: true,
        companyId: inviter.companyId,
        createdAt: FieldValue.serverTimestamp(),
      });
      logProgress('profile-saved');

      failureStage = 'generate-password-link';
      const passwordSetupLink = await auth.generatePasswordResetLink(email);
      logProgress('password-link-created');
      const loginUrl = new URL('/#/login', request.headers.origin).toString();
      failureStage = 'send-invitation-email';
      await sendEmail(
        email,
        'Tu invitación para acceder a Cenit',
        [
          `Hola ${name},`,
          '',
          `Un administrador de ${companyName} te invitó a usar Cenit.`,
          'Para activar tu acceso y establecer una contraseña, abre este enlace:',
          passwordSetupLink,
          '',
          `ID de empresa: ${inviter.companyId}`,
          `Después, inicia sesión en: ${loginUrl}`,
          '',
          'Si no esperabas esta invitación, puedes ignorar este mensaje.',
        ].join('\n'),
      );
      logProgress('invitation-email-sent');
      return response.status(201).json({ email, sent: true });
    } catch (error) {
      const failedAt = failureStage;
      if (uid) {
        failureStage = 'rollback-invitation';
        logProgress('rollback-started');
        await Promise.all([
          auth.deleteUser(uid),
          db.doc(`users/${uid}`).delete(),
        ]);
        logProgress('rollback-completed');
      }
      failureStage = failedAt;
      const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : '';
      if (code === 'auth/email-already-exists') {
        throw new HttpError(409, 'Ya existe una cuenta con ese correo.');
      }
      throw error;
    }
  } catch (error) {
    if (error instanceof HttpError) {
      console.warn('Vercel invite-user request rejected', {
        requestId,
        stage: failureStage,
        status: error.status,
      });
      return response.status(error.status).json({ error: error.message });
    }
    console.error('Vercel invite-user request failed', {
      requestId,
      stage: failureStage,
      errorCode: typeof error === 'object' && error !== null && 'code' in error
        && typeof error.code === 'string'
        ? error.code
        : 'unknown',
      diagnosticCode: typeof error === 'object' && error !== null
        && 'diagnosticCode' in error && typeof error.diagnosticCode === 'string'
        ? error.diagnosticCode
        : 'unknown',
      causeCode: typeof error === 'object' && error !== null
        && 'causeCode' in error && typeof error.causeCode === 'string'
        ? error.causeCode
        : 'unknown',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return response.status(503).json({
      error: 'No se pudo completar la invitación ahora.',
      code: failureStage,
      detailCode: typeof error === 'object' && error !== null
        && 'diagnosticCode' in error && typeof error.diagnosticCode === 'string'
        ? error.diagnosticCode
        : 'unknown',
      causeCode: typeof error === 'object' && error !== null
        && 'causeCode' in error && typeof error.causeCode === 'string'
        ? error.causeCode
        : 'unknown',
    });
  }
}
