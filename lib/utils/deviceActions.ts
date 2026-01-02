import { ref, get, set, update, onValue } from 'firebase/database';
import { database } from '@/lib/firebase';
import { getDeviceRef } from '@/lib/utils/rtdbHelper';

export interface DeviceAction {
  action?: string;
  actionTaken?: boolean;
  timestamp?: number;
  result?: any;
}

/**
 * Send an action command to a device in Firebase RTDB
 * 
 * The ESP32 should:
 * 1. Set actionTaken to true when it receives the command
 * 2. Set action to "done" when the command is complete
 * 
 * Example:
 * await sendDeviceAction('DEVICE_0001', 'scan');
 * 
 * This creates/updates: devices/{deviceId}
 * {
 *   action: 'scan',
 *   actionTaken: false,
 *   timestamp: 1234567890
 * }
 */
export async function sendDeviceAction(
  deviceId: string,
  command: string
): Promise<boolean> {
  try {
    const result = await getDeviceRef(deviceId);
    if (!result) {
      console.error(`[Device Action] Could not get ref for ${deviceId}`);
      return false;
    }
    const { ref: deviceRef } = result;
    
    await update(deviceRef, {
      action: command,
      actionTaken: false,
      timestamp: Date.now()
    });
    
    console.log(`[Device Action] Sent "${command}" to ${deviceId}`);
    return true;
  } catch (error) {
    console.error(`[Device Action] Error sending action to ${deviceId}:`, error);
    return false;
  }
}

/**
 * Monitor device action and wait for completion
 * 
 * Steps:
 * 1. First, waits for ESP32 to set actionTaken = true (acknowledges command)
 * 2. Then, waits for action to change to "done"
 * 
 * Returns a promise that resolves when action is complete
 * or rejects if timeout/error occurs
 */
export async function waitForDeviceActionComplete(
  deviceId: string,
  timeoutMs: number = 15000
): Promise<DeviceAction> {
  return new Promise(async (resolve, reject) => {
    const result = await getDeviceRef(deviceId);
    if (!result) {
      reject(new Error(`Could not get ref for ${deviceId}`));
      return;
    }
    const { ref: deviceRef } = result;
    let unsubscribe: (() => void) | null = null;
    let timeoutId: NodeJS.Timeout | null = null;
    let hasAcknowledged = false;

    // Set timeout
    timeoutId = setTimeout(() => {
      if (unsubscribe) unsubscribe();
      if (!hasAcknowledged) {
        reject(new Error('Device did not acknowledge command (actionTaken not set)'));
      } else {
        reject(new Error(`Device action timeout after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    // Listen for action status changes
    unsubscribe = onValue(
      deviceRef,
      (snapshot) => {
        if (!snapshot.exists()) return;

        const device = snapshot.val();
        
        // Step 1: Check if ESP32 acknowledged the command
        if (device.actionTaken === true && !hasAcknowledged) {
          hasAcknowledged = true;
          console.log(`[Device Action] ${deviceId} acknowledged command`);
        }

        // Step 2: Check if action is complete
        if (hasAcknowledged && device.action === 'done') {
          if (timeoutId) clearTimeout(timeoutId);
          if (unsubscribe) unsubscribe();
          
          console.log(`[Device Action] ${deviceId} completed action`);
          resolve(device);
        }
      },
      (error) => {
        if (timeoutId) clearTimeout(timeoutId);
        if (unsubscribe) unsubscribe();
        reject(error);
      }
    );
  });
}

/**
 * Send device action and wait for completion
 * 
 * Convenience function that combines sendDeviceAction and waitForDeviceActionComplete
 */
export async function executeDeviceAction(
  deviceId: string,
  command: string,
  timeoutMs: number = 15000
): Promise<DeviceAction> {
  const sent = await sendDeviceAction(deviceId, command);
  
  if (!sent) {
    throw new Error('Failed to send action to device');
  }

  return waitForDeviceActionComplete(deviceId, timeoutMs);
}

/**
 * Get current device action status
 */
export async function getDeviceActionStatus(deviceId: string): Promise<DeviceAction | null> {
  try {
    const result = await getDeviceRef(deviceId);
    if (!result) return null;
    const { ref: deviceRef } = result;
    const snapshot = await get(deviceRef);
    
    if (!snapshot.exists()) {
      return null;
    }

    return snapshot.val();
  } catch (error) {
    console.error(`[Device Action] Error getting action status for ${deviceId}:`, error);
    return null;
  }
}

/**
 * Reset device action to "none" when user exits scan
 */
export async function resetDeviceAction(deviceId: string): Promise<boolean> {
  try {
    const result = await getDeviceRef(deviceId);
    if (!result) return false;
    const { ref: deviceRef } = result;
    await update(deviceRef, {
      action: 'none',
      actionTaken: false,
      timestamp: Date.now()
    });
    console.log(`[Device Action] Reset ${deviceId} action to "none"`);
    return true;
  } catch (error) {
    console.error(`[Device Action] Error resetting action for ${deviceId}:`, error);
    return false;
  }
}
