import { database } from '@/lib/firebase';
import { ref, get } from 'firebase/database';

/**
 * RTDB Structure Expected:
 * devices/
 *   DEVICE_0001/
 *     heartbeat: timestamp (number)
 *     sensors/
 *       nitrogen: number (mg/kg)
 *       phosphorus: number (mg/kg)
 *       potassium: number (mg/kg)
 *       temperature: number (°C)
 *       humidity: number (%)
 *       waterLevel: number (cm)
 *     location/
 *       latitude: number
 *       longitude: number
 *       timestamp: number
 */

export interface DeviceHeartbeat {
  isAlive: boolean;
  lastSeen: number | null;
  minutesAgo: number | null;
}

export interface SensorReadings {
  nitrogen?: number;
  phosphorus?: number;
  potassium?: number;
  temperature?: number;
  humidity?: number;
  waterLevel?: number;
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
 * Check if device heartbeat is active (within last 5 minutes)
 */
export async function checkDeviceHeartbeat(deviceId: string): Promise<DeviceHeartbeat> {
  try {
    const heartbeatRef = ref(database, `devices/${deviceId}/heartbeat`);
    const snapshot = await get(heartbeatRef);
    
    if (!snapshot.exists()) {
      return { isAlive: false, lastSeen: null, minutesAgo: null };
    }
    
    const lastHeartbeat = snapshot.val() as number;
    const now = Date.now();
    const minutesAgo = Math.floor((now - lastHeartbeat) / 60000);
    
    // Consider device alive if heartbeat within last 5 minutes
    const isAlive = minutesAgo < 5;
    
    return { isAlive, lastSeen: lastHeartbeat, minutesAgo };
  } catch (error) {
    console.error(`Error checking heartbeat for ${deviceId}:`, error);
    return { isAlive: false, lastSeen: null, minutesAgo: null };
  }
}

/**
 * Get current sensor readings from RTDB
 */
export async function getDeviceSensorReadings(deviceId: string): Promise<SensorReadings> {
  try {
    const sensorsRef = ref(database, `devices/${deviceId}/sensors`);
    const snapshot = await get(sensorsRef);
    
    if (!snapshot.exists()) {
      return {};
    }
    
    return snapshot.val() as SensorReadings;
  } catch (error) {
    console.error(`Error fetching sensor readings for ${deviceId}:`, error);
    return {};
  }
}

/**
 * Get complete device status with heartbeat and sensor checks
 */
export async function getDeviceStatus(deviceId: string): Promise<DeviceStatusResult> {
  const heartbeat = await checkDeviceHeartbeat(deviceId);
  const readings = await getDeviceSensorReadings(deviceId);
  
  const hasReadings = Object.keys(readings).length > 0 && 
                      (readings.nitrogen !== undefined || 
                       readings.phosphorus !== undefined || 
                       readings.potassium !== undefined);
  
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
  
  // Determine status
  if (!heartbeat.isAlive && !hasReadings) {
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
