import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

initializeApp();

const db = getFirestore();
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
      throw new HttpsError('resource-exhausted', 'Espera un minuto antes de enviar otra solicitud.');
    }
    transaction.set(rateLimitRef, { lastAttemptAt: FieldValue.serverTimestamp() });
  });
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

export const submitErrorReport = onCall(async (request) => {
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
  const emailStatusToken = randomBytes(32).toString('base64url');
  await reportRef.set({
    description,
    reporterEmail,
    reporterUid: request.auth?.uid ?? null,
    route,
    createdAt: FieldValue.serverTimestamp(),
    emailStatus: 'sending',
    emailStatusTokenHash: createHash('sha256').update(emailStatusToken).digest('hex'),
    reviewStatus: 'pending',
  });

  return { reportId: reportRef.id, emailStatusToken };
});

export const updateErrorReportEmailStatus = onCall(async (request) => {
  const reportId = typeof request.data?.reportId === 'string' ? request.data.reportId : '';
  const emailStatusToken = typeof request.data?.emailStatusToken === 'string' ? request.data.emailStatusToken : '';
  const emailStatus = request.data?.emailStatus;
  if (!/^[A-Za-z0-9]{20}$/.test(reportId)
    || !/^[A-Za-z0-9_-]{43}$/.test(emailStatusToken)
    || (emailStatus !== 'sent' && emailStatus !== 'failed')) {
    throw new HttpsError('invalid-argument', 'No se pudo actualizar el estado del reporte.');
  }

  const reportRef = db.doc(`errorReports/${reportId}`);
  const tokenHash = createHash('sha256').update(emailStatusToken).digest('hex');
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reportRef);
    if (!snapshot.exists) throw new HttpsError('not-found', 'No se encontró el reporte.');
    const storedHash = snapshot.get('emailStatusTokenHash');
    if (typeof storedHash !== 'string'
      || !/^[a-f0-9]{64}$/.test(storedHash)
      || !timingSafeEqual(Buffer.from(tokenHash, 'hex'), Buffer.from(storedHash, 'hex'))) {
      throw new HttpsError('permission-denied', 'No se pudo autorizar la actualización del reporte.');
    }
    if (snapshot.get('emailStatus') !== 'sending') {
      throw new HttpsError('failed-precondition', 'El estado del correo ya fue actualizado.');
    }
    transaction.update(reportRef, {
      emailStatus,
      emailStatusTokenHash: FieldValue.delete(),
    });
  });

  return { updated: true };
});
