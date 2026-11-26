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

function firebaseAdminError(code, message, cause) {
  const error = new Error(message, { cause });
  error.diagnosticCode = code;
  error.causeCode = typeof cause?.code === 'string' ? cause.code : 'unknown';
  return error;
}

async function createFirebaseAdmin() {
  let appModule;
  let authModule;
  let firestoreModule;
  try {
    appModule = await import('firebase-admin/app');
  } catch (error) {
    throw firebaseAdminError(
      'firebase-admin-app-import-failed',
      'No se pudo cargar firebase-admin/app.',
      error,
    );
  }
  try {
    authModule = await import('firebase-admin/auth');
  } catch (error) {
    throw firebaseAdminError(
      'firebase-admin-auth-import-failed',
      'No se pudo cargar firebase-admin/auth.',
      error,
    );
  }
  try {
    firestoreModule = await import('firebase-admin/firestore');
  } catch (error) {
    throw firebaseAdminError(
      'firebase-admin-firestore-import-failed',
      'No se pudo cargar firebase-admin/firestore.',
      error,
    );
  }

  let credential;
  let projectId = process.env.VITE_FIREBASE_PROJECT_ID;
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (serviceAccountJson) {
    let serviceAccount;
    try {
      serviceAccount = JSON.parse(serviceAccountJson);
    } catch {
      throw firebaseAdminError(
        'service-account-invalid-json',
        'FIREBASE_SERVICE_ACCOUNT_JSON debe contener JSON válido.',
      );
    }
    if (!serviceAccount || typeof serviceAccount !== 'object'
      || typeof serviceAccount.project_id !== 'string'
      || typeof serviceAccount.client_email !== 'string'
      || typeof serviceAccount.private_key !== 'string') {
      throw firebaseAdminError(
        'service-account-missing-fields',
        'FIREBASE_SERVICE_ACCOUNT_JSON no contiene una cuenta de servicio válida.',
      );
    }
    try {
      credential = appModule.cert(serviceAccount);
    } catch (error) {
      throw firebaseAdminError(
        'service-account-invalid-credential',
        'Firebase Admin rechazó las credenciales de la cuenta de servicio.',
        error,
      );
    }
    projectId = serviceAccount.project_id;
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    credential = appModule.applicationDefault();
  } else {
    throw firebaseAdminError(
      'service-account-not-configured',
      'Configura FIREBASE_SERVICE_ACCOUNT_JSON en Vercel.',
    );
  }

  try {
    const app = appModule.getApps().find((item) => item.name === 'cenit-vercel-api')
      ?? appModule.initializeApp({ credential, ...(projectId ? { projectId } : {}) }, 'cenit-vercel-api');
    return {
      auth: authModule.getAuth(app),
      db: firestoreModule.getFirestore(app),
      FieldValue: firestoreModule.FieldValue,
    };
  } catch (error) {
    throw firebaseAdminError(
      'firebase-admin-initialization-failed',
      'No se pudo inicializar Firebase Admin.',
      error,
    );
  }
}
