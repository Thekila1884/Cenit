import { randomBytes } from 'node:crypto';
import { chmod, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const email = process.argv[2]?.trim().toLowerCase();
const requestedName = process.argv[3]?.trim();
const companyId = process.argv[4]?.trim();
if (!email || !/^\d{10}$/.test(companyId ?? '')) {
  console.error('Uso: npm run set-admin -- correo@empresa.com "Nombre del administrador" id-de-empresa');
  process.exitCode = 1;
} else {
  initializeApp({ credential: applicationDefault() });
  const auth = getAuth();
  const db = getFirestore();
  const companySnapshot = await db.doc(`companies/${companyId}`).get();
  if (!companySnapshot.exists || companySnapshot.get('active') !== true) {
    throw new Error('El ID de empresa no existe o no está activo.');
  }
  let user;
  let created = false;

  try {
    user = await auth.getUserByEmail(email);
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : '';
    if (code !== 'auth/user-not-found') throw error;
    user = await auth.createUser({
      email,
      displayName: requestedName || email.split('@')[0],
      password: randomBytes(32).toString('base64url'),
    });
    created = true;
  }

  const name = requestedName || user.displayName || email.split('@')[0];
  const profileRef = db.doc(`users/${user.uid}`);
  const existingProfile = await profileRef.get();
  if (existingProfile.exists
    && existingProfile.get('companyId')
    && existingProfile.get('companyId') !== companyId) {
    throw new Error('El usuario ya pertenece a otra empresa; usa la migración administrativa correspondiente.');
  }
  try {
    const passwordSetupLink = await auth.generatePasswordResetLink(email);
    const passwordSetupPath = resolve('secrets/admin-password-setup-link.txt');
    await writeFile(passwordSetupPath, `${passwordSetupLink}\n`, { mode: 0o600 });
    await chmod(passwordSetupPath, 0o600);

    await auth.updateUser(user.uid, { displayName: name });
    const currentClaims = user.customClaims ?? {};
    await auth.setCustomUserClaims(user.uid, { ...currentClaims, role: 'admin', active: true, companyId });
    await profileRef.set({
      uid: user.uid,
      companyId,
      name,
      email,
      department: '',
      role: 'admin',
      active: true,
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    console.log(created ? `Cuenta administradora creada: ${email}` : `Rol administrador asignado a: ${email}`);
    console.log(`Enlace de configuración guardado localmente en: ${passwordSetupPath}`);
    console.log('Vuelve a iniciar sesión para renovar los permisos.');
  } catch (error) {
    if (created) {
      const cleanup = await Promise.allSettled([
        auth.deleteUser(user.uid),
        db.doc(`users/${user.uid}`).delete(),
      ]);
      if (cleanup.some((result) => result.status === 'rejected')) {
        console.error('No se pudo completar la limpieza de la cuenta creada.');
      }
    }
    throw error;
  }
}
