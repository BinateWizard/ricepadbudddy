import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { SensorReadings } from './deviceStatus';

/**
 * Log sensor readings to Firestore for historical tracking
 * 
 * This should be called when fetching fresh sensor data from RTDB
 * to maintain a historical record for trends and analysis
 */
export async function logSensorReadings(
  userId: string,
  fieldId: string,
  paddyId: string,
  readings: SensorReadings
): Promise<void> {
  try {
    // Only log if we have actual readings
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
  readings: SensorReadings
): Promise<void> {
  const key = `${userId}_${fieldId}_${paddyId}`;
  const lastLog = lastLogTimes.get(key) || null;
  
  if (shouldLogReadings(lastLog)) {
    await logSensorReadings(userId, fieldId, paddyId, readings);
    lastLogTimes.set(key, Date.now());
  }
}
