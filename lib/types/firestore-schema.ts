/**
 * PadBuddy Firestore + RTDB Layered Architecture
 * Complete TypeScript type definitions
 */

import { FieldValue, Timestamp } from 'firebase/firestore';

// ============================================
// 1️⃣ USERS COLLECTION
// ============================================

export interface UserNotification {
  type: 'offline' | 'commandFailed' | 'system';
  message: string;
  timestamp: number;
  read: boolean;
}

export interface UserStatistics {
  totalFields: number;
  totalDevices: number;
}

export interface UserDocument {
  displayName: string;
  email: string;
  photoURL?: string;
  createdAt: number | FieldValue;
  fieldsOwned?: string[];       // optional array of field IDs
  devicesOwned?: string[];      // optional array of device IDs
  statistics?: UserStatistics;
  notifications?: UserNotification[];
}

// ============================================
// 2️⃣ FIELDS COLLECTION
// ============================================

export interface PlotPoint {
  lat: number;
  lng: number;
}

export type PlantingType = 'transplant' | 'direct' | 'sabog';

export interface FieldDocument {
  ownerId: string;              // reference to user
  name: string;
  description?: string;         // optional
  variety?: string;             // optional rice variety (e.g., "IR64")
  plantingType?: PlantingType;  // optional
  startDate?: number;           // optional timestamp
  devices?: string[];           // optional array of device IDs
  plot?: PlotPoint[];           // optional array of points for area calculation
  plots?: Array<{               // optional array of saved GPS plots (user-specific)
    name: string;
    coordinates: PlotPoint;
    altitude?: number;
    deviceId: string;
    createdBy: string;
    createdAt: any;
    timestamp: number;
  }>;
  createdAt: number | FieldValue;
}

// ============================================
// 3️⃣ DEVICES COLLECTION
// ============================================

export interface DeviceLocation {
  lat: number;
  lng: number;
}

export interface DeviceDocument {
  ownerId: string;              // reference to user
  fieldId?: string;             // optional
  name: string;
  deviceType: string;           // e.g., "ESP32"
  deviceId: string;
  description?: string;         // optional
  connected: boolean;           // online/offline
  lastHeartbeat: number;        // timestamp of last heartbeat
  location?: DeviceLocation;    // optional GPS coordinates
  plot?: PlotPoint[];           // optional multi-point plot for map
  createdAt: number | FieldValue;
}

// ============================================
// 3a) DEVICE LOGS SUBCOLLECTION
// ============================================

export type LogType = 'live' | 'scheduled' | 'system';

export interface DeviceLogDocument {
  type: LogType;
  command: string;              // e.g., "relay2_ON"
  requestedState: string;       // e.g., "ON"
  actualState: string;          // e.g., "ON"
  success: boolean;
  timestamp: number | FieldValue;
  commandId: string;
  functionTriggered?: string;   // e.g., "scheduledCommandFunction"
  userId: string;
}

// ============================================
// 3b) DEVICE SCHEDULES SUBCOLLECTION
// ============================================

export type ScheduleStatus = 'pending' | 'executed' | 'failed';

export interface DeviceScheduleDocument {
  relay: number;                // relay number
  action: 'ON' | 'OFF';
  scheduledTime: number;        // timestamp
  status: ScheduleStatus;
  createdBy: string;            // user ID
  executedAt?: number | null;   // timestamp or null
}

// ============================================
// 4️⃣ REALTIME DATABASE (RTDB) LAYER
// ============================================

export interface RTDBHeartbeat {
  lastSeen: number;
  status: 'online' | 'offline';
  deviceName?: string;
}

export interface RTDBCommand {
  commandId: string;
  relay: number;
  requestedState: 'ON' | 'OFF';
  timestamp: number;
  status?: 'pending' | 'acknowledged' | 'executed' | 'failed';
  result?: string;
}

export interface RTDBDeviceData {
  heartbeat?: RTDBHeartbeat;
  commands?: {
    [commandId: string]: RTDBCommand;
  };
  npk?: {
    n?: number;
    p?: number;
    k?: number;
    lastUpdate?: number;
    timestamp?: number;
  };
  gps?: {
    lat?: number;
    lng?: number;
    alt?: number;
    hdop?: number;
    sats?: number;
    ts?: number;
  };
  status?: string;
  ownedBy?: string;
  connectedTo?: string;
  fieldId?: string;
  paddyName?: string;
}

// ============================================
// 5️⃣ HELPER TYPES & UTILITY INTERFACES
// ============================================

export interface FirestorePaths {
  users: (userId: string) => string;
  fields: (userId: string, fieldId: string) => string;
  devices: (deviceId: string) => string;
  deviceLogs: (deviceId: string, logId: string) => string;
  deviceSchedules: (deviceId: string, scheduleId: string) => string;
}

export const firestorePaths: FirestorePaths = {
  users: (userId) => `users/${userId}`,
  fields: (userId, fieldId) => `users/${userId}/fields/${fieldId}`,
  devices: (deviceId) => `devices/${deviceId}`,
  deviceLogs: (deviceId, logId) => `devices/${deviceId}/logs/${logId}`,
  deviceSchedules: (deviceId, scheduleId) => `devices/${deviceId}/schedules/${scheduleId}`,
};

export interface RTDBPaths {
  deviceHeartbeat: (deviceId: string) => string;
  deviceCommands: (deviceId: string) => string;
  deviceCommand: (deviceId: string, commandId: string) => string;
  device: (deviceId: string) => string;
}

export const rtdbPaths: RTDBPaths = {
  deviceHeartbeat: (deviceId) => `/devices/${deviceId}/heartbeat`,
  deviceCommands: (deviceId) => `/devices/${deviceId}/commands`,
  deviceCommand: (deviceId, commandId) => `/devices/${deviceId}/commands/${commandId}`,
  device: (deviceId) => `/devices/${deviceId}`,
};

// ============================================
// 6️⃣ LEGACY COMPATIBILITY TYPES
// ============================================

// For backward compatibility with existing "paddies" subcollection
export interface LegacyPaddyDocument {
  paddyName: string;
  description?: string;
  deviceId: string;
  shapeType?: string;
  length?: number;
  width?: number;
  width2?: number;
  areaM2?: number;
  areaHectares?: number;
  connectedAt?: any;
  status?: string;
}

// ============================================
// 7️⃣ API REQUEST/RESPONSE TYPES
// ============================================

export interface CreateFieldRequest {
  ownerId: string;
  name: string;
  description?: string;
  variety?: string;
  plantingType?: PlantingType;
  startDate?: number;
  devices?: string[];
  plot?: PlotPoint[];
}

export interface CreateDeviceRequest {
  ownerId: string;
  fieldId?: string;
  name: string;
  deviceType: string;
  deviceId: string;
  description?: string;
  location?: DeviceLocation;
  plot?: PlotPoint[];
}

export interface SendCommandRequest {
  deviceId: string;
  userId: string;
  relay: number;
  action: 'ON' | 'OFF';
  commandType?: 'live' | 'scheduled';
}

export interface CreateScheduleRequest {
  deviceId: string;
  userId: string;
  relay: number;
  action: 'ON' | 'OFF';
  scheduledTime: number;
}

// ============================================
// 8️⃣ RESPONSE TYPES
// ============================================

export interface DeviceWithStatus extends DeviceDocument {
  id: string;
  isOnline: boolean;
  minutesOffline?: number;
}

export interface FieldWithDevices extends FieldDocument {
  id: string;
  deviceCount: number;
  onlineDevices: number;
  offlineDevices: number;
}

export interface UserProfile extends UserDocument {
  id: string;
  lastLogin?: number;
}
