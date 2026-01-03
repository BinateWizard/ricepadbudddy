import { database } from '@/lib/firebase';
import { ref, get } from 'firebase/database';
import { getDeviceData as rtdbGetDeviceData } from '@/lib/utils/rtdbHelper';

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
  heartbeat?: number | { timestamp?: number };
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
    const raw = await rtdbGetDeviceData(deviceId, '');
    
    if (!raw) {
      return null;
    }
    
    const deviceData = raw as DeviceData & { readings?: any; sensors?: any };

    const normalizeNpk = (data: any): DeviceNPK | undefined => {
      const source = data?.npk || data?.readings || data?.sensors || data;
      if (!source) return undefined;

      const n = source.n ?? source.nitrogen ?? source.N ?? null;
      const p = source.p ?? source.phosphorus ?? source.P ?? null;
      const k = source.k ?? source.potassium ?? source.K ?? null;
      const timestamp = source.timestamp ?? source.lastUpdate ?? source.ts ?? null;

      if (n === null && p === null && k === null) return undefined;
      return { n: n ?? undefined, p: p ?? undefined, k: k ?? undefined, timestamp: timestamp ?? undefined };
    };

    const npk = normalizeNpk(raw);

    return {
      ...raw,
      npk,
    } as DeviceData;
  } catch (error) {
    console.error(`Error fetching device data for ${deviceId}:`, error);
    return null;
  }
}

/**
 * Check if device is connected (based on multiple strategies)
 */
export async function checkDeviceHeartbeat(deviceId: string): Promise<DeviceHeartbeat> {
  try {
    const deviceData = await getDeviceData(deviceId);
    
    if (!deviceData) {
      return { isAlive: false, lastSeen: null, minutesAgo: null };
    }
    
    let isAlive = false;
    let lastSeen: string | null = null;
    let minutesAgo: number | null = null;
    const now = Date.now();
    
    // Strategy 1: Check device-level heartbeat timestamp (primary for relay testing)
    if (deviceData.heartbeat) {
      const heartbeatTs = typeof deviceData.heartbeat === 'object' 
        ? deviceData.heartbeat.timestamp 
        : deviceData.heartbeat;
      
      if (heartbeatTs) {
        const heartbeatMs = heartbeatTs < 1e11 ? heartbeatTs * 1000 : heartbeatTs;
        const age = now - heartbeatMs;
        minutesAgo = Math.floor(age / 60000);
        lastSeen = new Date(heartbeatMs).toISOString();
        
        // Device is alive if heartbeat is within last 10 minutes
        if (age < 10 * 60 * 1000) {
          isAlive = true;
        }
      }
    }
    
    // Strategy 2: Check device-level status field
    if (!isAlive && deviceData.status === 'connected') {
      isAlive = true;
    }
    
    // Strategy 3: Check connectedAt timestamp (if exists)
    if (!isAlive && deviceData.connectedAt) {
      try {
        const connectedAt = new Date(deviceData.connectedAt).getTime();
        minutesAgo = Math.floor((now - connectedAt) / 60000);
        lastSeen = deviceData.connectedAt;
        
        // If status isn't set, check if connected within last 10 minutes
        if (minutesAgo < 10) {
          isAlive = true;
        }
      } catch (e) {
        // Invalid date format
      }
    }
    
    // Strategy 4: If NPK data exists with small timestamp (relative counter from ESP32), device is online
    if (!isAlive && deviceData.npk && deviceData.npk.timestamp !== undefined && deviceData.npk.timestamp < 10000) {
      isAlive = true;
      lastSeen = lastSeen || 'Just now';
      minutesAgo = minutesAgo || 0;
    }
    
    // Strategy 5: Check NPK timestamp if it's a proper Unix timestamp
    if (!isAlive && deviceData.npk && deviceData.npk.timestamp && deviceData.npk.timestamp > 1e9) {
      const timestamp = deviceData.npk.timestamp < 1e11 
        ? deviceData.npk.timestamp * 1000 
        : deviceData.npk.timestamp;
      const age = now - timestamp;
      const minutes = Math.floor(age / 60000);
      
      if (minutes < 10) {
        isAlive = true;
        minutesAgo = minutes;
      }
    }
    
    return { isAlive, lastSeen, minutesAgo };
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
  
  // Device is online with active heartbeat but no NPK readings
  // This is acceptable for relay-testing mode
  if (heartbeat.isAlive && !hasReadings) {
    return {
      status: 'sensor-issue',
      message: 'Device connected but sensor readings unavailable. Ready for relay testing.',
      color: 'yellow',
      badge: 'Heartbeat Only',
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
 * Get device status for heartbeat-only devices (useful for relay testing)
 * Shows "Online - No Sensor Data" when device has heartbeat but no NPK
 */
export async function getDeviceHeartbeatStatus(deviceId: string): Promise<DeviceStatusResult> {
  const deviceData = await getDeviceData(deviceId);
  const heartbeat = await checkDeviceHeartbeat(deviceId);
  const readings: SensorReadings = {};
  
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
  
  if (!heartbeat.isAlive) {
    return {
      status: 'offline',
      message: 'Device is offline. No heartbeat detected.',
      color: 'red',
      badge: 'Offline',
      lastUpdate,
      heartbeat,
      readings,
    };
  }
  
  // Device has active heartbeat (online but no sensor data)
  return {
    status: 'ok',
    message: 'Device online - No sensor data (relay testing mode)',
    color: 'green',
    badge: 'Online',
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
