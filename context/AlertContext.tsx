/**
 * Alert Context & Hooks
 * 
 * Manages real-time alerts from Firestore with offline support
 * Provides alerts to all components in your app
 */

'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  query,
  where,
  collection,
  onSnapshot,
  Unsubscribe,
  updateDoc,
  doc,
  orderBy,
  Timestamp,
  Query,
  QueryConstraint,
  collectionGroup,
  getDocs,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';

export interface Alert {
  id: string;
  type: 'npk_low' | 'npk_high' | 'device_offline' | 'water_level' | 'anomaly';
  severity: 'critical' | 'warning' | 'info';
  message: string;
  paddyId: string;
  fieldId: string;
  deviceId?: string;
  value?: number;
  element?: string;
  threshold?: number;
  createdAt: Timestamp;
  read: boolean;
  acknowledged: boolean;
  acknowledgedAt?: Timestamp | null;
}

interface AlertContextType {
  alerts: Alert[];
  unreadCount: number;
  criticalCount: number;
  isLoading: boolean;
  error: string | null;
  markAsRead: (alertId: string, fieldId: string) => Promise<void>;
  acknowledge: (alertId: string, fieldId: string) => Promise<void>;
  dismissAlert: (alertId: string, fieldId: string) => Promise<void>;
  getAlertsByField: (fieldId: string) => Alert[];
  getAlertsByPaddy: (fieldId: string, paddyId: string) => Alert[];
  getAlertsByDevice: (deviceId: string) => Alert[];
}

const AlertContext = createContext<AlertContextType | undefined>(undefined);

export function AlertProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userFields, setUserFields] = useState<string[]>([]);

  // Get user's fields
  useEffect(() => {
    if (!user?.uid) {
      setAlerts([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    
    const getFields = async () => {
      try {
        const fieldsRef = collection(db, 'fields');
        const q = query(fieldsRef, where('owner', '==', user.uid));
        const snapshot = await getDocs(q);
        const fieldIds = snapshot.docs.map((doc) => doc.id);
        setUserFields(fieldIds);
      } catch (err) {
        console.error('Error fetching user fields:', err);
        setError('Failed to load fields');
      }
    };

    getFields();
  }, [user?.uid]);

  // Subscribe to alerts for all user's fields
  useEffect(() => {
    if (!user?.uid || userFields.length === 0) {
      setAlerts([]);
      setIsLoading(false);
      return;
    }

    const unsubscribers: Unsubscribe[] = [];

    try {
      // For each field, listen to its alerts
      userFields.forEach((fieldId) => {
        const alertsRef = collection(db, 'alerts', fieldId, 'alerts');
        const q = query(alertsRef, orderBy('createdAt', 'desc'));

        const unsubscribe = onSnapshot(
          q,
          (snapshot) => {
            const fieldAlerts = snapshot.docs.map((doc) => ({
              id: doc.id,
              fieldId,
              ...doc.data(),
            } as Alert));

            // Merge with existing alerts from other fields
            setAlerts((prev) => {
              // Remove alerts from this field and add new ones
              const others = prev.filter((a) => a.fieldId !== fieldId);
              return [...others, ...fieldAlerts];
            });

            setIsLoading(false);
            setError(null);
          },
          (err: any) => {
            // Silently handle permission errors after signout
            if (err.code === 'permission-denied') {
              console.log('[Alerts] Permission denied (user signed out), cleaning up...');
              setAlerts([]);
              setIsLoading(false);
              return;
            }
            console.error(`Error listening to alerts for field ${fieldId}:`, err);
            setError('Failed to load alerts');
            setIsLoading(false);
          }
        );

        unsubscribers.push(unsubscribe);
      });
    } catch (err) {
      console.error('Error setting up alert listeners:', err);
      setError('Failed to set up alerts');
      setIsLoading(false);
    }

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [user?.uid, userFields]);

  const markAsRead = useCallback(
    async (alertId: string, fieldId: string) => {
      try {
        const alertRef = doc(db, 'alerts', fieldId, 'alerts', alertId);
        await updateDoc(alertRef, { read: true });
      } catch (err) {
        console.error('Error marking alert as read:', err);
        throw err;
      }
    },
    []
  );

  const acknowledge = useCallback(
    async (alertId: string, fieldId: string) => {
      try {
        const alertRef = doc(db, 'alerts', fieldId, 'alerts', alertId);
        await updateDoc(alertRef, {
          acknowledged: true,
          acknowledgedAt: Timestamp.now(),
        });
      } catch (err) {
        console.error('Error acknowledging alert:', err);
        throw err;
      }
    },
    []
  );

  const dismissAlert = useCallback(
    async (alertId: string, fieldId: string) => {
      try {
        await acknowledge(alertId, fieldId);
        await markAsRead(alertId, fieldId);
      } catch (err) {
        console.error('Error dismissing alert:', err);
        throw err;
      }
    },
    [acknowledge, markAsRead]
  );

  const getAlertsByField = useCallback((fieldId: string) => {
    return alerts.filter((a) => a.fieldId === fieldId);
  }, [alerts]);

  const getAlertsByPaddy = useCallback((fieldId: string, paddyId: string) => {
    return alerts.filter((a) => a.fieldId === fieldId && a.paddyId === paddyId);
  }, [alerts]);

  const getAlertsByDevice = useCallback((deviceId: string) => {
    return alerts.filter((a) => a.deviceId === deviceId);
  }, [alerts]);

  const unreadCount = alerts.filter((a) => !a.read).length;
  const criticalCount = alerts.filter((a) => !a.acknowledged && a.severity === 'critical').length;

  return (
    <AlertContext.Provider
      value={{
        alerts,
        unreadCount,
        criticalCount,
        isLoading,
        error,
        markAsRead,
        acknowledge,
        dismissAlert,
        getAlertsByField,
        getAlertsByPaddy,
        getAlertsByDevice,
      }}
    >
      {children}
    </AlertContext.Provider>
  );
}

export function useAlerts() {
  const context = useContext(AlertContext);
  if (!context) {
    throw new Error('useAlerts must be used within AlertProvider');
  }
  return context;
}
