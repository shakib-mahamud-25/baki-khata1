// Firebase setup. Values come from environment variables (see .env.example and docs/SETUP.md).
// These web config values are NOT secrets: security comes from firestore.rules, not from hiding them.
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';

const env = import.meta.env;
const cfg = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID,
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID, // optional, only for Google Analytics
};

export const configured = Boolean(cfg.apiKey && cfg.projectId && cfg.appId);
export const app = configured ? initializeApp(cfg) : null;
export const auth = app ? getAuth(app) : null;
// Offline cache: entries made without internet are saved on the device and synced later.
export const db = app
  ? initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })
  : null;

// Google Analytics (optional): starts only if VITE_FIREBASE_MEASUREMENT_ID is set and the browser supports it.
// It records standard page/session data only. The app never sends names, amounts or ledger content.
if (app && cfg.measurementId) {
  import('firebase/analytics')
    .then(({ getAnalytics, isSupported }) => isSupported().then((ok) => ok && getAnalytics(app)))
    .catch(() => {});
}

// Optional recovery-code feature (needs the Cloud Function in /functions, which needs the Blaze plan).
export const RECOVERY = env.VITE_RECOVERY_ENABLED === 'true';
export const FN_REGION = env.VITE_FUNCTIONS_REGION || 'us-central1';
