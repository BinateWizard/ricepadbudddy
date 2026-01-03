/**
 * Realtime Database Helper Utilities for PadBuddy Architecture
 * Provides type-safe methods for interacting with RTDB
 */

import { Database, ref, get, set, update, remove, onValue, off } from 'firebase/database';
import {
  RTDBHeartbeat,
  RTDBCommand,
  RTDBDeviceData,
  rtdbPaths
} from '@/lib/types/firestore-schema';

/**
 * HEARTBEAT OPERATIONS
 */

export async function updateDeviceHeartbeat(
  database: Database,
  deviceId: string,
  status: 'online' | 'offline',
  deviceName?: string
): Promise<void> {
  const heartbeatRef = ref(database, rtdbPaths.deviceHeartbeat(deviceId));
  await set(heartbeatRef, {
    lastSeen: Date.now(),
    status,
    deviceName: deviceName || deviceId
  } as RTDBHeartbeat);
}

export async function getDeviceHeartbeat(
  database: Database,
  deviceId: string
): Promise<RTDBHeartbeat | null> {
  const heartbeatRef = ref(database, rtdbPaths.deviceHeartbeat(deviceId));
  const snapshot = await get(heartbeatRef);
  return snapshot.exists() ? snapshot.val() : null;
}

export function subscribeToHeartbeat(
  database: Database,
  deviceId: string,
  callback: (heartbeat: RTDBHeartbeat | null) => void
): () => void {
  const heartbeatRef = ref(database, rtdbPaths.deviceHeartbeat(deviceId));
  
  const listener = onValue(heartbeatRef, (snapshot) => {
    callback(snapshot.exists() ? snapshot.val() : null);
  });
  
  // Return unsubscribe function
  return () => off(heartbeatRef);
}

/**
 * COMMAND OPERATIONS
 */

export async function sendLiveCommand(
  database: Database,
  deviceId: string,
  relay: number,
  action: 'ON' | 'OFF'
): Promise<string> {
  const commandId = `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const commandRef = ref(database, rtdbPaths.deviceCommand(deviceId, commandId));
  
  const command: RTDBCommand = {
    commandId,
    relay,
    requestedState: action,
    timestamp: Date.now(),
    status: 'pending'
  };
  
  await set(commandRef, command);
  return commandId;
}

export async function getCommand(
  database: Database,
  deviceId: string,
  commandId: string
): Promise<RTDBCommand | null> {
  const commandRef = ref(database, rtdbPaths.deviceCommand(deviceId, commandId));
  const snapshot = await get(commandRef);
  return snapshot.exists() ? snapshot.val() : null;
}

export async function updateCommandStatus(
  database: Database,
  deviceId: string,
  commandId: string,
  status: 'pending' | 'acknowledged' | 'executed' | 'failed',
  result?: string
): Promise<void> {
  const commandRef = ref(database, rtdbPaths.deviceCommand(deviceId, commandId));
  await update(commandRef, {
    status,
    result: result || null
  });
}

export function subscribeToCommand(
  database: Database,
  deviceId: string,
  commandId: string,
  callback: (command: RTDBCommand | null) => void
): () => void {
  const commandRef = ref(database, rtdbPaths.deviceCommand(deviceId, commandId));
  
  const listener = onValue(commandRef, (snapshot) => {
    callback(snapshot.exists() ? snapshot.val() : null);
  });
  
  return () => off(commandRef);
}

export function subscribeToAllCommands(
  database: Database,
  deviceId: string,
  callback: (commands: Record<string, RTDBCommand> | null) => void
): () => void {
  const commandsRef = ref(database, rtdbPaths.deviceCommands(deviceId));
  
  const listener = onValue(commandsRef, (snapshot) => {
    callback(snapshot.exists() ? snapshot.val() : null);
  });
  
  return () => off(commandsRef);
}

/**
 * DEVICE DATA OPERATIONS
 */

export async function getDeviceData(
  database: Database,
  deviceId: string
): Promise<RTDBDeviceData | null> {
  const deviceRef = ref(database, rtdbPaths.device(deviceId));
  const snapshot = await get(deviceRef);
  return snapshot.exists() ? snapshot.val() : null;
}

export async function updateDeviceData(
  database: Database,
  deviceId: string,
  data: Partial<RTDBDeviceData>
): Promise<void> {
  const deviceRef = ref(database, rtdbPaths.device(deviceId));
  await update(deviceRef, data);
}

export function subscribeToDevice(
  database: Database,
  deviceId: string,
  callback: (data: RTDBDeviceData | null) => void
): () => void {
  const deviceRef = ref(database, rtdbPaths.device(deviceId));
  
  const listener = onValue(deviceRef, (snapshot) => {
    callback(snapshot.exists() ? snapshot.val() : null);
  });
  
  return () => off(deviceRef);
}

/**
 * NPK SENSOR OPERATIONS
 */

export async function updateDeviceNPK(
  database: Database,
  deviceId: string,
  npkData: {
    n?: number;
    p?: number;
    k?: number;
  }
): Promise<void> {
  const deviceRef = ref(database, `${rtdbPaths.device(deviceId)}/npk`);
  await update(deviceRef, {
    ...npkData,
    lastUpdate: Date.now(),
    timestamp: Date.now()
  });
}

export async function getDeviceNPK(
  database: Database,
  deviceId: string
): Promise<{ n?: number; p?: number; k?: number; lastUpdate?: number } | null> {
  const npkRef = ref(database, `${rtdbPaths.device(deviceId)}/npk`);
  const snapshot = await get(npkRef);
  return snapshot.exists() ? snapshot.val() : null;
}

/**
 * GPS OPERATIONS
 */

export async function updateDeviceGPS(
  database: Database,
  deviceId: string,
  gpsData: {
    lat?: number;
    lng?: number;
    alt?: number;
    hdop?: number;
    sats?: number;
  }
): Promise<void> {
  const gpsRef = ref(database, `${rtdbPaths.device(deviceId)}/gps`);
  await update(gpsRef, {
    ...gpsData,
    ts: Date.now()
  });
}

export async function getDeviceGPS(
  database: Database,
  deviceId: string
): Promise<{ lat?: number; lng?: number; alt?: number; ts?: number } | null> {
  const gpsRef = ref(database, `${rtdbPaths.device(deviceId)}/gps`);
  const snapshot = await get(gpsRef);
  return snapshot.exists() ? snapshot.val() : null;
}

/**
 * UTILITY FUNCTIONS
 */

export function isDeviceOnline(heartbeat: RTDBHeartbeat | null): boolean {
  if (!heartbeat) return false;
  
  const now = Date.now();
  const lastSeen = heartbeat.lastSeen || 0;
  const minutesAgo = (now - lastSeen) / (1000 * 60);
  
  // Consider device online if heartbeat within last 5 minutes
  return minutesAgo < 5;
}

export function getDeviceOfflineMinutes(heartbeat: RTDBHeartbeat | null): number | null {
  if (!heartbeat || !heartbeat.lastSeen) return null;
  
  const now = Date.now();
  const minutesAgo = Math.floor((now - heartbeat.lastSeen) / (1000 * 60));
  
  return minutesAgo;
}
