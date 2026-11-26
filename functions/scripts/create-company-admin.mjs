import { randomBytes, randomInt } from 'node:crypto';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const companyName = process.argv[2]?.trim();
const email = process.argv[3]?.trim().toLowerCase();
const name = process.argv[4]?.trim();
if (!companyName || companyName.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email ?? '')
  || !name || name.length > 120) {
  console.error('Uso: npm run create-company-admin -- "Empresa" admin@empresa.com "Nombre del administrador"');
  process.exit(1);
}

initializeApp({ credential: applicationDefault() });
const auth = getAuth();
const db = getFirestore();

try {
  await auth.getUserByEmail(email);
  throw new Error('Ese correo ya tiene una cuenta; usa otra cuenta administradora.');
} catch (error) {
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : '';
  if (code !== 'auth/user-not-found') throw error;
}

let companyId;
do {
  companyId = randomInt(1_000_000_000, 10_000_000_000).toString();
} while ((await db.doc(`companies/${companyId}`).get()).exists);

let user;
let companyCreated = false;
let profileCreated = false;
const companyRef = db.doc(`companies/${companyId}`);
const passwordSetupPath = resolve('secrets', `${companyId}-admin-password-setup-link.txt`);

try {
  user = await auth.createUser({
    email,
    displayName: name,
    password: randomBytes(32).toString('base64url'),
    disabled: false,
  });
  await auth.setCustomUserClaims(user.uid, { role: 'admin', active: true, companyId });
  await companyRef.create({
    companyId,
    name: companyName,
    active: true,
    createdAt: FieldValue.serverTimestamp(),
  });
  companyCreated = true;
  const userRef = db.doc(`users/${user.uid}`);
  await userRef.create({
    uid: user.uid,
    companyId,
    name,
    email,
    department: '',
    role: 'admin',
    active: true,
    createdAt: FieldValue.serverTimestamp(),
  });
  profileCreated = true;

  const passwordSetupLink = await auth.generatePasswordResetLink(email);
  await mkdir(resolve('secrets'), { recursive: true });
  await writeFile(passwordSetupPath, `${passwordSetupLink}\n`, { mode: 0o600 });
  await chmod(passwordSetupPath, 0o600);
} catch (error) {
  const cleanup = [];
  if (profileCreated && user) cleanup.push(db.doc(`users/${user.uid}`).delete());
  if (companyCreated) cleanup.push(companyRef.delete());
  if (user) cleanup.push(auth.deleteUser(user.uid));
  const cleanupResults = await Promise.allSettled(cleanup);
  if (cleanupResults.some((result) => result.status === 'rejected')) {
    console.error('No se pudo completar toda la limpieza de la empresa o cuenta creada.');
  }
  throw error;
}

console.log(`Empresa: ${companyName}`);
console.log(`ID de empresa: ${companyId}`);
console.log(`Administrador: ${email}`);
console.log(`Enlace de configuración guardado localmente en: ${passwordSetupPath}`);
