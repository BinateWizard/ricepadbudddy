import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, orderBy, limit, Timestamp } from 'firebase/firestore';
import { database } from '@/lib/firebase';
import { ref, get } from 'firebase/database';
import { getDeviceData as rtdbGetDeviceData } from '@/lib/utils/rtdbHelper';
import { DeviceNPK, DeviceData } from './deviceStatus';

export interface NPKStatistics {
  nitrogen: {
    current: number | null;
    average: number | null;
    min: number | null;
    max: number | null;
    trend: 'up' | 'down' | 'stable';
  };
  phosphorus: {
    current: number | null;
    average: number | null;
    min: number | null;
    max: number | null;
    trend: 'up' | 'down' | 'stable';
  };
  potassium: {
    current: number | null;
    average: number | null;
    min: number | null;
    max: number | null;
    trend: 'up' | 'down' | 'stable';
  };
}

export interface HistoricalDataPoint {
  timestamp: Date;
  nitrogen?: number;
  phosphorus?: number;
  potassium?: number;
}

/**
 * Get NPK statistics for a device from historical logs
 */
export async function getDeviceNPKStatistics(
  userId: string,
  fieldId: string,
  paddyId: string,
  deviceId: string,
  days: number = 30
): Promise<NPKStatistics> {
  try {
    // Get current NPK from RTDB
    const deviceData = await getDeviceData(deviceId);
    const currentNPK = deviceData?.npk;

    // Get historical data from Firestore
    const logsRef = collection(db, `users/${userId}/fields/${fieldId}/paddies/${paddyId}/logs`);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    const q = query(
      logsRef,
      where('timestamp', '>=', cutoffDate),
      orderBy('timestamp', 'desc')
    );
    
    const snapshot = await getDocs(q);
    const logs = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        timestamp: data.timestamp?.toDate() || new Date(data.createdAt),
        nitrogen: data.nitrogen,
        phosphorus: data.phosphorus,
        potassium: data.potassium,
      };
    });

    // Calculate statistics
    const nitrogenValues = logs.filter(l => l.nitrogen !== undefined).map(l => l.nitrogen!);
    const phosphorusValues = logs.filter(l => l.phosphorus !== undefined).map(l => l.phosphorus!);
    const potassiumValues = logs.filter(l => l.potassium !== undefined).map(l => l.potassium!);

    const calculateStats = (values: number[], current: number | undefined) => {
      if (values.length === 0) {
        return {
          current: current || null,
          average: null,
          min: null,
          max: null,
          trend: 'stable' as const,
        };
      }

      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      const min = Math.min(...values);
      const max = Math.max(...values);

      // Determine trend (compare recent vs older values)
      let trend: 'up' | 'down' | 'stable' = 'stable';
      if (values.length >= 2) {
        const recent = values.slice(0, Math.floor(values.length / 2));
        const older = values.slice(Math.floor(values.length / 2));
        const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
        const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
        
        if (recentAvg > olderAvg * 1.1) trend = 'up';
        else if (recentAvg < olderAvg * 0.9) trend = 'down';
      }

      return {
        current: current || values[0] || null,
        average: avg,
        min,
        max,
        trend,
      };
    };

    return {
      nitrogen: calculateStats(nitrogenValues, currentNPK?.n),
      phosphorus: calculateStats(phosphorusValues, currentNPK?.p),
      potassium: calculateStats(potassiumValues, currentNPK?.k),
    };
  } catch (error) {
    console.error('Error calculating NPK statistics:', error);
    return {
      nitrogen: { current: null, average: null, min: null, max: null, trend: 'stable' },
      phosphorus: { current: null, average: null, min: null, max: null, trend: 'stable' },
      potassium: { current: null, average: null, min: null, max: null, trend: 'stable' },
    };
  }
}

/**
 * Get historical NPK data for a device/paddy
 */
