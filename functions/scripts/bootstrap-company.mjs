import { randomInt } from 'node:crypto';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const companyName = process.argv[2]?.trim() || 'Vendors, S.A.';
const requestedCompanyId = process.argv[3]?.trim();
if (!companyName || companyName.length > 120 || (requestedCompanyId && !/^\d{10}$/.test(requestedCompanyId))) {
  console.error('Uso: node --env-file=.env functions/scripts/bootstrap-company.mjs "Vendors, S.A." [id-de-10-digitos]');
  process.exit(1);
}

initializeApp({ credential: applicationDefault() });
const auth = getAuth();
const db = getFirestore();
const [companiesSnapshot, usersSnapshot, ticketsSnapshot, reportsSnapshot] = await Promise.all([
  db.collection('companies').get(),
  db.collection('users').get(),
  db.collection('tickets').get(),
  db.collection('errorReports').get(),
]);

const matchingCompanies = companiesSnapshot.docs.filter((snapshot) => snapshot.get('name') === companyName);
if (matchingCompanies.length > 1) throw new Error('Hay más de una empresa con ese nombre; resuélvelo antes de migrar.');

const existingIds = new Set([
  ...usersSnapshot.docs.map((snapshot) => snapshot.get('companyId')),
  ...ticketsSnapshot.docs.map((snapshot) => snapshot.get('companyId')),
  ...reportsSnapshot.docs.map((snapshot) => snapshot.get('companyId')),
].filter((value) => typeof value === 'string'));
if (existingIds.size > 1) throw new Error('Los datos existentes ya tienen varios IDs de empresa; no se modificó nada.');

const existingCompanyId = matchingCompanies[0]?.id ?? existingIds.values().next().value;
if (requestedCompanyId && existingCompanyId && requestedCompanyId !== existingCompanyId) {
  throw new Error('El ID indicado no coincide con los datos existentes; no se modificó nada.');
}

let companyId = requestedCompanyId || existingCompanyId;
if (!companyId) {
  do {
    companyId = randomInt(1_000_000_000, 10_000_000_000).toString();
  } while (companiesSnapshot.docs.some((snapshot) => snapshot.id === companyId));
}

const companyRef = db.doc(`companies/${companyId}`);
const companySnapshot = await companyRef.get();
if (companySnapshot.exists && companySnapshot.get('name') !== companyName) {
  throw new Error('El ID generado ya pertenece a otra empresa; vuelve a ejecutar el comando.');
}
if (companySnapshot.exists && companySnapshot.get('active') === false) {
  throw new Error('La empresa está desactivada; actívala explícitamente antes de migrar.');
}

const users = await Promise.all(usersSnapshot.docs.map(async (snapshot) => {
  const user = snapshot.data();
  if (user.uid !== snapshot.id || !['admin', 'agent', 'user'].includes(user.role) || typeof user.active !== 'boolean') {
    throw new Error('Hay un perfil de usuario inválido; no se modificó nada.');
  }
  if (user.companyId && user.companyId !== companyId) {
    throw new Error('Hay usuarios asociados a otra empresa; no se modificó nada.');
  }
  const authUser = await auth.getUser(snapshot.id);
  return { ref: snapshot.ref, user, authUser };
}));

for (const snapshot of [...ticketsSnapshot.docs, ...reportsSnapshot.docs]) {
  const existingCompanyIdForRecord = snapshot.get('companyId');
  if (existingCompanyIdForRecord && existingCompanyIdForRecord !== companyId) {
    throw new Error('Hay tickets o reportes asociados a otra empresa; no se modificó nada.');
  }
}

await companyRef.set({
  companyId,
  name: companyName,
  active: true,
  createdAt: companySnapshot.get('createdAt') ?? FieldValue.serverTimestamp(),
}, { merge: true });

const writer = db.bulkWriter();
for (const { ref } of users) writer.update(ref, { companyId });
for (const snapshot of ticketsSnapshot.docs) writer.update(snapshot.ref, { companyId });
for (const snapshot of reportsSnapshot.docs) writer.update(snapshot.ref, { companyId });
await writer.close();

await Promise.all(users.map(({ user, authUser }) => auth.setCustomUserClaims(authUser.uid, {
  ...authUser.customClaims,
  role: user.role,
  active: user.active,
  companyId,
})));

console.log(`Empresa: ${companyName}`);
console.log(`ID de empresa: ${companyId}`);
console.log(`Perfiles migrados: ${users.length}`);
console.log(`Tickets migrados: ${ticketsSnapshot.size}`);
console.log(`Reportes migrados: ${reportsSnapshot.size}`);
