/**
 * Utility functions for device page
 */

/**
 * Calculate the area of a polygon given GPS coordinates
 * Uses spherical geometry to account for Earth's curvature
 */
export function calculatePolygonArea(coords: {lat: number; lng: number}[]): number {
  if (coords.length < 3) return 0;
  
  const R = 6371000; // Earth radius in meters
  let area = 0;
  
  for (let i = 0; i < coords.length; i++) {
    const j = (i + 1) % coords.length;
    const lat1 = coords[i].lat * Math.PI / 180;
    const lat2 = coords[j].lat * Math.PI / 180;
    const lng1 = coords[i].lng * Math.PI / 180;
    const lng2 = coords[j].lng * Math.PI / 180;
    
    area += (lng2 - lng1) * (2 + Math.sin(lat1) + Math.sin(lat2));
  }
  
  area = Math.abs(area * R * R / 2);
  return area;
}

/**
 * Format a timestamp (in seconds or milliseconds) to a readable string
 */
export function formatTimestamp(ts: number): string {
  if (!ts) return 'Unknown';
  
  // Try to determine if timestamp is in seconds or milliseconds
  const year2000InSeconds = 946684800;
  const year2000InMs = 946684800000;
  
  let date: Date;
  if (ts < year2000InSeconds) {
    // Very small number, might be relative time or invalid
    return `Timestamp: ${ts}`;
  } else if (ts < year2000InMs) {
    // Likely in seconds
    date = new Date(ts * 1000);
  } else {
    // Likely in milliseconds
    date = new Date(ts);
  }
  
  if (isNaN(date.getTime())) {
    return `Timestamp: ${ts}`;
  }
  
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

/**
 * Validate GPS coordinate input
 */
export function validateCoordinates(lat: string, lng: string): {
  valid: boolean;
  error?: string;
} {
  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lng);
  
  if (isNaN(latNum) || isNaN(lngNum)) {
    return { valid: false, error: 'Please enter valid latitude and longitude values' };
  }
  
  if (latNum < -90 || latNum > 90) {
    return { valid: false, error: 'Latitude must be between -90 and 90' };
  }
  
  if (lngNum < -180 || lngNum > 180) {
    return { valid: false, error: 'Longitude must be between -180 and 180' };
  }
  
  return { valid: true };
}

/**
 * Get device status display information based on online status and sensor data
 */
export function getDeviceStatusDisplay(
  deviceOnlineStatus: {online: boolean; lastChecked: number} | null,
  paddyLiveData: { loading: boolean; data: any | null }
) {
  // Use the online status computed by Cloud Function (handles heartbeat conversion)
  const isDeviceOnline = deviceOnlineStatus?.online === true;
  
  const hasNPK = paddyLiveData.data && (
    paddyLiveData.data.nitrogen !== undefined || 
    paddyLiveData.data.phosphorus !== undefined || 
    paddyLiveData.data.potassium !== undefined
  );
  
  if (paddyLiveData.loading) {
    return {
      status: 'loading',
      message: 'Loading latest sensor data...',
      color: 'gray',
      badge: 'Loading',
      lastUpdate: 'Loading...'
    };
  }
  
  // If device is offline according to Cloud Function
  if (!isDeviceOnline && deviceOnlineStatus) {
    const lastChecked = new Date(deviceOnlineStatus.lastChecked).toLocaleString();
    return {
      status: 'offline',
      message: `Device is offline. Last checked: ${lastChecked}. Check power and network connection.`,
      color: 'red',
      badge: 'Offline',
      lastUpdate: lastChecked
    };
  }
  
  // Device is online (according to heartbeat monitor)
  // Check if we have recent sensor data
  const hasRecentData = paddyLiveData.data?.timestamp && 
    (Date.now() - paddyLiveData.data.timestamp.getTime()) < 15 * 60 * 1000;
  
  if (!paddyLiveData.data || !hasRecentData) {
    return {
      status: 'sensor-issue',
      message: 'Device connected but no recent sensor readings. Sensor may need calibration.',
      color: 'yellow',
      badge: 'Sensor Issue',
      lastUpdate: deviceOnlineStatus ? new Date(deviceOnlineStatus.lastChecked).toLocaleTimeString() : 'Recently'
    };
  }
  
  if (!hasNPK) {
    return {
      status: 'sensor-issue',
      message: 'Device connected but sensor readings unavailable. Check sensor connections.',
      color: 'yellow',
      badge: 'Sensor Issue',
      lastUpdate: paddyLiveData.data.timestamp ? paddyLiveData.data.timestamp.toLocaleTimeString() : 'Recently'
    };
  }
  
  return {
    status: 'ok',
    message: 'All systems operational',
    color: 'green',
    badge: 'Connected',
    lastUpdate: paddyLiveData.data.timestamp ? paddyLiveData.data.timestamp.toLocaleTimeString() : 'Just now'
  };
}
