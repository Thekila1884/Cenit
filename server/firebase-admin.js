import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

let adminServices;

export function getFirebaseAdmin() {
  if (adminServices) return adminServices;

  let credential;
  let projectId = process.env.VITE_FIREBASE_PROJECT_ID;
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (serviceAccountJson) {
    let serviceAccount;
    try {
      serviceAccount = JSON.parse(serviceAccountJson);
    } catch {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON debe contener JSON válido.');
    }
    if (!serviceAccount || typeof serviceAccount !== 'object'
      || typeof serviceAccount.project_id !== 'string'
      || typeof serviceAccount.client_email !== 'string'
      || typeof serviceAccount.private_key !== 'string') {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON no contiene una cuenta de servicio válida.');
    }
    credential = cert(serviceAccount);
    projectId = serviceAccount.project_id;
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    credential = applicationDefault();
  } else {
    throw new Error('Configura FIREBASE_SERVICE_ACCOUNT_JSON en Vercel.');
  }

  const app = getApps().find((item) => item.name === 'cenit-vercel-api')
    ?? initializeApp({ credential, ...(projectId ? { projectId } : {}) }, 'cenit-vercel-api');
  adminServices = { auth: getAuth(app), db: getFirestore(app) };
  return adminServices;
}
