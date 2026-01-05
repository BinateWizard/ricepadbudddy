/**
 * User Action Logger Utility
 * 
 * Client-side helper to log user actions via Cloud Functions
 */

import { functions } from '@/lib/firebase';
import { httpsCallable } from 'firebase/functions';

export interface UserActionData {
  deviceId?: string;
  action: string;
  details?: Record<string, any>;
}

/**
 * Log a user action to Firestore via Cloud Function
 * 
 * @param data - Action data (deviceId, action, details)
 * @returns Promise with result
 */
export async function logUserAction(data: UserActionData): Promise<{ success: boolean; actionId?: string }> {
  try {
    const logAction = httpsCallable(functions, 'logUserAction');
    const result = await logAction(data);
    return result.data as { success: boolean; actionId?: string };
  } catch (error) {
    console.error('[User Action] Failed to log action:', error);
    return { success: false };
  }
}
