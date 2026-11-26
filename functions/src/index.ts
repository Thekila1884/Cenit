import { createHash, randomBytes } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { defineSecret, defineString } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

initializeApp();

const db = getFirestore();
const resendApiKey = defineSecret('RESEND_API_KEY');
const resendFromEmail = defineString('RESEND_FROM_EMAIL', {
  default: 'Cenit <soporte@vendedores.site>',
});
const reportRecipient = 'soporte@vendedores.site';
const roles = ['admin', 'agent', 'user'] as const;
type Role = (typeof roles)[number];

async function applyRateLimit(collectionName: string, ipAddress: string) {
  const key = createHash('sha256').update(ipAddress).digest('hex');
  const rateLimitRef = db.doc(`${collectionName}/${key}`);
  const now = Date.now();

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(rateLimitRef);
    const previousAttempt = snapshot.get('lastAttemptAt')?.toMillis();
    if (previousAttempt && now - previousAttempt < 60_000) {
      throw new HttpsError('resource-exhausted', 'Espera un minuto antes de enviar otro reporte.');
    }
    transaction.set(rateLimitRef, { lastAttemptAt: FieldValue.serverTimestamp() });
  });
}

async function sendSupportEmail(subject: string, text: string, replyTo?: string) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey.value()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: resendFromEmail.value(),
      to: [reportRecipient],
      subject,
      text,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Resend respondió con el estado ${response.status}.`);
}

export const inviteUser = onCall(async (request) => {
    if (!request.auth || request.auth.token.active !== true || request.auth.token.role !== 'admin') {
      throw new HttpsError('permission-denied', 'Solo un administrador activo puede invitar usuarios.');
    }

    const email = typeof request.data?.email === 'string' ? request.data.email.trim().toLowerCase() : '';
    const name = typeof request.data?.name === 'string' ? request.data.name.trim() : '';
    const department = typeof request.data?.department === 'string' ? request.data.department.trim() : '';
    const role = request.data?.role as Role;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name || name.length > 120 || department.length > 120 || !roles.includes(role)) {
      throw new HttpsError('invalid-argument', 'Verifica nombre, correo, departamento y rol.');
    }

    let uid: string | undefined;
    try {
      const user = await getAuth().createUser({
        email,
        displayName: name,
        password: randomBytes(32).toString('base64url'),
        disabled: false,
      });
      uid = user.uid;

      await getAuth().setCustomUserClaims(uid, { role, active: true });
      await db.doc(`users/${uid}`).set({
        uid,
        name,
        email,
        department,
        role,
        active: true,
        createdAt: FieldValue.serverTimestamp(),
      });

      const passwordSetupLink = await getAuth().generatePasswordResetLink(email);
      return { email, passwordSetupLink };
    } catch (error) {
      if (uid) {
        await getAuth().deleteUser(uid);
        await db.doc(`users/${uid}`).delete();
      }
      if (error instanceof HttpsError) throw error;
      console.error('Failed to invite user', error);
      throw new HttpsError('internal', 'No se pudo completar la invitación.');
    }
});

export const submitErrorReport = onCall({ secrets: [resendApiKey] }, async (request) => {
  if (request.auth && request.auth.token.active !== true) {
    throw new HttpsError('permission-denied', 'La cuenta no está activa.');
  }

  const description = typeof request.data?.description === 'string'
    ? request.data.description.trim()
    : '';
  const inputEmail = typeof request.data?.email === 'string' ? request.data.email.trim() : '';
  const route = typeof request.data?.route === 'string' ? request.data.route.slice(0, 120) : '';
  const reporterEmail = inputEmail || null;

  if (!description || description.length > 2000) {
    throw new HttpsError('invalid-argument', 'Describe el error en un máximo de 2000 caracteres.');
  }
  if (reporterEmail && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reporterEmail) || reporterEmail.length > 254)) {
    throw new HttpsError('invalid-argument', 'Verifica el correo de contacto.');
  }

  await applyRateLimit('errorReportRateLimits', request.rawRequest.ip || 'unknown');

  const reportRef = db.collection('errorReports').doc();
  await reportRef.set({
    description,
    reporterEmail,
    reporterUid: request.auth?.uid ?? null,
    route,
    createdAt: FieldValue.serverTimestamp(),
    emailStatus: 'sending',
    reviewStatus: 'pending',
  });

  let emailSent = false;
  try {
    await sendSupportEmail(
      'Nuevo reporte de error en Cenit',
      [
        'Se recibió un nuevo reporte de error en Cenit.',
        '',
        `Reporte: ${reportRef.id}`,
        `Correo de contacto: ${reporterEmail ?? 'No indicado'}`,
        `UID: ${request.auth?.uid ?? 'No autenticado'}`,
        `Pantalla: ${route || 'No especificada'}`,
        '',
        'Descripción:',
        description,
      ].join('\n'),
    );
    await reportRef.update({ emailStatus: 'sent' });
    emailSent = true;
  } catch (error) {
    console.error('Failed to send error report email', {
      reportId: reportRef.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    await reportRef.update({ emailStatus: 'failed' });
  }

  return { reportId: reportRef.id, emailSent };
});

export const contactSales = onCall({ secrets: [resendApiKey] }, async (request) => {
  const name = typeof request.data?.name === 'string' ? request.data.name.trim() : '';
  const company = typeof request.data?.company === 'string' ? request.data.company.trim() : '';
  const email = typeof request.data?.email === 'string' ? request.data.email.trim().toLowerCase() : '';
  const phone = typeof request.data?.phone === 'string' ? request.data.phone.trim() : '';
  const message = typeof request.data?.message === 'string' ? request.data.message.trim() : '';
  const planNames: Record<string, string> = {
    basico: 'Básico',
    profesional: 'Profesional',
    empresarial: 'Empresarial',
  };
  const planId = typeof request.data?.plan === 'string' ? request.data.plan : '';
  const planName = Object.hasOwn(planNames, planId) ? planNames[planId] : undefined;

  if (!name || name.length > 120 || !planName) {
    throw new HttpsError('invalid-argument', 'Verifica tu nombre y el plan seleccionado.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new HttpsError('invalid-argument', 'Verifica el correo electrónico.');
  }
  if (company.length > 120 || phone.length > 40 || message.length > 2000) {
    throw new HttpsError('invalid-argument', 'Verifica los datos ingresados.');
  }

  await applyRateLimit('salesContactRateLimits', request.rawRequest.ip || 'unknown');

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
    return { sent: true };
  } catch (error) {
    console.error('Failed to send Cenit sales contact email', {
      planId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new HttpsError('unavailable', 'No se pudo enviar la solicitud ahora. Inténtalo más tarde.');
  }
});
