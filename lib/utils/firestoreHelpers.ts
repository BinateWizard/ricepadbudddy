/**
 * Firestore Helper Utilities for PadBuddy Architecture
 * Provides type-safe methods for interacting with Firestore collections
 */

import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  Firestore,
  Timestamp,
  serverTimestamp
} from 'firebase/firestore';

import {
  UserDocument,
  FieldDocument,
  DeviceDocument,
  DeviceLogDocument,
  DeviceScheduleDocument,
  CreateFieldRequest,
  CreateDeviceRequest,
  firestorePaths
} from '@/lib/types/firestore-schema';

/**
 * USER OPERATIONS
 */

export async function createOrUpdateUser(
  db: Firestore,
  userId: string,
  userData: Partial<UserDocument>
): Promise<void> {
  const userRef = doc(db, 'users', userId);
  await updateDoc(userRef, {
    ...userData,
    createdAt: userData.createdAt ?? Date.now()
  } as any);
}

export async function getUserProfile(
  db: Firestore,
  userId: string
): Promise<UserDocument | null> {
  const userRef = doc(db, 'users', userId);
  const userSnap = await getDoc(userRef);
  return userSnap.exists() ? (userSnap.data() as UserDocument) : null;
}

export async function addUserNotification(
  db: Firestore,
  userId: string,
  notification: {
    type: 'offline' | 'commandFailed' | 'system';
    message: string;
  }
): Promise<void> {
  const userRef = doc(db, 'users', userId);
  const userDoc = await getDoc(userRef);
  
  if (userDoc.exists()) {
    const userData = userDoc.data() as UserDocument;
    const notifications = userData.notifications || [];
    
    notifications.unshift({
      ...notification,
      timestamp: Date.now(),
      read: false
    });
    
    // Keep only last 50 notifications
    if (notifications.length > 50) {
      notifications.splice(50);
    }
    
    await updateDoc(userRef, { notifications } as any);
  }
}

/**
 * FIELD OPERATIONS
 */

export async function createField(
  db: Firestore,
  fieldData: CreateFieldRequest
): Promise<string> {
  const fieldsRef = collection(db, 'fields');
  const docRef = await addDoc(fieldsRef, {
    ...fieldData,
    createdAt: Date.now()
  });
  
  // Update user's fieldsOwned array
  const userRef = doc(db, 'users', fieldData.ownerId);
  const userDoc = await getDoc(userRef);
  
  if (userDoc.exists()) {
    const userData = userDoc.data() as UserDocument;
    const fieldsOwned = userData.fieldsOwned || [];
    
    if (!fieldsOwned.includes(docRef.id)) {
      fieldsOwned.push(docRef.id);
      await updateDoc(userRef, { 
        fieldsOwned,
        'statistics.totalFields': fieldsOwned.length
      } as any);
    }
  }
  
  return docRef.id;
}

export async function getField(
  db: Firestore,
  fieldId: string
): Promise<FieldDocument | null> {
  const fieldRef = doc(db, 'fields', fieldId);
  const fieldSnap = await getDoc(fieldRef);
  return fieldSnap.exists() ? (fieldSnap.data() as FieldDocument) : null;
}

export async function getUserFields(
  db: Firestore,
  userId: string
): Promise<Array<FieldDocument & { id: string }>> {
  const fieldsRef = collection(db, 'fields');
  const q = query(fieldsRef, where('ownerId', '==', userId));
  const querySnapshot = await getDocs(q);
  
  return querySnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data() as FieldDocument
  }));
}

export async function addDeviceToField(
  db: Firestore,
  fieldId: string,
  deviceId: string
): Promise<void> {
  const fieldRef = doc(db, 'fields', fieldId);
  const fieldDoc = await getDoc(fieldRef);
  
  if (fieldDoc.exists()) {
    const fieldData = fieldDoc.data() as FieldDocument;
    const devices = fieldData.devices || [];
    
    if (!devices.includes(deviceId)) {
      devices.push(deviceId);
      await updateDoc(fieldRef, { devices } as any);
    }
  }
}

/**
 * DEVICE OPERATIONS
 */

