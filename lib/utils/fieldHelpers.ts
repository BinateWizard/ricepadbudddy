import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

/**
 * Log sensor readings to Firestore for historical tracking
 * 
 * This function saves NPK and other sensor readings with timestamps
 * to enable historical data analysis and trend visualization.
 * 
 * Usage:
 * await logSensorReading(user.uid, fieldId, paddyId, {
 *   nitrogen: 45.2,
 *   phosphorus: 12.8,
 *   potassium: 38.5
 * });
 * 
 * Data is stored in: users/{userId}/fields/{fieldId}/paddies/{paddyId}/logs/{logId}
 * Each log automatically includes timestamp and createdAt fields
 */
export async function logSensorReading(
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
  }
) {
  try {
    const logsRef = collection(db, `users/${userId}/fields/${fieldId}/paddies/${paddyId}/logs`);
    await addDoc(logsRef, {
      ...readings,
      timestamp: serverTimestamp(),
      createdAt: new Date().toISOString()
    });
    console.log('Sensor reading logged successfully');
    return true;
  } catch (error) {
    console.error('Error logging sensor reading:', error);
    return false;
  }
}

/**
 * Formats a timestamp into a human-readable "time ago" string
 */
export function getTimeAgo(timestamp: number | Date): string {
  const now = Date.now();
  const time = timestamp instanceof Date ? timestamp.getTime() : timestamp;
  const diffMs = now - time;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins === 1) return '1 minute ago';
  if (diffMins < 60) return `${diffMins} minutes ago`;
  if (diffHours === 1) return '1 hour ago';
  if (diffHours < 24) return `${diffHours} hours ago`;
  if (diffDays === 1) return '1 day ago';
  return `${diffDays} days ago`;
}
