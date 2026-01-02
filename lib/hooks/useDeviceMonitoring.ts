import { useEffect, useRef } from 'react';
import { database } from '@/lib/firebase';
import { ref, onValue, get } from 'firebase/database';
import { notifyDeviceOffline, notifyDeviceOnline } from '@/lib/utils/notifications';
import { onDeviceValue, getDeviceData } from '@/lib/utils/rtdbHelper';

interface DeviceMonitorConfig {
  userId: string;
  deviceId: string;
  paddyName?: string;
  fieldId?: string;
  fieldName?: string;
  enabled?: boolean;
}

const OFFLINE_THRESHOLD = 10 * 60 * 1000; // 10 minutes in milliseconds (increased from 2 minutes)
const CHECK_INTERVAL = 60 * 1000; // Check every 60 seconds (increased from 30 seconds)
const NOTIFICATION_COOLDOWN = 30 * 60 * 1000; // 30 minutes cooldown between notifications for same device

/**
 * Monitor device status and NPK readings
 * Sends notifications when device goes offline or sensor stops updating
 */
export function useDeviceMonitoring(configs: DeviceMonitorConfig[]) {
  const lastStatusRef = useRef<{ [key: string]: { online: boolean; hasNPK: boolean } }>({});
  const notificationSentRef = useRef<{ [key: string]: boolean }>({});
  const lastNotificationTimeRef = useRef<{ [key: string]: number }>({}); // Track when last notification was sent

  useEffect(() => {
    if (configs.length === 0 || !configs.some(c => c.enabled !== false)) return;

    const unsubscribers: (() => void)[] = [];
    const monitorIntervals: NodeJS.Timeout[] = [];

    configs.forEach(config => {
      if (config.enabled === false) return;

      const { userId, deviceId, paddyName, fieldId, fieldName } = config;
      
      // Initialize status tracking
      if (!lastStatusRef.current[deviceId]) {
        lastStatusRef.current[deviceId] = { online: true, hasNPK: true };
        notificationSentRef.current[deviceId] = false;
        lastNotificationTimeRef.current[deviceId] = 0;
      }

      // Listen to device data in real-time (with fallback to new RTDB structure)
      const unsubscribe = onDeviceValue(deviceId, '', (deviceData) => {
        if (!deviceData) {
          checkAndNotify(userId, deviceId, paddyName, fieldId, fieldName, false, false);
          return;
        }
        const now = Date.now();

        // Check heartbeat (status + timestamp)
        const hasHeartbeat = deviceData.status === 'connected' || 
          deviceData.status === 'alive';

        // Check NPK timestamp (should be within last 2 minutes)
        let hasRecentNPK = false;
        if (deviceData.npk?.timestamp) {
          const npkTimestamp = deviceData.npk.timestamp;
          // Handle both seconds and milliseconds timestamps
          const npkTime = npkTimestamp < 10000000000 ? npkTimestamp * 1000 : npkTimestamp;
          const timeSinceNPK = now - npkTime;
          hasRecentNPK = timeSinceNPK < OFFLINE_THRESHOLD;
        }

        // Device is considered "online" if it has heartbeat OR recent NPK readings
        const isOnline = hasHeartbeat || hasRecentNPK;
        const hasNPK = deviceData.npk && (
          deviceData.npk.n !== undefined || 
          deviceData.npk.p !== undefined || 
          deviceData.npk.k !== undefined
        );

        checkAndNotify(userId, deviceId, paddyName, fieldId, fieldName, isOnline, hasNPK);
      });

      unsubscribers.push(unsubscribe);

      // Periodic check every 60 seconds (with fallback to new RTDB structure)
      const intervalId = setInterval(async () => {
        // Re-fetch and check status
        const deviceData = await getDeviceData(deviceId, '');
        
        if (!deviceData) {
          checkAndNotify(userId, deviceId, paddyName, fieldId, fieldName, false, false);
          return;
        }
          const now = Date.now();

          const hasHeartbeat = deviceData.status === 'connected' || deviceData.status === 'alive';
          
          let hasRecentNPK = false;
          if (deviceData.npk?.timestamp) {
            const npkTimestamp = deviceData.npk.timestamp;
            const npkTime = npkTimestamp < 10000000000 ? npkTimestamp * 1000 : npkTimestamp;
            const timeSinceNPK = now - npkTime;
            hasRecentNPK = timeSinceNPK < OFFLINE_THRESHOLD;
          }

          const isOnline = hasHeartbeat || hasRecentNPK;
          const hasNPK = deviceData.npk && (
            deviceData.npk.n !== undefined || 
            deviceData.npk.p !== undefined || 
            deviceData.npk.k !== undefined
          );

          checkAndNotify(userId, deviceId, paddyName, fieldId, fieldName, isOnline, hasNPK);
      }, CHECK_INTERVAL);

      monitorIntervals.push(intervalId);
    });

    return () => {
      unsubscribers.forEach(unsub => unsub());
      monitorIntervals.forEach(interval => clearInterval(interval));
    };
  }, [configs]);

  const checkAndNotify = async (
    userId: string,
    deviceId: string,
    paddyName: string | undefined,
    fieldId: string | undefined,
    fieldName: string | undefined,
    isOnline: boolean,
    hasNPK: boolean
  ) => {
    const lastStatus = lastStatusRef.current[deviceId];
    const notificationSent = notificationSentRef.current[deviceId];
    const lastNotificationTime = lastNotificationTimeRef.current[deviceId] || 0;
    const now = Date.now();
    const timeSinceLastNotification = now - lastNotificationTime;

    // Device went offline
    if (lastStatus.online && !isOnline) {
      // Only send notification if:
      // 1. We haven't sent one yet for this offline event, OR
      // 2. It's been more than the cooldown period since the last notification
      if (!notificationSent || timeSinceLastNotification >= NOTIFICATION_COOLDOWN) {
        console.log(`[Monitor] Device ${deviceId} went offline`);
        await notifyDeviceOffline(userId, deviceId, paddyName, fieldId, fieldName);
        notificationSentRef.current[deviceId] = true;
        lastNotificationTimeRef.current[deviceId] = now;
      } else {
        console.log(`[Monitor] Device ${deviceId} still offline, but notification cooldown active (${Math.round((NOTIFICATION_COOLDOWN - timeSinceLastNotification) / 60000)} min remaining)`);
      }
    }

    // Device came back online
    if (!lastStatus.online && isOnline && notificationSent) {
      console.log(`[Monitor] Device ${deviceId} came back online`);
      await notifyDeviceOnline(userId, deviceId, paddyName, fieldId, fieldName);
      notificationSentRef.current[deviceId] = false;
      lastNotificationTimeRef.current[deviceId] = now; // Reset cooldown when device comes back
    }

    // Update last status
    lastStatusRef.current[deviceId] = { online: isOnline, hasNPK };
  };
}
