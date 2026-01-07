/**
 * Device Logs Utilities
 * Client-side helpers for logging and fetching device actions
 */

import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';

export interface DeviceActionLog {
  deviceId: string;
  userId?: string;
  fieldId?: string;
  nodeId: 'ESP32A' | 'ESP32B' | 'ESP32C';
  action: string;
  actionType: 'relay' | 'motor' | 'npk' | 'gps' | 'system';
  params?: Record<string, any>;
  result?: 'success' | 'failed' | 'timeout' | 'pending';
  details?: any;
  error?: string;
}

/**
 * Log a device action via Cloud Function
 * Silently fails if logging is unavailable
 */
export async function logDeviceAction(log: DeviceActionLog) {
  try {
    const logDeviceActionFn = httpsCallable(functions, 'logDeviceAction');
    const result = await logDeviceActionFn(log);
    console.log('Device action logged:', result.data);
    return result.data;
  } catch (error) {
    // Silently fail - logging is not critical
    console.warn('Device action logging failed (non-critical):', error);
    return null;
  }
}

/**
 * Fetch logs for a specific device
 */
export async function getDeviceLogs(deviceId: string, limit = 50, startAfter?: number) {
  try {
    const getDeviceLogsFn = httpsCallable(functions, 'getDeviceLogs');
    const result: any = await getDeviceLogsFn({ deviceId, limit, startAfter });
    return result.data;
  } catch (error) {
    console.error('Error fetching device logs:', error);
    throw error;
  }
}

/**
 * Fetch logs for all devices in a field
 */
export async function getFieldLogs(fieldId: string, limit = 100) {
  try {
    const getFieldLogsFn = httpsCallable(functions, 'getFieldLogs');
    const result: any = await getFieldLogsFn({ fieldId, limit });
    return result.data;
  } catch (error) {
    console.error('Error fetching field logs:', error);
    throw error;
  }
}
