import { database } from '@/lib/firebase';
import { ref, get } from 'firebase/database';

/**
 * RTDB Structure:
 * devices/
 *   DEVICE_0001/
 *     connectedAt: ISO timestamp string
 *     connectedTo: userId
 *     fieldId: fieldId
 *     gps: { alt, hdop, lat, lng, sats, ts }
 *     npk: { k, n, p, timestamp }
 *     paddyName: string
 *     status: "connected" | "disconnected"
 */

export interface DeviceNPK {
  n?: number;  // Nitrogen
  p?: number;  // Phosphorus
  k?: number;  // Potassium
  timestamp?: number;
}

export interface DeviceGPS {
  lat?: number;
  lng?: number;
  alt?: number;
  hdop?: number;
  sats?: number;
  ts?: number;
}

export interface DeviceData {
  connectedAt?: string;
  connectedTo?: string;
  fieldId?: string;
  paddyName?: string;
  status?: string;
  npk?: DeviceNPK;
  gps?: DeviceGPS;
}

export interface DeviceHeartbeat {
  isAlive: boolean;
  lastSeen: string | null;
  minutesAgo: number | null;
}

export interface SensorReadings {
  nitrogen?: number;
  phosphorus?: number;
  potassium?: number;
  timestamp?: number;
}

export interface DeviceStatusResult {
  status: 'offline' | 'sensor-issue' | 'ok';
  message: string;
  color: 'red' | 'yellow' | 'green';
  badge: string;
  lastUpdate: string;
  heartbeat: DeviceHeartbeat;
  readings: SensorReadings;
}

/**
 * Get complete device data from RTDB
 */
export async function getDeviceData(deviceId: string): Promise<DeviceData | null> {
  try {
    const deviceRef = ref(database, `devices/${deviceId}`);
    const snapshot = await get(deviceRef);
    
    if (!snapshot.exists()) {
      return null;
    }
    
    return snapshot.val() as DeviceData;
  } catch (error) {
    console.error(`Error fetching device data for ${deviceId}:`, error);
    return null;
  }
}

/**
 * Check if device is connected (based on status and connectedAt)
 */
export async function checkDeviceHeartbeat(deviceId: string): Promise<DeviceHeartbeat> {
  try {
    const deviceData = await getDeviceData(deviceId);
    
    if (!deviceData || !deviceData.connectedAt) {
      return { isAlive: false, lastSeen: null, minutesAgo: null };
    }
    
    const connectedAt = new Date(deviceData.connectedAt).getTime();
    const now = Date.now();
    const minutesAgo = Math.floor((now - connectedAt) / 60000);
    
    // Consider device alive if status is "connected" and connected within last 5 minutes
    const isAlive = deviceData.status === 'connected' && minutesAgo < 5;
    
    return { isAlive, lastSeen: deviceData.connectedAt, minutesAgo };
  } catch (error) {
    console.error(`Error checking heartbeat for ${deviceId}:`, error);
    return { isAlive: false, lastSeen: null, minutesAgo: null };
  }
}

/**
 * Get current NPK sensor readings from RTDB
 */
export async function getDeviceSensorReadings(deviceId: string): Promise<SensorReadings> {
  try {
    const deviceData = await getDeviceData(deviceId);
    
    if (!deviceData || !deviceData.npk) {
      return {};
    }
    
    // Convert n, p, k to nitrogen, phosphorus, potassium
    return {
      nitrogen: deviceData.npk.n,
      phosphorus: deviceData.npk.p,
      potassium: deviceData.npk.k,
      timestamp: deviceData.npk.timestamp,
    };
  } catch (error) {
    console.error(`Error fetching sensor readings for ${deviceId}:`, error);
    return {};
  }
}

/**
 * Get NPK values for a device
 */
export async function getDeviceNPK(deviceId: string): Promise<DeviceNPK | null> {
  try {
    const deviceData = await getDeviceData(deviceId);
    return deviceData?.npk || null;
  } catch (error) {
    console.error(`Error fetching NPK for ${deviceId}:`, error);
    return null;
  }
}

/**
 * Get GPS location for a device
 */
export async function getDeviceGPS(deviceId: string): Promise<DeviceGPS | null> {
  try {
    const deviceData = await getDeviceData(deviceId);
    return deviceData?.gps || null;
  } catch (error) {
    console.error(`Error fetching GPS for ${deviceId}:`, error);
    return null;
  }
}

/**
 * Get complete device status with heartbeat and sensor checks
 */
export async function getDeviceStatus(deviceId: string): Promise<DeviceStatusResult> {
  const deviceData = await getDeviceData(deviceId);
  const heartbeat = await checkDeviceHeartbeat(deviceId);
  const readings = await getDeviceSensorReadings(deviceId);
  
  const hasReadings = readings.nitrogen !== undefined || 
                      readings.phosphorus !== undefined || 
                      readings.potassium !== undefined;
  
  // Format last update time
  let lastUpdate = 'No connection';
  if (heartbeat.lastSeen) {
    if (heartbeat.minutesAgo === 0) {
      lastUpdate = 'Just now';
    } else if (heartbeat.minutesAgo! < 60) {
      lastUpdate = `${heartbeat.minutesAgo}m ago`;
    } else if (heartbeat.minutesAgo! < 1440) {
      lastUpdate = `${Math.floor(heartbeat.minutesAgo! / 60)}h ago`;
    } else {
      lastUpdate = `${Math.floor(heartbeat.minutesAgo! / 1440)}d ago`;
    }
  }
  
  // Determine status based on deviceData.status
  const deviceStatus = deviceData?.status || 'disconnected';
  
  if (deviceStatus !== 'connected' || !heartbeat.isAlive) {
    return {
      status: 'offline',
      message: 'Device is offline. Check power and network connection.',
      color: 'red',
      badge: 'Offline',
      lastUpdate,
      heartbeat,
      readings,
    };
  }
  
  if (heartbeat.isAlive && !hasReadings) {
    return {
      status: 'sensor-issue',
      message: 'Device connected but sensor readings unavailable. Check sensor connections.',
      color: 'yellow',
      badge: 'Sensor Issue',
      lastUpdate,
      heartbeat,
      readings,
    };
  }
  
  return {
    status: 'ok',
    message: 'All systems operational',
    color: 'green',
    badge: 'Connected',
    lastUpdate,
    heartbeat,
    readings,
  };
}

/**
 * Get readings for multiple devices (batch operation)
 */
export async function getMultipleDeviceStatuses(deviceIds: string[]): Promise<Map<string, DeviceStatusResult>> {
  const statusMap = new Map<string, DeviceStatusResult>();
  
  const results = await Promise.all(
    deviceIds.map(deviceId => getDeviceStatus(deviceId))
  );
  
  deviceIds.forEach((deviceId, index) => {
    statusMap.set(deviceId, results[index]);
  });
  
  return statusMap;
}

/**
 * Format time ago string
 */
export function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const seconds = Math.floor((now - timestamp) / 1000);
  
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(timestamp).toLocaleDateString();
}
