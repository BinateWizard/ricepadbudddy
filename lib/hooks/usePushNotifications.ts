'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { messaging } from '@/lib/firebase';
import { getToken, onMessage } from 'firebase/messaging';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || '';

export function usePushNotifications() {
  const { user } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSupported, setIsSupported] = useState(false);

  // Check if push notifications are supported
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const supported = 
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window;
    
    setIsSupported(supported);
    
    if (supported) {
      setPermission(Notification.permission);
    }
  }, []);

  // Request notification permission and get FCM token
  const requestPermission = async (): Promise<boolean> => {
    if (!isSupported || !messaging) {
      console.warn('Push notifications not supported');
      return false;
    }

    try {
      // Request browser notification permission
      const permission = await Notification.requestPermission();
      setPermission(permission);

      if (permission !== 'granted') {
        console.warn('Notification permission denied');
        return false;
      }

      // Register service worker if not already registered
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.register('/service-worker.js', {
          scope: '/',
        });
        console.log('Service Worker registered:', registration);
      }

      // Get FCM token
      if (!messaging) {
        console.warn('Messaging not initialized');
        return false;
      }
      
      const currentToken = await getToken(messaging, {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: await navigator.serviceWorker.ready,
      });

      if (currentToken) {
        setToken(currentToken);
        console.log('FCM Token:', currentToken);

        // Save token to Firestore for the user
        if (user) {
          await saveTokenToFirestore(currentToken);
        }

        return true;
      } else {
        console.warn('No FCM token available');
        return false;
      }
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      return false;
    }
  };

  // Save FCM token to Firestore
  const saveTokenToFirestore = async (fcmToken: string) => {
    if (!user) return;

    try {
      const userRef = doc(db, `users/${user.uid}`);
      const userDoc = await getDoc(userRef);
      
      let existingTokens: string[] = [];
      if (userDoc.exists()) {
        existingTokens = userDoc.data()?.fcmTokens || [];
      }
      
      // Add token if not already in array
      if (!existingTokens.includes(fcmToken)) {
        existingTokens.push(fcmToken);
        await setDoc(userRef, {
          fcmTokens: existingTokens,
          lastTokenUpdate: new Date(),
        }, { merge: true });
        console.log('FCM token saved to Firestore');
      }
    } catch (error) {
      console.error('Error saving FCM token:', error);
    }
  };

  // Get existing token if permission is already granted
  useEffect(() => {
    if (!isSupported || !messaging || !user) return;

    const getExistingToken = async () => {
      try {
        if (Notification.permission === 'granted' && messaging) {
          const currentToken = await getToken(messaging, {
            vapidKey: VAPID_KEY,
            serviceWorkerRegistration: await navigator.serviceWorker.ready,
          });

          if (currentToken) {
            setToken(currentToken);
            await saveTokenToFirestore(currentToken);
          }
        }
      } catch (error) {
        console.error('Error getting existing FCM token:', error);
      }
    };

    getExistingToken();
  }, [isSupported, user]);

  // Listen for foreground messages (when app is open)
  useEffect(() => {
    if (!isSupported || !messaging) return;

    const unsubscribe = onMessage(messaging, (payload) => {
      console.log('Foreground message received:', payload);
      
      // Show browser notification even when app is open
      if (Notification.permission === 'granted') {
        const notificationTitle = payload.notification?.title || 'PadBuddy';
        const notificationOptions: NotificationOptions = {
          body: payload.notification?.body || 'New notification',
          icon: '/icons/rice_logo.png',
          badge: '/icons/rice_logo.png',
          tag: payload.data?.notificationId || 'padbuddy-notification',
          data: payload.data,
          requireInteraction: false,
        };

        new Notification(notificationTitle, notificationOptions);
      }
    });

    return () => unsubscribe();
  }, [isSupported]);

  return {
    token,
    permission,
    isSupported,
    requestPermission,
  };
}
