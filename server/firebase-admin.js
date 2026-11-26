let adminServicesPromise;

export function getFirebaseAdmin() {
  if (!adminServicesPromise) {
    adminServicesPromise = createFirebaseAdmin().catch((error) => {
      adminServicesPromise = undefined;
      throw error;
    });
  }
  return adminServicesPromise;
}

async function createFirebaseAdmin() {
  const [appModule, authModule, firestoreModule] = await Promise.all([
    import('firebase-admin/app'),
    import('firebase-admin/auth'),
    import('firebase-admin/firestore'),
  ]);

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
    credential = appModule.cert(serviceAccount);
    projectId = serviceAccount.project_id;
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    credential = appModule.applicationDefault();
  } else {
    throw new Error('Configura FIREBASE_SERVICE_ACCOUNT_JSON en Vercel.');
  }

  const app = appModule.getApps().find((item) => item.name === 'cenit-vercel-api')
    ?? appModule.initializeApp({ credential, ...(projectId ? { projectId } : {}) }, 'cenit-vercel-api');
  return {
    auth: authModule.getAuth(app),
    db: firestoreModule.getFirestore(app),
    FieldValue: firestoreModule.FieldValue,
  };
}