export async function createDevice(
  db: Firestore,
  deviceData: CreateDeviceRequest
): Promise<string> {
  const devicesRef = collection(db, 'devices');
  const docRef = await addDoc(devicesRef, {
    ...deviceData,
    connected: false,
    lastHeartbeat: Date.now(),
    createdAt: Date.now()
  });
  
  // Update user's devicesOwned array
  const userRef = doc(db, 'users', deviceData.ownerId);
  const userDoc = await getDoc(userRef);
  
  if (userDoc.exists()) {
    const userData = userDoc.data() as UserDocument;
    const devicesOwned = userData.devicesOwned || [];
    
    if (!devicesOwned.includes(deviceData.deviceId)) {
      devicesOwned.push(deviceData.deviceId);
      await updateDoc(userRef, { 
        devicesOwned,
        'statistics.totalDevices': devicesOwned.length
      } as any);
    }
  }
  
  // Add device to field if fieldId provided
  if (deviceData.fieldId) {
    await addDeviceToField(db, deviceData.fieldId, deviceData.deviceId);
  }
  
  return docRef.id;
}

export async function getDevice(
  db: Firestore,
  deviceId: string
): Promise<(DeviceDocument & { id: string }) | null> {
  const devicesRef = collection(db, 'devices');
  const q = query(devicesRef, where('deviceId', '==', deviceId), limit(1));
  const querySnapshot = await getDocs(q);
  
  if (querySnapshot.empty) return null;
  
  const doc = querySnapshot.docs[0];
  return {
    id: doc.id,
    ...doc.data() as DeviceDocument
  };
}

export async function updateDeviceStatus(
  db: Firestore,
  deviceId: string,
  connected: boolean,
  lastHeartbeat?: number
): Promise<void> {
  const device = await getDevice(db, deviceId);
  if (!device) return;
  
  const deviceRef = doc(db, 'devices', device.id);
  await updateDoc(deviceRef, {
    connected,
    lastHeartbeat: lastHeartbeat ?? Date.now()
  } as any);
}

/**
 * DEVICE LOGS OPERATIONS
 */

export async function addDeviceLog(
  db: Firestore,
  deviceId: string,
  logData: Omit<DeviceLogDocument, 'timestamp'>
): Promise<string> {
  const device = await getDevice(db, deviceId);
  if (!device) throw new Error(`Device ${deviceId} not found`);
  
  const logsRef = collection(db, 'devices', device.id, 'logs');
  const docRef = await addDoc(logsRef, {
    ...logData,
    timestamp: Date.now()
  });
  
  return docRef.id;
}

export async function getDeviceLogs(
  db: Firestore,
  deviceId: string,
  limitCount: number = 50
): Promise<Array<DeviceLogDocument & { id: string }>> {
  const device = await getDevice(db, deviceId);
  if (!device) return [];
  
  const logsRef = collection(db, 'devices', device.id, 'logs');
  const q = query(logsRef, orderBy('timestamp', 'desc'), limit(limitCount));
  const querySnapshot = await getDocs(q);
  
  return querySnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data() as DeviceLogDocument
  }));
}

/**
 * DEVICE SCHEDULES OPERATIONS
 */

export async function createDeviceSchedule(
  db: Firestore,
  deviceId: string,
  scheduleData: Omit<DeviceScheduleDocument, 'executedAt'>
): Promise<string> {
  const device = await getDevice(db, deviceId);
  if (!device) throw new Error(`Device ${deviceId} not found`);
  
  const schedulesRef = collection(db, 'devices', device.id, 'schedules');
  const docRef = await addDoc(schedulesRef, {
    ...scheduleData,
    executedAt: null
  });
  
  return docRef.id;
}

export async function getDeviceSchedules(
  db: Firestore,
  deviceId: string,
  status?: 'pending' | 'executed' | 'failed'
): Promise<Array<DeviceScheduleDocument & { id: string }>> {
  const device = await getDevice(db, deviceId);
  if (!device) return [];
  
  const schedulesRef = collection(db, 'devices', device.id, 'schedules');
  let q = query(schedulesRef, orderBy('scheduledTime', 'asc'));
  
  if (status) {
    q = query(schedulesRef, where('status', '==', status), orderBy('scheduledTime', 'asc'));
  }
  
  const querySnapshot = await getDocs(q);
  
  return querySnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data() as DeviceScheduleDocument
  }));
}

export async function updateScheduleStatus(
  db: Firestore,
  deviceId: string,
  scheduleId: string,
  status: 'pending' | 'executed' | 'failed',
  executedAt?: number
): Promise<void> {
  const device = await getDevice(db, deviceId);
  if (!device) return;
  
  const scheduleRef = doc(db, 'devices', device.id, 'schedules', scheduleId);
  await updateDoc(scheduleRef, {
    status,
    executedAt: executedAt ?? null
  } as any);
}
