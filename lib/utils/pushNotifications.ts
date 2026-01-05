/**
 * Push Notification Utilities
 * Client-side helpers for triggering push notifications
 */

import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';

/**
 * Send a test push notification
 */
export async function sendTestNotification(message?: string, type?: string) {
  try {
    const sendTestNotificationFn = httpsCallable(functions, 'sendTestNotification');
    const result = await sendTestNotificationFn({
      message: message || 'Test notification from PadBuddy!',
      type: type || 'test'
    });
    
    console.log('Test notification sent:', result.data);
    return result.data;
  } catch (error) {
    console.error('Error sending test notification:', error);
    throw error;
  }
}

/**
 * Trigger a notification for device offline
 */
export async function notifyDeviceOffline(deviceId: string, fieldId?: string) {
  try {
    const sendTestNotificationFn = httpsCallable(functions, 'sendTestNotification');
    await sendTestNotificationFn({
      message: `Device ${deviceId} is offline`,
      type: 'offline',
      deviceId,
      fieldId
    });
  } catch (error) {
    console.error('Error sending offline notification:', error);
    throw error;
  }
}

/**
 * Trigger a notification for errors/warnings
 */
export async function notifyError(message: string, deviceId?: string, fieldId?: string) {
  try {
    const sendTestNotificationFn = httpsCallable(functions, 'sendTestNotification');
    await sendTestNotificationFn({
      message,
      type: 'error',
      deviceId,
      fieldId
    });
  } catch (error) {
    console.error('Error sending error notification:', error);
    throw error;
  }
}

/**
 * Trigger a notification for warnings
 */
export async function notifyWarning(message: string, deviceId?: string, fieldId?: string) {
  try {
    const sendTestNotificationFn = httpsCallable(functions, 'sendTestNotification');
    await sendTestNotificationFn({
      message,
      type: 'warning',
      deviceId,
      fieldId
    });
  } catch (error) {
    console.error('Error sending warning notification:', error);
    throw error;
  }
}
