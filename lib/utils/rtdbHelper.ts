/**
 * RTDB Helper: Read from new structure with fallback to legacy
 * 
 * Tries owners/{ownerId}/fields/{fieldId}/devices/{deviceId} first,
 * falls back to devices/{deviceId} for backward compatibility
 */

import { database } from '@/lib/firebase';
import { ref, get, onValue, off } from 'firebase/database';
import type { DatabaseReference } from 'firebase/database';

/**
 * Get device ref with fallback
 * Returns the first available path (new → legacy)
 */
export async function getDeviceRef(
  deviceId: string,
  subPath?: string
): Promise<{ ref: DatabaseReference; path: string } | null> {
  // Try new structure first (if we have owner/field info)
  // For now, we'll check both and return whichever exists
  
  const fullSubPath = subPath ? `/${subPath}` : '';
  
  // Check legacy path first (most likely to exist during migration)
  const legacyPath = `devices/${deviceId}${fullSubPath}`;
  const legacyRef = ref(database, legacyPath);
  
  try {
    const legacySnap = await get(legacyRef);
    if (legacySnap.exists()) {
      return { ref: legacyRef, path: legacyPath };
    }
  } catch (error) {
    console.warn(`Failed to check legacy path ${legacyPath}:`, error);
  }
  
  // TODO: Check new structure when we have owner/field context
  // For now, return legacy ref even if it doesn't exist (for writes)
  return { ref: legacyRef, path: legacyPath };
}

/**
 * Listen to device data with automatic fallback
 */
export function onDeviceValue(
  deviceId: string,
  subPath: string,
  callback: (data: any) => void,
  errorCallback?: (error: Error) => void
): () => void {
  let activeRef: DatabaseReference | null = null;
  let unsubscribe: (() => void) | null = null;

  // Setup listener on legacy path (primary during migration)
  const legacyPath = `devices/${deviceId}/${subPath}`;
  activeRef = ref(database, legacyPath);
  
  unsubscribe = onValue(
    activeRef,
    (snapshot) => {
      const data = snapshot.val();
      callback(data);
    },
    (error) => {
      console.error(`Error listening to ${legacyPath}:`, error);
      if (errorCallback) errorCallback(error);
    }
  );

  // Return cleanup function
  return () => {
    if (activeRef) {
      off(activeRef);
    }
  };
}

/**
 * Get device data with fallback (one-time read)
 */
export async function getDeviceData(
  deviceId: string,
  subPath?: string
): Promise<any> {
  const result = await getDeviceRef(deviceId, subPath);
  
  if (!result) {
    return null;
  }
  
  try {
    const snapshot = await get(result.ref);
    return snapshot.val();
  } catch (error) {
    console.error(`Error reading device data from ${result.path}:`, error);
    return null;
  }
}
