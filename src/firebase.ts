import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'not-configured',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'not-configured.invalid',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'not-configured',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || 'not-configured',
};

const missing = [
  ['VITE_FIREBASE_API_KEY', import.meta.env.VITE_FIREBASE_API_KEY],
  ['VITE_FIREBASE_AUTH_DOMAIN', import.meta.env.VITE_FIREBASE_AUTH_DOMAIN],
  ['VITE_FIREBASE_PROJECT_ID', import.meta.env.VITE_FIREBASE_PROJECT_ID],
  ['VITE_FIREBASE_APP_ID', import.meta.env.VITE_FIREBASE_APP_ID],
].filter(([, value]) => !value).map(([key]) => key);

export const configurationError = missing.length
  ? `Falta configurar ${missing.join(', ')} en .env.`
  : '';

const app = initializeApp(config);

export const auth = getAuth(app);
export const db = getFirestore(app);
