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
// Functions are deployed to us-central1 (default region)
const functions = getFunctions(app, 'us-central1');

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
