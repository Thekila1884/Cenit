import { HttpError } from './http-error.js';

const roles = new Set(['admin', 'agent', 'user']);

export function isValidCompanyId(value) {
  return typeof value === 'string' && /^\d{10}$/.test(value);
}

export function hasAuthorizationHeader(request) {
  return typeof request.headers.authorization === 'string' && request.headers.authorization.length > 0;
}

export async function requireTenantUser(request, auth, db) {
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.authorization ?? '');
  if (!match) throw new HttpError(401, 'Inicia sesión para continuar.');

  let claims;
  try {
    claims = await auth.verifyIdToken(match[1]);
  } catch {
    throw new HttpError(401, 'La sesión no es válida. Inicia sesión nuevamente.');
  }

  const uid = claims.uid;
  const companyId = claims.companyId;
  const role = claims.role;
  if (claims.active !== true || !roles.has(role) || !isValidCompanyId(companyId)) {
    throw new HttpError(403, 'La cuenta no tiene acceso activo.');
  }

  const profileSnapshot = await db.doc(`users/${uid}`).get();
  if (!profileSnapshot.exists) throw new HttpError(403, 'El perfil no está autorizado.');
  const profile = profileSnapshot.data();
  if (profile.uid !== uid || profile.active !== true || profile.role !== role || profile.companyId !== companyId) {
    throw new HttpError(403, 'El perfil no está autorizado para esta empresa.');
  }
  const companySnapshot = await db.doc(`companies/${companyId}`).get();
  if (!companySnapshot.exists || companySnapshot.get('active') !== true) {
    throw new HttpError(403, 'La empresa no está activa.');
  }

  return { uid, companyId, role, email: profile.email };
}
