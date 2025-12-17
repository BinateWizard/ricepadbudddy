import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { NotificationInput } from '@/lib/types/notifications';

/**
 * Create a notification for a user
 * 
 * @param userId - The user's Firebase UID
 * @param notification - Notification data
 */
export async function createNotification(userId: string, notification: NotificationInput) {
  try {
    const notificationsRef = collection(db, `users/${userId}/notifications`);
    await addDoc(notificationsRef, {
      ...notification,
      read: false,
      createdAt: serverTimestamp(),
    });
    console.log('Notification created:', notification.title);
  } catch (error) {
    console.error('Error creating notification:', error);
    throw error;
  }
}

/**
 * Notify user when a device goes offline
 */
export async function notifyDeviceOffline(
  userId: string,
  deviceId: string,
  paddyName?: string,
  fieldId?: string,
  fieldName?: string
) {
  await createNotification(userId, {
    type: 'device_offline',
    title: 'Device Offline',
    message: paddyName 
      ? `${paddyName} (${deviceId}) has gone offline and is no longer sending data.`
      : `Device ${deviceId} has gone offline.`,
    icon: '🔴',
    fieldId,
    fieldName,
    deviceId,
    actionUrl: fieldId ? `/field/${fieldId}` : undefined,
  });
}

/**
 * Notify user when a device comes back online
 */
export async function notifyDeviceOnline(
  userId: string,
  deviceId: string,
  paddyName?: string,
  fieldId?: string,
  fieldName?: string
) {
  await createNotification(userId, {
    type: 'device_online',
    title: 'Device Back Online',
    message: paddyName
      ? `${paddyName} (${deviceId}) is back online and sending data.`
      : `Device ${deviceId} is back online.`,
    icon: '🟢',
    fieldId,
    fieldName,
    deviceId,
    actionUrl: fieldId ? `/field/${fieldId}` : undefined,
  });
}

/**
 * Notify user about a task reminder
 */
export async function notifyTaskReminder(
  userId: string,
  taskTitle: string,
  fieldId: string,
  fieldName: string,
  dayNumber: number
) {
  await createNotification(userId, {
    type: 'task_reminder',
    title: 'Task Reminder',
    message: `Day ${dayNumber}: ${taskTitle} in ${fieldName}`,
    icon: '📋',
    fieldId,
    fieldName,
    actionUrl: `/field/${fieldId}`,
  });
}

/**
 * Notify user when rice enters a new growth stage
 */
export async function notifyGrowthStageChange(
  userId: string,
  stageName: string,
  fieldId: string,
  fieldName: string,
  dayNumber: number
) {
  await createNotification(userId, {
    type: 'growth_stage_change',
    title: 'Growth Stage Update',
    message: `Your rice in ${fieldName} has entered the ${stageName} stage (Day ${dayNumber}).`,
    icon: '🌱',
    fieldId,
    fieldName,
    actionUrl: `/field/${fieldId}`,
  });
}

/**
 * Notify user about critical sensor readings
 */
export async function notifyCriticalSensor(
  userId: string,
  sensorType: 'nitrogen' | 'phosphorus' | 'potassium' | 'temperature' | 'humidity' | 'waterLevel',
  value: number,
  unit: string,
  isLow: boolean,
  paddyId: string,
  paddyName: string,
  fieldId: string,
  fieldName: string
) {
  const sensorNames = {
    nitrogen: 'Nitrogen (N)',
    phosphorus: 'Phosphorus (P)',
    potassium: 'Potassium (K)',
    temperature: 'Temperature',
    humidity: 'Humidity',
    waterLevel: 'Water Level',
  };

  await createNotification(userId, {
    type: 'critical_sensor',
    title: `${isLow ? 'Low' : 'High'} ${sensorNames[sensorType]} Alert`,
    message: `${sensorNames[sensorType]} is ${isLow ? 'critically low' : 'too high'} at ${value}${unit} in ${paddyName}.`,
    icon: '⚠️',
    fieldId,
    fieldName,
    paddyId,
    paddyName,
    actionUrl: `/device/${paddyId}`,
  });
}

/**
 * Notify user when rice is ready for harvest
 */
export async function notifyHarvestReady(
  userId: string,
  fieldId: string,
  fieldName: string,
  daysUntilHarvest: number
) {
  const message = daysUntilHarvest === 0
    ? `Your rice in ${fieldName} is ready for harvest today!`
    : `Your rice in ${fieldName} will be ready for harvest in ${daysUntilHarvest} days.`;

  await createNotification(userId, {
    type: 'harvest_ready',
    title: daysUntilHarvest === 0 ? 'Harvest Ready!' : 'Harvest Approaching',
    message,
    icon: '🌾',
    fieldId,
    fieldName,
    actionUrl: `/field/${fieldId}`,
  });
}

/**
 * Create a general notification
 */
export async function notifyGeneral(
  userId: string,
  title: string,
  message: string,
  icon?: string,
  fieldId?: string,
  fieldName?: string
) {
  await createNotification(userId, {
    type: 'general',
    title,
    message,
    icon: icon || '🔔',
    fieldId,
    fieldName,
    actionUrl: fieldId ? `/field/${fieldId}` : undefined,
  });
}
