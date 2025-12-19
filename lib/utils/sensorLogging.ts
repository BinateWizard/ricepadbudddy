import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { DeviceNPK } from './deviceStatus';

/**
 * Log NPK sensor readings to Firestore for historical tracking
 * 
 * This should be called when fetching fresh sensor data from RTDB
 * to maintain a historical record for trends and analysis
 * 
 * Converts RTDB format (n, p, k) to Firestore format (nitrogen, phosphorus, potassium)
 */
export async function logSensorReadings(
  userId: string,
  fieldId: string,
  paddyId: string,
  npk: DeviceNPK
): Promise<void> {
  try {
    // Only log if we have actual readings
    if (!npk || (npk.n === undefined && npk.p === undefined && npk.k === undefined)) {
      return;
    }
    
    const logsRef = collection(db, `users/${userId}/fields/${fieldId}/paddies/${paddyId}/logs`);
    await addDoc(logsRef, {
      // Convert n, p, k to nitrogen, phosphorus, potassium for Firestore
      nitrogen: npk.n,
      phosphorus: npk.p,
      potassium: npk.k,
      timestamp: serverTimestamp(),
      createdAt: new Date().toISOString(),
      // Keep original timestamp from device if available
      deviceTimestamp: npk.timestamp,
    });
    
    console.log(`Sensor readings logged for paddy ${paddyId}`);
  } catch (error) {
    console.error('Error logging sensor readings:', error);
  }
}

/**
 * Log sensor readings from SensorReadings format (backward compatibility)
 */
export async function logSensorReadingsLegacy(
  userId: string,
  fieldId: string,
  paddyId: string,
  readings: {
    nitrogen?: number;
    phosphorus?: number;
    potassium?: number;
    temperature?: number;
    humidity?: number;
    waterLevel?: number;
    timestamp?: number;
  }
): Promise<void> {
  try {
    if (Object.keys(readings).length === 0) {
      return;
    }
    
    const logsRef = collection(db, `users/${userId}/fields/${fieldId}/paddies/${paddyId}/logs`);
    await addDoc(logsRef, {
      ...readings,
      timestamp: serverTimestamp(),
      createdAt: new Date().toISOString(),
    });
    
    console.log(`Sensor readings logged for paddy ${paddyId}`);
  } catch (error) {
    console.error('Error logging sensor readings:', error);
  }
}

/**
 * Check if we should log new readings (rate limiting)
 * Prevents excessive logging - only log once per hour for each device
 */
export function shouldLogReadings(lastLogTime: number | null): boolean {
  if (!lastLogTime) return true;
  
  const ONE_HOUR = 60 * 60 * 1000;
  const timeSinceLastLog = Date.now() - lastLogTime;
  
  return timeSinceLastLog >= ONE_HOUR;
}

/**
 * Auto-log readings with rate limiting
 * Tracks last log time in memory to prevent duplicate logs
 */
const lastLogTimes = new Map<string, number>();

export async function autoLogReadings(
  userId: string,
  fieldId: string,
  paddyId: string,
  npk: DeviceNPK
): Promise<void> {
  const key = `${userId}_${fieldId}_${paddyId}`;
  const lastLog = lastLogTimes.get(key) || null;
  
  if (shouldLogReadings(lastLog)) {
    await logSensorReadings(userId, fieldId, paddyId, npk);
    lastLogTimes.set(key, Date.now());
  }
}
