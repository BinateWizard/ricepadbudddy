'use client';

import { useState, useEffect } from 'react';
import { getDeviceData } from '@/lib/utils/rtdbHelper';

// --- DEV/TEST: Load local NPK logs from a pasted object (for UI testing) ---
// Replace this with your actual device data source as needed
const LOCAL_NPK_READINGS = typeof window !== 'undefined' && (window as any).LOCAL_NPK_READINGS;

function npkObjectToLogs(npkObj: any) {
  if (!npkObj || typeof npkObj !== 'object') return [];
  return Object.values(npkObj)
    .map((entry: any, idx) => ({
      id: `local-${entry.timestamp || idx}`,
      timestamp: new Date((entry.timestamp < 10000000000 ? entry.timestamp * 1000 : entry.timestamp)),
      nitrogen: entry.N ?? entry.nitrogen ?? null,
      phosphorus: entry.P ?? entry.phosphorus ?? null,
      potassium: entry.K ?? entry.potassium ?? null,
      areaHa: entry.areaHa,
      unit: entry.unit,
      _src: 'local',
    }))
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}
import { useAuth } from '@/context/AuthContext';
import { db, database } from '@/lib/firebase';
import { collection, query, where, onSnapshot, getDocs, doc, getDoc } from 'firebase/firestore';
import { ref, onValue } from 'firebase/database';
import { onDeviceValue } from '@/lib/utils/rtdbHelper';
import { TrendsChart } from './TrendsChart';
import { getVarietyByName } from '@/lib/utils/varietyHelpers';

// Helper function to check device status
function getDeviceStatus(paddy: any, deviceReadings: any[]) {
  const deviceReading = deviceReadings.find(r => r.deviceId === paddy.deviceId);

  if (!deviceReading) {
    return {
      status: 'offline',
      message: 'Device is offline. Check power supply and network connection.',
      color: 'red',
      badge: 'Offline'
    };
  }

  const deviceStatus = deviceReading.status || 'disconnected';

  // Prefer npk.timestamp as the source of truth for sensor freshness. Heartbeat alone (no timestamp)
  // should not mark the device as producing fresh sensor data.
  const OFFLINE_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes
  let hasRecentNPK = false;
  let npkTimestampMs: number | null = null;
  if (deviceReading.npk?.timestamp !== undefined && deviceReading.npk?.timestamp !== null) {
    const raw = Number(deviceReading.npk.timestamp);
    const ms = raw < 10000000000 ? raw * 1000 : raw;
    npkTimestampMs = ms;
    hasRecentNPK = (Date.now() - ms) < OFFLINE_THRESHOLD_MS;
  }

  // If we have a recent npk timestamp, device is OK and sensors present
  if (hasRecentNPK) {
    const hasNPKValues = deviceReading.npk && (
      deviceReading.npk.n !== undefined ||
      deviceReading.npk.p !== undefined ||
      deviceReading.npk.k !== undefined
    );
    if (!hasNPKValues) {
      return { status: 'sensor-issue', message: 'Device online but no NPK values', color: 'yellow', badge: 'Sensor Issue' };
    }
    return { status: 'ok', message: 'Device and sensors are working properly.', color: 'green', badge: 'Connected' };
  }

  // No recent npk timestamp: if device reports 'connected' or 'alive' treat as sensor-issue (heartbeat present but no readings)
  if (deviceStatus === 'connected' || deviceStatus === 'alive') {
    return { status: 'sensor-issue', message: 'Device connected but no recent NPK readings', color: 'yellow', badge: 'Sensor Issue' };
  }

  // Otherwise treat as offline
  return { status: 'offline', message: 'Device is offline. Check power supply and network connection.', color: 'red', badge: 'Offline' };
}