export async function getHistoricalNPKData(
  userId: string,
  fieldId: string,
  paddyId: string,
  days: number = 30
): Promise<HistoricalDataPoint[]> {
  try {
    const logsRef = collection(db, `users/${userId}/fields/${fieldId}/paddies/${paddyId}/logs`);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    const q = query(
      logsRef,
      where('timestamp', '>=', cutoffDate),
      orderBy('timestamp', 'asc')
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        timestamp: data.timestamp?.toDate() || new Date(data.createdAt),
        nitrogen: data.nitrogen,
        phosphorus: data.phosphorus,
        potassium: data.potassium,
      };
    });
  } catch (error) {
    console.error('Error fetching historical NPK data:', error);
    return [];
  }
}

/**
 * Get field-level statistics (aggregate across all paddies)
 */
export async function getFieldNPKStatistics(
  userId: string,
  fieldId: string,
  deviceIds: string[],
  days: number = 30
): Promise<NPKStatistics> {
  try {
    // Get current NPK from all devices
    const deviceDataPromises = deviceIds.map(id => getDeviceData(id));
    const devicesData = await Promise.all(deviceDataPromises);
    
    const currentNPKValues = devicesData
      .filter(d => d?.npk)
      .map(d => d!.npk!);

    const currentN = currentNPKValues.length > 0 
      ? currentNPKValues.reduce((sum, npk) => sum + (npk.n || 0), 0) / currentNPKValues.length 
      : undefined;
    const currentP = currentNPKValues.length > 0
      ? currentNPKValues.reduce((sum, npk) => sum + (npk.p || 0), 0) / currentNPKValues.length
      : undefined;
    const currentK = currentNPKValues.length > 0
      ? currentNPKValues.reduce((sum, npk) => sum + (npk.k || 0), 0) / currentNPKValues.length
      : undefined;

    // Get all historical data from all paddies in the field
    // Note: This requires knowing which paddies belong to which devices
    // For now, we'll aggregate from all paddies in the field
    
    // This is a simplified version - you may need to adjust based on your data structure
    const allNitrogen: number[] = [];
    const allPhosphorus: number[] = [];
    const allPotassium: number[] = [];

    // Calculate aggregate statistics
    const calculateStats = (values: number[], current: number | undefined) => {
      if (values.length === 0 && !current) {
        return {
          current: null,
          average: null,
          min: null,
          max: null,
          trend: 'stable' as const,
        };
      }

      const allValues = current !== undefined ? [...values, current] : values;
      if (allValues.length === 0) {
        return {
          current: null,
          average: null,
          min: null,
          max: null,
          trend: 'stable' as const,
        };
      }

      const avg = allValues.reduce((a, b) => a + b, 0) / allValues.length;
      const min = Math.min(...allValues);
      const max = Math.max(...allValues);

      let trend: 'up' | 'down' | 'stable' = 'stable';
      if (values.length >= 2) {
        const recent = values.slice(0, Math.floor(values.length / 2));
        const older = values.slice(Math.floor(values.length / 2));
        const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
        const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
        
        if (recentAvg > olderAvg * 1.1) trend = 'up';
        else if (recentAvg < olderAvg * 0.9) trend = 'down';
      }

      return {
        current: current || null,
        average: avg,
        min,
        max,
        trend,
      };
    };

    return {
      nitrogen: calculateStats(allNitrogen, currentN),
      phosphorus: calculateStats(allPhosphorus, currentP),
      potassium: calculateStats(allPotassium, currentK),
    };
  } catch (error) {
    console.error('Error calculating field NPK statistics:', error);
    return {
      nitrogen: { current: null, average: null, min: null, max: null, trend: 'stable' },
      phosphorus: { current: null, average: null, min: null, max: null, trend: 'stable' },
      potassium: { current: null, average: null, min: null, max: null, trend: 'stable' },
    };
  }
}

// Helper function to get device data (uses fallback helper)
async function getDeviceData(deviceId: string): Promise<DeviceData | null> {
  try {
    const data = await rtdbGetDeviceData(deviceId, '');
    return data as DeviceData | null;
  } catch (error) {
    console.error(`Error fetching device data for ${deviceId}:`, error);
    return null;
  }
}
