import { initializeApp, getApps, getApp } from "firebase/app";
import { getAnalytics, Analytics } from "firebase/analytics";
import { getAuth, browserLocalPersistence, setPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getDatabase } from "firebase/database";
import { getMessaging, getToken, onMessage, Messaging } from "firebase/messaging";
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Initialize Firebase (avoid duplicate initialization)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize services
const auth = getAuth(app);
const db = getFirestore(app);
const database = getDatabase(app);
// Determine functions region: explicit env var takes precedence. Otherwise
// infer from the RTDB URL hostname (e.g. '...asia-southeast1...') and
// fall back to 'us-central1'. This helps when RTDB and Functions are
// deployed to the same region.
const explicitRegion = process.env.NEXT_PUBLIC_FIREBASE_FUNCTIONS_REGION;
let inferredRegion = 'us-central1';
try {
  const dbUrl = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || '';
  const m = dbUrl.match(/\.([a-z0-9-]+)\.firebasedatabase\.app/);
  if (m && m[1]) {
    inferredRegion = m[1];
  }
} catch (e) {
  // ignore and use default
}
const functionsRegion = explicitRegion || inferredRegion || 'us-central1';
const functions = getFunctions(app, functionsRegion as any);

// Set auth persistence to LOCAL for PWA support
// This ensures auth state persists even when app is closed
if (typeof window !== "undefined") {
  setPersistence(auth, browserLocalPersistence).catch((error) => {
    console.error("Auth persistence error:", error);
  });
}

// Analytics is only available in the browser
let analytics: Analytics | null = null;
if (typeof window !== "undefined") {
  analytics = getAnalytics(app);
}

// Messaging (FCM) is only available in the browser
let messaging: Messaging | null = null;
if (typeof window !== "undefined" && 'serviceWorker' in navigator) {
  try {
    messaging = getMessaging(app);
  } catch (error) {
    console.warn('Firebase Messaging initialization failed:', error);
  }
}

export { app, auth, db, database, functions, analytics, messaging };
// Alias for compatibility with code expecting 'firestore' export
export const firestore = db;