// Statistics Tab Component
export function StatisticsTab({ paddies, deviceReadings, fieldId, setDeviceReadings }: { paddies: any[]; deviceReadings: any[]; fieldId: string; setDeviceReadings: React.Dispatch<React.SetStateAction<any[]>> }) {
  const { user } = useAuth();
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | 'all'>('7d');
  const [historicalLogs, setHistoricalLogs] = useState<any[]>([]);
    // Fetch RTDB logs from device/DEVICE_0005/npk_readings and use as historical logs
    useEffect(() => {
      async function fetchRTDBLogs() {
        // Hardcoded deviceId for now; replace with dynamic if needed
        const deviceId = 'DEVICE_0005';
        const npkReadings = await getDeviceData(deviceId, 'npk_readings');
        if (npkReadings && typeof npkReadings === 'object') {
          // Convert to array, latest at the bottom
          const logs = Object.values(npkReadings)
            .map((entry: any, idx) => ({
              id: `rtdb-${entry.timestamp || idx}`,
              timestamp: new Date((entry.timestamp < 10000000000 ? entry.timestamp * 1000 : entry.timestamp)),
              nitrogen: entry.N ?? entry.nitrogen ?? null,
              phosphorus: entry.P ?? entry.phosphorus ?? null,
              potassium: entry.K ?? entry.potassium ?? null,
              areaHa: entry.areaHa,
              unit: entry.unit,
              _src: 'rtdb',
            }))
            .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
          setHistoricalLogs(logs);
        }
      }
      fetchRTDBLogs();
    }, []);
  const [realtimeLogs, setRealtimeLogs] = useState<any[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(true); // Start with true to show loading
  const [isLogging, setIsLogging] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [fieldStats, setFieldStats] = useState<{
    nitrogen: { current: number | null; average: number | null; min: number | null; max: number | null };
    phosphorus: { current: number | null; average: number | null; min: number | null; max: number | null };
    potassium: { current: number | null; average: number | null; min: number | null; max: number | null };
    temperature: { current: number | null; average: number | null; min: number | null; max: number | null };
    humidity: { current: number | null; average: number | null; min: number | null; max: number | null };
  } | null>(null);
  const [hasInitialized, setHasInitialized] = useState(false);
  const [useStaticMode, setUseStaticMode] = useState(true);
  
  // Calculate field-level statistics from current device readings AND historical logs
  useEffect(() => {
    console.log('[Statistics] Device readings:', deviceReadings);
    console.log('[Statistics] Historical logs:', historicalLogs.length);
    
    // Filter out devices with sensor issues (no readings or all null values)
    const validDeviceReadings = deviceReadings.filter(r => {
      if (!r || !r.npk) return false;
      
      // Check if at least one NPK value is valid
      const hasValidNPK = (r.npk.n !== undefined && r.npk.n !== null) || 
                          (r.npk.p !== undefined && r.npk.p !== null) || 
                          (r.npk.k !== undefined && r.npk.k !== null);
      
      return hasValidNPK;
    });

    console.log('[Statistics] Valid device readings (excluding sensor issues):', validDeviceReadings.length, '/', deviceReadings.length);
    
    // Get current NPK values from RTDB (only from working sensors)
    const npkValues = validDeviceReadings
      .filter(r => r && r.npk)
      .map(r => r.npk);

    console.log('[Statistics] NPK values from devices:', npkValues);

    // Extract temperature and humidity from device readings (can include devices with NPK sensor issues)
    // Check both sensors.temperature/humidity and direct properties
    const allTemperatureFromDevices = deviceReadings
      .map(r => {
        if (!r) return null;
        // Check sensors object first, then direct properties
        return r.sensors?.temperature ?? r.temperature ?? null;
      })
      .filter(t => t !== null && t !== undefined) as number[];
    
    const allHumidityFromDevices = deviceReadings
      .map(r => {
        if (!r) return null;
        // Check sensors object first, then direct properties
        return r.sensors?.humidity ?? r.humidity ?? null;
      })
      .filter(h => h !== null && h !== undefined) as number[];

    // Get historical values from logs
    const historicalNitrogen = historicalLogs
      .filter(log => log && log.nitrogen !== undefined && log.nitrogen !== null)
      .map(log => log.nitrogen as number);
    
    const historicalPhosphorus = historicalLogs
      .filter(log => log && log.phosphorus !== undefined && log.phosphorus !== null)
      .map(log => log.phosphorus as number);
    
    const historicalPotassium = historicalLogs
      .filter(log => log && log.potassium !== undefined && log.potassium !== null)
      .map(log => log.potassium as number);

    // Current values from RTDB - get all values and use the first one as "current"
    const allNitrogenFromDevices = npkValues.map(n => n?.n).filter(n => n !== undefined && n !== null) as number[];
    const allPhosphorusFromDevices = npkValues.map(n => n?.p).filter(n => n !== undefined && n !== null) as number[];
    const allPotassiumFromDevices = npkValues.map(n => n?.k).filter(n => n !== undefined && n !== null) as number[];
    
    const currentNitrogen = allNitrogenFromDevices.length > 0 ? allNitrogenFromDevices[0] : undefined;
    const currentPhosphorus = allPhosphorusFromDevices.length > 0 ? allPhosphorusFromDevices[0] : undefined;
    const currentPotassium = allPotassiumFromDevices.length > 0 ? allPotassiumFromDevices[0] : undefined;
    const currentTemperature = allTemperatureFromDevices.length > 0 ? allTemperatureFromDevices[0] : undefined;
    const currentHumidity = allHumidityFromDevices.length > 0 ? allHumidityFromDevices[0] : undefined;

    // Combine current and historical for comprehensive stats
    // Include all device values, not just the first one
    const allNitrogen = [...allNitrogenFromDevices, ...historicalNitrogen];
    const allPhosphorus = [...allPhosphorusFromDevices, ...historicalPhosphorus];
    const allPotassium = [...allPotassiumFromDevices, ...historicalPotassium];
    // Temperature and humidity only from current devices (no historical logs yet)
    const allTemperature = [...allTemperatureFromDevices];
    const allHumidity = [...allHumidityFromDevices];

    console.log('[Statistics] Combined data - N:', allNitrogen, 'P:', allPhosphorus, 'K:', allPotassium);
    console.log('[Statistics] Temperature:', allTemperature, 'Humidity:', allHumidity);

    const calculateStats = (current: number | undefined, allValues: number[]) => {
      if (allValues.length === 0 && current === undefined) {
        return { current: null, average: null, min: null, max: null };
      }
      
      if (allValues.length === 0) {
        return {
          current: current || null,
          average: current || null,
          min: current || null,
          max: current || null,
        };
      }

      return {
        current: current !== undefined ? current : (allValues.length > 0 ? allValues[allValues.length - 1] : null),
        average: allValues.reduce((a, b) => a + b, 0) / allValues.length,
        min: Math.min(...allValues),
        max: Math.max(...allValues),
      };
    };

    const stats = {
      nitrogen: calculateStats(currentNitrogen, allNitrogen),
      phosphorus: calculateStats(currentPhosphorus, allPhosphorus),
      potassium: calculateStats(currentPotassium, allPotassium),
      temperature: calculateStats(currentTemperature, allTemperature),
      humidity: calculateStats(currentHumidity, allHumidity),
    };

    console.log('[Statistics] Calculated stats:', stats);
    setFieldStats(stats);
  }, [deviceReadings, historicalLogs]);

  // Manual log function - Cloud Functions automatically log sensor data
  // This triggers ESP32 to write data to RTDB, which Cloud Functions then log to Firestore
  const handleManualLog = async () => {
    if (!user) return;
    
    setIsLogging(true);
    try {
      const { sendDeviceCommand } = await import('@/lib/utils/deviceCommands');
      let loggedCount = 0;
      
      for (const reading of deviceReadings) {
        if (reading.npk && (reading.npk.n !== undefined || reading.npk.p !== undefined || reading.npk.k !== undefined)) {
          const paddy = paddies.find(p => p.deviceId === reading.deviceId);
          if (paddy) {
            console.log(`[Manual Log] Triggering scan for ${reading.deviceId}`);
            // Send scan command to ESP32C (NPK sensor)
            await sendDeviceCommand(reading.deviceId, 'ESP32C', 'npk', 'scan', {}, '');
            loggedCount++;
          }
        }
      }
      
      if (loggedCount > 0) {
        alert(`Successfully triggered ${loggedCount} device scan(s)! Readings will be logged automatically.`);
        // Refresh historical logs by re-triggering the fetch
        const currentRange = timeRange;
        setTimeRange('7d');
        setTimeout(() => setTimeRange(currentRange), 100);
      } else {
        alert('No NPK data available to log. Make sure devices are connected and sending data.');
      }
    } catch (error) {
      console.error('Error manually logging:', error);
      alert('Failed to log readings. Please try again.');
    } finally {
      setIsLogging(false);
    }
  };
  
  // Reset to page 1 when time range changes
  useEffect(() => {
    setCurrentPage(1);
  }, [timeRange]);

  // Real-time RTDB listeners for all devices
  useEffect(() => {
    if (!paddies.length) return;

    const unsubscribers: (() => void)[] = [];

    paddies.forEach((paddy) => {
      if (!paddy.deviceId) return;

      const unsubscribe = onDeviceValue(paddy.deviceId, 'npk', (data) => {
        if (!data) return;
        // Normalize timestamp: handle seconds or milliseconds
        let timestamp = new Date();
        if (data.timestamp !== undefined && data.timestamp !== null) {
          const raw = Number(data.timestamp);
          const ms = raw < 10000000000 ? raw * 1000 : raw; // seconds -> ms
          timestamp = new Date(ms);
        }

        if (data.n !== undefined || data.p !== undefined || data.k !== undefined) {
          const newLog = {
            id: `rtdb-${paddy.deviceId}-${Date.now()}`,
            timestamp,
            nitrogen: data.n,
            phosphorus: data.p,
            potassium: data.k,
            paddyId: paddy.id,
            paddyName: paddy.paddyName,
            deviceId: paddy.deviceId,
            _src: 'rtdb'
          };
          
          setRealtimeLogs(prev => {
            // Remove old logs from same device and add new one
            const filtered = prev.filter(log => log.deviceId !== paddy.deviceId || log._src !== 'rtdb');
            return [...filtered, newLog].slice(-20); // Keep last 20 real-time entries
          });
            // Update deviceReadings so frontend uses npk.timestamp as last-seen and shows correct status
            setDeviceReadings((prev: any[]) => {
              const found = prev.find(r => r.deviceId === paddy.deviceId);
              if (found) {
                return prev.map(r => r.deviceId === paddy.deviceId ? { ...r, npk: { ...r.npk, ...data }, timestamp } : r);
              }
              // not found -> add
              return [...prev, { deviceId: paddy.deviceId, paddyId: paddy.id, npk: data, timestamp }];
            });
        }
      });

      unsubscribers.push(unsubscribe);

      // Real-time listener for temperature and humidity sensors
      const unsubscribeSensors = onDeviceValue(paddy.deviceId, 'sensors', (sensors) => {
        if (sensors) {
          // If temperature or humidity is updated, update deviceReadings directly
          if (sensors.temperature !== undefined || sensors.humidity !== undefined) {
            console.log(`[Sensors] Temperature/Humidity updated for ${paddy.deviceId}:`, sensors);
            // Update deviceReadings state directly to reflect sensor changes
            setDeviceReadings((prev: any[]) => {
              const updated = prev.map((reading: any) => {
                if (reading.deviceId === paddy.deviceId) {
                  return {
                    ...reading,
                    sensors: {
                      ...reading.sensors,
                      temperature: sensors.temperature ?? reading.sensors?.temperature,
                      humidity: sensors.humidity ?? reading.sensors?.humidity,
                    },
                    temperature: sensors.temperature ?? reading.temperature,
                    humidity: sensors.humidity ?? reading.humidity,
                  };
                }
                return reading;
              });
              // If device not in readings yet, add it
              if (!updated.find((r: any) => r.deviceId === paddy.deviceId)) {
                updated.push({
                  deviceId: paddy.deviceId,
                  paddyId: paddy.id,
                  sensors: {
                    temperature: sensors.temperature,
                    humidity: sensors.humidity,
                  },
                  temperature: sensors.temperature,
                  humidity: sensors.humidity,
                });
              }
              return updated;
            });
          }
        }
      });
      unsubscribers.push(unsubscribeSensors);
    });

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [paddies, setDeviceReadings]);

  // Initial data fetch when component mounts or paddies become available
  useEffect(() => {
    if (!user || paddies.length === 0) {
      setIsLoadingLogs(false);
      return;
    }
    
    // Mark as initialized once we have the required data
    if (!hasInitialized && paddies.length > 0) {
      setHasInitialized(true);
    }
  }, [user, paddies, hasInitialized]);

  // Firestore listeners / static fetch for historical logs
  useEffect(() => {
    if (!user || paddies.length === 0) {
      setIsLoadingLogs(false);
      return;
    }

    setIsLoadingLogs(true);

    const now = new Date();
    let startDate = new Date();
    switch (timeRange) {
      case '7d': startDate.setDate(now.getDate() - 7); break;
      case '30d': startDate.setDate(now.getDate() - 30); break;
      case '90d': startDate.setDate(now.getDate() - 90); break;
      case 'all': startDate = new Date(0); break;
    }

    let latestLogs: any[] = [];
    let initializedCount = 0;
    const totalPaddies = paddies.length;

    const mergeAndSet = (isInitial = false) => {
      if (isInitial) {
        initializedCount++;
      }
      const sorted = latestLogs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      setHistoricalLogs(sorted);
      if (initializedCount >= totalPaddies || !isInitial) {
        setIsLoadingLogs(false);
      }
    };

    // Static mode: fetch once using getDocs for each paddy
    if (useStaticMode) {
      (async () => {
        try {
          for (const paddy of paddies) {
            const logsRef = collection(db, `users/${user.uid}/fields/${fieldId}/paddies/${paddy.id}/logs`);
            const q = timeRange === 'all' ? logsRef : query(logsRef, where('timestamp', '>=', startDate));
            try {
              const snap = await getDocs(q);
              const arr: any[] = [];
              snap.forEach((doc) => {
                const data: any = doc.data();
                let logDate: Date;
                if (data.timestamp && typeof data.timestamp.toDate === 'function') {
                  logDate = data.timestamp.toDate();
                } else if (typeof data.timestamp === 'number') {
                  const raw = data.timestamp;
                  const ms = raw < 10000000000 ? raw * 1000 : raw;
                  logDate = new Date(ms);
                } else if (typeof data.timestamp === 'string' && !Number.isNaN(Number(data.timestamp))) {
                  const raw = Number(data.timestamp);
                  const ms = raw < 10000000000 ? raw * 1000 : raw;
                  logDate = new Date(ms);
                } else {
                  logDate = new Date();
                }
                if (logDate >= startDate) {
                  arr.push({
                    ...data,
                    id: doc.id,
                    paddyId: paddy.id,
                    paddyName: paddy.paddyName,
                    timestamp: logDate,
                    _src: 'paddy'
                  });
                }
              });

              // Merge this paddy's logs
              latestLogs = latestLogs.filter(log => log.paddyId !== paddy.id || log._src !== 'paddy');
              latestLogs = [...latestLogs, ...arr];
            } catch (err) {
              console.error(`Error fetching logs for ${paddy.id}:`, err);
            } finally {
              initializedCount++;
            }
          }

          mergeAndSet(false);
        } catch (err) {
          console.error('Error in static logs fetch:', err);
          setIsLoadingLogs(false);
        }
      })();

      // No real-time unsubscribers in static mode
      return;
    }

    // Live mode: use onSnapshot listeners
    const unsubscribers: (() => void)[] = [];

    paddies.forEach((paddy) => {
      const logsRef = collection(db, `users/${user.uid}/fields/${fieldId}/paddies/${paddy.id}/logs`);
      const q = timeRange === 'all' ? logsRef : query(logsRef, where('timestamp', '>=', startDate));

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const arr: any[] = [];
        snapshot.forEach((doc) => {
          const data: any = doc.data();
          let logDate: Date;
          if (data.timestamp && typeof data.timestamp.toDate === 'function') {
            logDate = data.timestamp.toDate();
          } else if (typeof data.timestamp === 'number') {
            const raw = data.timestamp;
            const ms = raw < 10000000000 ? raw * 1000 : raw;
            logDate = new Date(ms);
          } else if (typeof data.timestamp === 'string' && !Number.isNaN(Number(data.timestamp))) {
            const raw = Number(data.timestamp);
            const ms = raw < 10000000000 ? raw * 1000 : raw;
            logDate = new Date(ms);
          } else {
            logDate = new Date();
          }
          if (logDate >= startDate) {
            arr.push({ 
              ...data, 
              id: doc.id, 
              paddyId: paddy.id, 
              paddyName: paddy.paddyName,
              timestamp: logDate,
              _src: 'paddy'
            });
          }
        });

        latestLogs = latestLogs.filter(log => log.paddyId !== paddy.id || log._src !== 'paddy');
        latestLogs = [...latestLogs, ...arr];

        const isInitial = initializedCount < totalPaddies;
        mergeAndSet(isInitial);
      }, (err) => {
        console.error(`Paddy logs listener error for ${paddy.id}:`, err);
        initializedCount++;
        if (initializedCount >= totalPaddies) {
          setIsLoadingLogs(false);
        }
      });

      unsubscribers.push(unsubscribe);
    });

    return () => {
      unsubscribers.forEach(unsub => {
        try { unsub(); } catch {}
      });
    };
  }, [user, fieldId, paddies, timeRange, useStaticMode]);
  
  // Simple field-level NPK goal based on summed paddy areas (if available)
  const [fieldNPKGoal, setFieldNPKGoal] = useState<{
    n: string; p: string; k: string;
    nValue: number; pValue: number; kValue: number; // Store numeric values
  } | null>(null);

  useEffect(() => {
    console.log('[NPK Goal] Calculating field NPK goals...');
    console.log('[NPK Goal] Paddies:', paddies.length);
    
    const fetchFieldVarietyAndCalculate = async () => {
      if (!user || !fieldId || !paddies.length) {
        console.log('[NPK Goal] Missing user, fieldId, or paddies');
        setFieldNPKGoal(null);
        return;
      }

      try {
        // Fetch field document to get rice variety
        const fieldRef = doc(db, 'users', user.uid, 'fields', fieldId);
        const fieldSnap = await getDoc(fieldRef);
        
        if (!fieldSnap.exists()) {
          console.log('[NPK Goal] Field document not found');
          setFieldNPKGoal(null);
          return;
        }

        const fieldData = fieldSnap.data();
        const varietyName = fieldData.riceVariety || fieldData.varietyName;
        
        if (!varietyName) {
          console.log('[NPK Goal] No variety name in field');
          setFieldNPKGoal(null);
          return;
        }

        const variety = getVarietyByName(varietyName);
        if (!variety) {
          console.log('[NPK Goal] Variety not found:', varietyName);
          setFieldNPKGoal(null);
          return;
        }

        console.log('[NPK Goal] Found variety:', variety.name);

        // Filter out paddies with sensor issues
        const paddiesWithWorkingSensors = paddies.filter(paddy => {
          if (!paddy.deviceId) return false;
          
          const reading = deviceReadings.find(r => r.deviceId === paddy.deviceId);
          
          // Exclude if no reading at all
          if (!reading || !reading.npk) return false;
          
          // Exclude if all NPK values are null/undefined (sensor malfunction)
          const npk = reading.npk;
          const hasValidData = (npk.n !== undefined && npk.n !== null) || 
                              (npk.p !== undefined && npk.p !== null) || 
                              (npk.k !== undefined && npk.k !== null);
          
          return hasValidData;
        });

        console.log('[NPK Goal] Paddies with working sensors:', paddiesWithWorkingSensors.length, '/', paddies.length);

        // Calculate total area from paddies with working sensors only
        const totalAreaHa = paddiesWithWorkingSensors
          .map(p => {
            // Check multiple possible area sources
            if (typeof p.boundary?.area === 'number') {
              return p.boundary.area / 10000; // Convert m² to hectares
            } else if (typeof p.areaHectares === 'number') {
              return p.areaHectares;
            } else if (typeof p.areaM2 === 'number') {
              return p.areaM2 / 10000;
            }
            return 0;
          })
          .reduce((sum, area) => sum + area, 0);

        console.log('[NPK Goal] Total area (ha):', totalAreaHa);

        if (totalAreaHa <= 0) {
          console.log('[NPK Goal] No area data available');
          setFieldNPKGoal(null);
          return;
        }

        const { N, P2O5, K2O } = variety.npkPerHa;
        const area = totalAreaHa;

        const nMid = ((N.min + N.max) / 2) * area;
        const pMid = ((P2O5.min + P2O5.max) / 2) * area;
        const kMid = ((K2O.min + K2O.max) / 2) * area;

        console.log('[NPK Goal] Calculated:', { nMid, pMid, kMid });

        setFieldNPKGoal({
          n: `${nMid.toFixed(1)} kg N`,
          p: `${pMid.toFixed(1)} kg P₂O₅`,
          k: `${kMid.toFixed(1)} kg K₂O`,
          nValue: nMid,
          pValue: pMid,
          kValue: kMid,
        });
      } catch (error) {
        console.error('[NPK Goal] Error:', error);
        setFieldNPKGoal(null);
      }
    };

    fetchFieldVarietyAndCalculate();
  }, [paddies, user?.uid, fieldId]);

  return (
    <div className="space-y-4 -mx-1 sm:mx-0">
      {/* Average Statistics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Nitrogen Card */}
        <div className="bg-blue-50 rounded-xl p-4 shadow-md">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-blue-900 text-sm">Nitrogen (N)</h4>
            <span className="text-2xl">🧪</span>
          </div>
          <div className="space-y-2">
            <div className="text-center">
              <span className="font-bold text-blue-900 text-2xl">
                {fieldStats && fieldStats.nitrogen.average !== null && fieldStats.nitrogen.average !== undefined
                  ? Math.round(fieldStats.nitrogen.average)
                  : '0'}
              </span>
              <span className="text-blue-700 text-xl font-medium"> / </span>
              <span className="font-bold text-blue-900 text-2xl">
                {fieldNPKGoal ? fieldNPKGoal.nValue.toFixed(1) : '0'}
              </span>
            </div>
            <div className="text-center text-xs text-blue-700">mg/kg / kg N</div>
            <div className="text-[10px] text-blue-600 mt-2 text-center">
              {deviceReadings.filter(r => r.npk?.n !== undefined).length}/{paddies.length} readings
            </div>
          </div>
        </div>

        {/* Phosphorus Card */}
        <div className="bg-purple-50 rounded-xl p-4 shadow-md">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-purple-900 text-sm">Phosphorus (P)</h4>
            <span className="text-2xl">⚗️</span>
          </div>
          <div className="space-y-2">
            <div className="text-center">
              <span className="font-bold text-purple-900 text-2xl">
                {fieldStats && fieldStats.phosphorus.average !== null && fieldStats.phosphorus.average !== undefined
                  ? Math.round(fieldStats.phosphorus.average)
                  : '0'}
              </span>
              <span className="text-purple-700 text-xl font-medium"> / </span>
              <span className="font-bold text-purple-900 text-2xl">
                {fieldNPKGoal ? fieldNPKGoal.pValue.toFixed(1) : '0'}
              </span>
            </div>
            <div className="text-center text-xs text-purple-700">mg/kg / kg P₂O₅</div>
            <div className="text-[10px] text-purple-600 mt-2 text-center">
              {deviceReadings.filter(r => r.npk?.p !== undefined).length}/{paddies.length} readings
            </div>
          </div>
        </div>

        {/* Potassium Card */}
        <div className="bg-orange-50 rounded-xl p-4 shadow-md">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-orange-900 text-sm">Potassium (K)</h4>
            <span className="text-2xl">🔬</span>
          </div>
          <div className="space-y-2">
            <div className="text-center">
              <span className="font-bold text-orange-900 text-2xl">
                {fieldStats && fieldStats.potassium.average !== null && fieldStats.potassium.average !== undefined
                  ? Math.round(fieldStats.potassium.average)
                  : '0'}
              </span>
              <span className="text-orange-700 text-xl font-medium"> / </span>
              <span className="font-bold text-orange-900 text-2xl">
                {fieldNPKGoal ? fieldNPKGoal.kValue.toFixed(1) : '0'}
              </span>
            </div>
            <div className="text-center text-xs text-orange-700">mg/kg / kg K₂O</div>
            <div className="text-[10px] text-orange-600 mt-2 text-center">
              {deviceReadings.filter(r => r.npk?.k !== undefined).length}/{paddies.length} readings
            </div>
          </div>
        </div>

        {/* Temperature Card */}
        <div className={`rounded-lg shadow-md p-3 sm:p-4 ${fieldStats && fieldStats.temperature.average !== null ? 'bg-white' : 'bg-gray-50 opacity-60'}`}>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-gray-600">Temperature</h3>
            <span className="text-xl">🌡️</span>
          </div>
          <p className="text-xs text-gray-500 font-semibold mb-1">Field Avg</p>
          <p className={`text-xl font-bold ${fieldStats && fieldStats.temperature.average !== null ? 'text-orange-600' : 'text-gray-600'}`}>
            {fieldStats && fieldStats.temperature.average !== null && fieldStats.temperature.average !== undefined
              ? `${Math.round(fieldStats.temperature.average)}°C`
              : '--'}
          </p>
          {fieldStats && fieldStats.temperature.current !== null && fieldStats.temperature.current !== undefined && (
            <p className="text-xs text-gray-400 mt-1">Latest: {Math.round(fieldStats.temperature.current)}°C</p>
          )}
        </div>

        {/* Humidity Card */}
        <div className={`rounded-lg shadow-md p-3 sm:p-4 ${fieldStats && fieldStats.humidity.average !== null ? 'bg-white' : 'bg-gray-50 opacity-60'}`}>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-gray-600">Humidity</h3>
            <span className="text-xl">💧</span>
          </div>
          <p className="text-xs text-gray-500 font-semibold mb-1">Field Avg</p>
          <p className={`text-xl font-bold ${fieldStats && fieldStats.humidity.average !== null ? 'text-blue-600' : 'text-gray-600'}`}>
            {fieldStats && fieldStats.humidity.average !== null && fieldStats.humidity.average !== undefined
              ? `${Math.round(fieldStats.humidity.average)}%`
              : '--'}
          </p>
          {fieldStats && fieldStats.humidity.current !== null && fieldStats.humidity.current !== undefined && (
            <p className="text-xs text-gray-400 mt-1">Latest: {Math.round(fieldStats.humidity.current)}%</p>
          )}
        </div>

        {/* Water Level Card - Coming Soon */}
        <div className="bg-gray-50 rounded-lg shadow-md p-3 sm:p-4 opacity-60">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-gray-600">Water Level</h3>
            <span className="text-xl">🌊</span>
          </div>
          <p className="text-xl font-bold text-gray-600">--</p>
          <p className="text-xs text-gray-400 mt-1">Coming soon</p>
        </div>
      </div>

      {/* Data Trends */}
      <div className="bg-white rounded-xl shadow-md p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Data Trends</h2>
            <p className="text-xs text-gray-500 mt-1">Historical NPK readings stored in Firestore</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleManualLog}
              disabled={isLogging || deviceReadings.length === 0}
              className="px-3 py-1.5 text-xs sm:text-sm rounded-lg transition-colors bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              title="Manually log current NPK readings to history"
            >
              {isLogging ? (
                <>
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span className="hidden sm:inline">Logging...</span>
                </>
              ) : (
                <>
                  <span>📝</span>
                  <span className="hidden sm:inline">Log Now</span>
                  <span className="sm:hidden">Log</span>
                </>
              )}
            </button>
            <button
              onClick={() => setTimeRange('7d')}
              className={`px-3 py-1.5 text-xs sm:text-sm rounded-lg transition-colors ${
                timeRange === '7d' 
                  ? 'bg-green-600 text-white' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              7 Days
            </button>
            <button
              onClick={() => setTimeRange('30d')}
              className={`px-3 py-1.5 text-xs sm:text-sm rounded-lg transition-colors ${
                timeRange === '30d' 
                  ? 'bg-green-600 text-white' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              30 Days
            </button>
            <button
              onClick={() => setTimeRange('90d')}
              className={`px-3 py-1.5 text-xs sm:text-sm rounded-lg transition-colors ${
                timeRange === '90d' 
                  ? 'bg-green-600 text-white' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              90 Days
            </button>
            <button
              onClick={() => setTimeRange('all')}
              className={`px-3 py-1.5 text-xs sm:text-sm rounded-lg transition-colors ${
                timeRange === 'all' 
                  ? 'bg-green-600 text-white' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              All Time
            </button>
          </div>
        </div>
        <div>
          {isLoadingLogs ? (
            <div className="flex flex-col items-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mb-3"></div>
              <p className="text-gray-500">Loading historical data...</p>
            </div>
          ) : (() => {
            // Count active devices (using npk.timestamp-based status)
            const activeDevicesCount = paddies.filter(p => getDeviceStatus(p, deviceReadings).status === 'ok').length;

            if (activeDevicesCount === 0) {
              return (
                <div className="text-center py-8">
                  <div className="text-5xl mb-3">⚠️</div>
                  <p className="text-lg font-semibold text-gray-900">No active devices</p>
                  <p className="text-sm text-gray-500 mt-2">No devices are currently sending recent NPK readings. Check device connectivity or wait for data to arrive.</p>
                </div>
              );
            }
            // Merge historical and real-time logs, dedupe, sort
            // 1) Build latest historical timestamp per paddy
            const latestHistoricalByPaddy: Record<string, number> = historicalLogs.reduce((acc, log) => {
              if (!log.paddyId) return acc;
              const t = log.timestamp.getTime();
              acc[log.paddyId] = Math.max(acc[log.paddyId] || 0, t);
              return acc;
            }, {} as Record<string, number>);

            // 2) Compute startDate for the selected timeRange (match Firestore query behavior)
            const nowRender = new Date();
            let startDateRender = new Date();
            switch (timeRange) {
              case '7d': startDateRender.setDate(nowRender.getDate() - 7); break;
              case '30d': startDateRender.setDate(nowRender.getDate() - 30); break;
              case '90d': startDateRender.setDate(nowRender.getDate() - 90); break;
              case 'all': startDateRender = new Date(0); break;
            }

            // 3) Filter realtime logs: keep only those newer than the latest historical for the same paddy
            //    and that fall within the selected timeRange (to avoid including old RTDB entries)
            const filteredRealtime = realtimeLogs.filter((log) => {
              if (!log.paddyId) return false; // ignore malformed
              const latestHist = latestHistoricalByPaddy[log.paddyId];
              const t = log.timestamp.getTime();
              // Must be within selected time window
              if (t < startDateRender.getTime()) return false;
              // Keep realtime log only if it's newer than the latest historical for that paddy
              if (latestHist && t <= latestHist) return false;
              return true;
            });

            // Insert gap markers for paddies currently considered offline so the chart shows discontinuities
            const gapEntries: any[] = [];
            paddies.forEach((paddy) => {
              if (!paddy.id) return;
              const latestHist = latestHistoricalByPaddy[paddy.id];
              // Only create a gap if we have historical data and the paddy is offline
              if (latestHist) {
                const status = getDeviceStatus(paddy, deviceReadings);
                if (status.status !== 'ok') {
                  gapEntries.push({
                    id: `gap-${paddy.id}-${latestHist + 1}`,
                    timestamp: new Date(latestHist + 1000),
                    nitrogen: null,
                    phosphorus: null,
                    potassium: null,
                    paddyId: paddy.id,
                    paddyName: paddy.paddyName,
                    _src: 'gap'
                  });
                }
              }
            });

            const allLogs = [...historicalLogs, ...filteredRealtime, ...gapEntries];

            // 4) Deduplicate by paddy/device + second-precision timestamp, preferring historical ('paddy') over 'rtdb'
            const mergedByKey = new Map<string, any>();
            for (const log of allLogs) {
              const key = `${Math.floor(log.timestamp.getTime() / 1000)}-${log.paddyId || log.deviceId}`;
              if (!mergedByKey.has(key)) {
                mergedByKey.set(key, log);
                continue;
              }
              const existing = mergedByKey.get(key);
              // If either is from 'paddy', prefer that one (historical). Otherwise keep the first.
              if (existing._src === 'paddy') continue;
              if (log._src === 'paddy') {
                mergedByKey.set(key, log);
              }
            }

            const deduped = Array.from(mergedByKey.values());

            const sortedLogs = deduped
              .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()); // Newest first
            const chartLogs = sortedLogs
              .slice()
              .reverse()
              .slice(-10); // Last 10 for chart (oldest to newest)

            // Pagination logic
            const totalPages = Math.ceil(sortedLogs.length / itemsPerPage);
            const startIndex = (currentPage - 1) * itemsPerPage;
            const endIndex = startIndex + itemsPerPage;
            const paginatedLogs = sortedLogs.slice(startIndex, endIndex);

            return sortedLogs.length > 0 ? (
              <div className="space-y-6">
                {/* Info Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <p className="text-sm text-gray-600">
                      Showing <span className="font-semibold text-gray-900">{sortedLogs.length}</span> reading{sortedLogs.length !== 1 ? 's' : ''} 
                      {timeRange !== 'all' && (
                        <span> over the last {
                          timeRange === '7d' ? '7 days' :
                          timeRange === '30d' ? '30 days' :
                          timeRange === '90d' ? '90 days' :
                          'recording period'
                        }</span>
                      )}
                    </p>
                    {useStaticMode ? (
                      <p className="text-xs text-yellow-600 mt-1 flex items-center gap-1">
                        <span className="inline-block w-2 h-2 bg-yellow-400 rounded-full"></span>
                        Live updates disabled (static)
                      </p>
                    ) : (
                      <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                        <span className="inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                        Live updates enabled
                      </p>
                    )}
                  </div>
                </div>

                {/* Chart */}
                <div className="bg-gray-50 rounded-xl p-4">
                  <TrendsChart 
                    logs={chartLogs} 
                    key={`${historicalLogs.length}-${realtimeLogs.length}-${realtimeLogs[realtimeLogs.length - 1]?.timestamp?.getTime() || 0}`} 
                  />
                </div>

                {/* Data Table */}
                <div className="overflow-hidden">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
                    <h4 className="text-md font-semibold text-gray-900">Reading History</h4>
                    {totalPages > 1 && (
                      <p className="text-xs sm:text-sm text-gray-600">
                        Page <span className="font-semibold">{currentPage}</span> of <span className="font-semibold">{totalPages}</span>
                        {' '}({startIndex + 1}-{Math.min(endIndex, sortedLogs.length)} of {sortedLogs.length})
                      </p>
                    )}
                  </div>
                  
                  {/* Desktop Table */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-gray-50 border-b-2 border-gray-200">
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Timestamp</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Paddy</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Nitrogen (N)</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Phosphorus (P)</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Potassium (K)</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Source</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {paginatedLogs.map((log, index) => {
                          const globalIndex = startIndex + index;
                          return (
                            <tr 
                              key={log.id || `log-${globalIndex}`} 
                              className={`hover:bg-gray-50 transition-colors ${
                                globalIndex === 0 && realtimeLogs.some(rt => rt.id === log.id) ? 'bg-green-50' : ''
                              }`}
                            >
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                {log.timestamp.toLocaleString('en-US', {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  second: '2-digit'
                                })}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                                {log.paddyName || 'Unknown'}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-blue-700">
                                {log.nitrogen !== undefined && log.nitrogen !== null ? `${Math.round(log.nitrogen)} mg/kg` : '--'}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-purple-700">
                                {log.phosphorus !== undefined && log.phosphorus !== null ? `${Math.round(log.phosphorus)} mg/kg` : '--'}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-orange-700">
                                {log.potassium !== undefined && log.potassium !== null ? `${Math.round(log.potassium)} mg/kg` : '--'}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-xs">
                                <span className={`px-2 py-1 rounded-full ${
                                  log._src === 'rtdb' ? 'bg-green-100 text-green-800' :
                                  log._src === 'paddy' ? 'bg-blue-100 text-blue-800' :
                                  'bg-gray-100 text-gray-800'
                                }`}>
                                  {log._src === 'rtdb' ? 'Live' : log._src === 'paddy' ? 'Paddy Log' : 'Device Log'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Cards */}
                  <div className="md:hidden space-y-3">
                    {paginatedLogs.map((log, index) => {
                      const globalIndex = startIndex + index;
                      return (
                        <div 
                          key={log.id || `log-${globalIndex}`}
                          className={`bg-white border rounded-lg p-4 shadow-sm ${
                            globalIndex === 0 && realtimeLogs.some(rt => rt.id === log.id) ? 'border-green-300 bg-green-50' : 'border-gray-200'
                          }`}
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1">
                              <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Paddy</p>
                              <p className="text-sm font-medium text-gray-900">{log.paddyName || 'Unknown'}</p>
                              <p className="text-xs font-semibold text-gray-500 uppercase mb-1 mt-2">Timestamp</p>
                              <p className="text-sm text-gray-900">
                                {log.timestamp.toLocaleString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  second: '2-digit'
                                })}
                              </p>
                              <p className="text-xs text-gray-500 mt-1">
                                {log.timestamp.toLocaleDateString('en-US', { year: 'numeric' })}
                              </p>
                            </div>
                            <span className={`px-2 py-1 rounded-full text-xs ${
                              log._src === 'rtdb' ? 'bg-green-100 text-green-800' :
                              log._src === 'paddy' ? 'bg-blue-100 text-blue-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {log._src === 'rtdb' ? 'Live' : log._src === 'paddy' ? 'Paddy' : 'Device'}
                            </span>
                          </div>
                          <div className="grid grid-cols-3 gap-3">
                            <div>
                              <p className="text-xs font-semibold text-blue-600 mb-1">Nitrogen (N)</p>
                              <p className="text-lg font-bold text-blue-700">
                                {log.nitrogen !== undefined && log.nitrogen !== null ? Math.round(log.nitrogen) : '--'}
                              </p>
                              <p className="text-xs text-gray-500">mg/kg</p>
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-purple-600 mb-1">Phosphorus (P)</p>
                              <p className="text-lg font-bold text-purple-700">
                                {log.phosphorus !== undefined && log.phosphorus !== null ? Math.round(log.phosphorus) : '--'}
                              </p>
                              <p className="text-xs text-gray-500">mg/kg</p>
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-orange-600 mb-1">Potassium (K)</p>
                              <p className="text-lg font-bold text-orange-700">
                                {log.potassium !== undefined && log.potassium !== null ? Math.round(log.potassium) : '--'}
                              </p>
                              <p className="text-xs text-gray-500">mg/kg</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Pagination Controls */}
                  {totalPages > 1 && (
                    <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                      <div className="text-xs sm:text-sm text-gray-600 text-center sm:text-left">
                        Showing {startIndex + 1} to {Math.min(endIndex, sortedLogs.length)} of {sortedLogs.length} readings
                      </div>
                      <div className="flex items-center gap-1 sm:gap-2">
                        <button
                          onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                          disabled={currentPage === 1}
                          className={`px-2 sm:px-3 py-2 text-xs sm:text-sm rounded-lg transition-colors ${
                            currentPage === 1
                              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                          }`}
                        >
                          <span className="hidden sm:inline">Previous</span>
                          <span className="sm:hidden">Prev</span>
                        </button>
                        
                        {/* Page Numbers */}
                        <div className="flex items-center gap-1">
                          {(() => {
                            const maxPages = 5;
                            const pagesToShow = Math.min(maxPages, totalPages);
                            
                            let startPage = 1;
                            if (totalPages > maxPages) {
                              if (currentPage <= 3) {
                                startPage = 1;
                              } else if (currentPage >= totalPages - 2) {
                                startPage = totalPages - maxPages + 1;
                              } else {
                                startPage = currentPage - 2;
                              }
                            }
                            
                            return Array.from({ length: pagesToShow }, (_, i) => {
                              const pageNum = startPage + i;
                              return (
                                <button
                                  key={pageNum}
                                  onClick={() => setCurrentPage(pageNum)}
                                  className={`px-2 sm:px-3 py-2 text-xs sm:text-sm rounded-lg transition-colors ${
                                    currentPage === pageNum
                                      ? 'bg-green-600 text-white'
                                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                  }`}
                                >
                                  {pageNum}
                                </button>
                              );
                            });
                          })()}
                        </div>
                        
                        <button
                          onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                          disabled={currentPage === totalPages}
                          className={`px-2 sm:px-3 py-2 text-xs sm:text-sm rounded-lg transition-colors ${
                            currentPage === totalPages
                              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                          }`}
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="text-5xl mb-3">📊</div>
                <p className="text-gray-500 font-medium">No historical data found</p>
                <p className="text-sm text-gray-400 mt-2">
                  {deviceReadings.length > 0 
                    ? 'NPK readings will be automatically logged to Firestore. Check back later!'
                    : 'Connect devices to start logging NPK readings.'}
                </p>
                {deviceReadings.length > 0 && (
                  <p className="text-xs text-gray-400 mt-1">
                    Current devices: {deviceReadings.filter(r => r.npk).length} with NPK data
                  </p>
                )}
              </div>
            );
          })()}
        </div>
      </div>

      {/* Current Device Readings */}
      {deviceReadings.length > 0 && (
        <div className="bg-white rounded-xl shadow-md p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Current Device Readings</h2>
          <div className="space-y-3">
            {deviceReadings.map((reading) => {
              const paddy = paddies.find(p => p.deviceId === reading.deviceId);
              const npk = reading.npk;
              
              if (!npk || (npk.n === undefined && npk.p === undefined && npk.k === undefined)) {
                return (
                  <div key={reading.deviceId} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-gray-900">{paddy?.paddyName || reading.deviceId}</p>
                        <p className="text-xs text-gray-500">Device: {reading.deviceId}</p>
                      </div>
                      <span className="text-xs text-gray-400">No NPK data</span>
                    </div>
                  </div>
                );
              }
              
              return (
                <div key={reading.deviceId} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="font-semibold text-gray-900">{paddy?.paddyName || reading.deviceId}</p>
                      <p className="text-xs text-gray-500">Device: {reading.deviceId}</p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded ${
                      reading.status === 'connected' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {reading.status || 'unknown'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {npk.n !== undefined && (
                      <div className="bg-blue-50 rounded-lg p-3">
                        <p className="text-xs text-blue-600 font-medium mb-1">Nitrogen (N)</p>
                        <p className="text-lg font-bold text-blue-900">{Math.round(npk.n)}</p>
                        <p className="text-xs text-blue-500">mg/kg</p>
                      </div>
                    )}
                    {npk.p !== undefined && (
                      <div className="bg-purple-50 rounded-lg p-3">
                        <p className="text-xs text-purple-600 font-medium mb-1">Phosphorus (P)</p>
                        <p className="text-lg font-bold text-purple-900">{Math.round(npk.p)}</p>
                        <p className="text-xs text-purple-500">mg/kg</p>
                      </div>
                    )}
                    {npk.k !== undefined && (
                      <div className="bg-orange-50 rounded-lg p-3">
                        <p className="text-xs text-orange-600 font-medium mb-1">Potassium (K)</p>
                        <p className="text-lg font-bold text-orange-900">{Math.round(npk.k)}</p>
                        <p className="text-xs text-orange-500">mg/kg</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Field Summary */}
      <div className="bg-white rounded-xl shadow-md p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-3">Field Summary</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-600">Total Paddies</p>
            <p className="text-xl font-bold text-gray-900">{paddies.length}</p>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-600">Active Devices</p>
            <p className="text-xl font-bold text-gray-900">{paddies.filter(p => getDeviceStatus(p, deviceReadings).status !== 'offline').length}</p>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-600">Devices with NPK</p>
            <p className="text-xl font-bold text-gray-900">
              {deviceReadings.filter(r => r.npk && (r.npk.n !== undefined || r.npk.p !== undefined || r.npk.k !== undefined)).length}
            </p>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-600">Historical Logs</p>
            <p className="text-xl font-bold text-gray-900">{historicalLogs.length}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
