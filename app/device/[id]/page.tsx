'use client';

import ProtectedRoute from "@/components/ProtectedRoute";
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

// Register Chart.js components
ChartJS.register(LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend);
import { useParams, useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { db, database } from '@/lib/firebase';
import { doc, getDoc, collection, getDocs, updateDoc, query, where, onSnapshot } from 'firebase/firestore';
import { ref, get, onValue, set } from 'firebase/database';
import { getDeviceData, onDeviceValue } from '@/lib/utils/rtdbHelper';
import NotificationBell from "@/components/NotificationBell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Menu, Home as HomeIcon, BookOpen, HelpCircle, Info, LogOut, Shield } from "lucide-react";
import { usePageVisibility } from "@/lib/hooks/usePageVisibility";

// Admin email for access control
const ADMIN_EMAIL = 'ricepaddy.contact@gmail.com';

export default function DeviceDetail() {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const { visibility } = usePageVisibility();
  const deviceId = params.id as string;
  
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | 'all'>('7d');
  const [historicalLogs, setHistoricalLogs] = useState<any[]>([]);
  const [realtimeLogs, setRealtimeLogs] = useState<any[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [deviceInfo, setDeviceInfo] = useState<any>(null);
  const [paddyInfo, setPaddyInfo] = useState<any>(null);
  const [fieldInfo, setFieldInfo] = useState<any>(null);
  const [deviceReadings, setDeviceReadings] = useState<any[]>([]);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [gpsData, setGpsData] = useState<any>(null);
  const [loadingGps, setLoadingGps] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [weatherData, setWeatherData] = useState<{ temperature: number | null; humidity: number | null; loading: boolean }>({
    temperature: null,
    humidity: null,
    loading: false
  });
  const [isEditingPaddyName, setIsEditingPaddyName] = useState(false);
  const [paddyNameValue, setPaddyNameValue] = useState('');
  const [isSavingPaddyName, setIsSavingPaddyName] = useState(false);

  // Import and use live NPK hook
  const { useLiveNPK } = require('@/lib/hooks/useLiveNPK');
  const liveNPK = useLiveNPK(deviceId);

  // Fetch temperature and humidity data (from device sensors or weather API)
  useEffect(() => {
    const fetchWeatherData = async () => {
      if (!deviceId) {
        console.log('[Weather] No deviceId');
        return;
      }
      
      console.log('[Weather] Fetching temperature/humidity for device:', deviceId);
      setWeatherData(prev => ({ ...prev, loading: true }));
      
      try {
        // Strategy 1: Check for device sensor data first (most accurate)
        try {
          const sensors = await getDeviceData(deviceId, 'sensors');
          
          if (sensors) {
            if (sensors.temperature !== undefined || sensors.humidity !== undefined) {
              console.log('[Weather] Using device sensor data');
              setWeatherData({
                temperature: sensors.temperature ?? null,
                humidity: sensors.humidity ?? null,
                loading: false
              });
              // Still try to fetch weather API in background for comparison
              fetchFreshWeather().catch(() => {}); // Ignore errors
              return;
            }
          }
        } catch (sensorError) {
          console.log('[Weather] No device sensor data available:', sensorError);
        }
        
        // Strategy 2: Try cached weather data from RTDB (if available and recent)
        try {
          const cachedWeather = await getDeviceData(deviceId, 'weather');
          
          if (cachedWeather) {
            const cacheAge = Date.now() - (cachedWeather.timestamp || 0);
            const maxCacheAge = 10 * 60 * 1000; // 10 minutes
            
            // Use cached data if it's less than 10 minutes old
            if (cacheAge < maxCacheAge && (cachedWeather.temperature !== null || cachedWeather.humidity !== null)) {
              console.log('[Weather] Using cached weather data');
              setWeatherData({
                temperature: cachedWeather.temperature ?? null,
                humidity: cachedWeather.humidity ?? null,
                loading: false
              });
              // Still fetch fresh data in background (don't await)
              fetchFreshWeather().catch(() => {}); // Ignore errors
              return;
            }
          }
        } catch (cacheError) {
          console.log('[Weather] No cached weather data:', cacheError);
        }
        
        // Strategy 3: Fetch fresh data from weather API
        await fetchFreshWeather();
      } catch (error) {
        console.error('[Weather] Error fetching weather data:', error);
        setWeatherData({ temperature: null, humidity: null, loading: false });
      }
    };
    
    const fetchFreshWeather = async () => {
      try {
        // Get GPS coordinates from RTDB - try both gps and location paths
        let lat: number | null = null;
        let lng: number | null = null;
        
        // Try gps path first (preferred format)
        try {
          const gps = await getDeviceData(deviceId, 'gps');
          
          if (gps) {
            lat = gps.lat ?? null;
            lng = gps.lng ?? null;
            console.log('[Weather] GPS data from gps path:', { lat, lng });
          }
        } catch (gpsError) {
          console.log('[Weather] No GPS data at gps path');
        }
        
        // Fallback to location path if gps path didn't work
        if (!lat || !lng) {
          try {
            const location = await getDeviceData(deviceId, 'location');
            
            if (location) {
              lat = location.latitude ?? location.lat ?? null;
              lng = location.longitude ?? location.lng ?? null;
              console.log('[Weather] GPS data from location path:', { lat, lng });
            }
          } catch (locationError) {
            console.log('[Weather] No GPS data at location path');
          }
        }
        
        if (!lat || !lng) {
          console.log('[Weather] No GPS coordinates available, cannot fetch weather');
          setWeatherData({ temperature: null, humidity: null, loading: false });
          return;
        }
        
        // Fetch weather from Open-Meteo API (free, no API key required)
        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m&timezone=auto`;
        console.log('[Weather] Fetching from:', weatherUrl);
        const response = await fetch(weatherUrl);
        
        if (!response.ok) {
          throw new Error('Weather API request failed');
        }
        
        const data = await response.json();
        console.log('[Weather] API response:', data);
        
        const temperature = data.current?.temperature_2m ?? null;
        const humidity = data.current?.relative_humidity_2m ?? null;
        
        console.log('[Weather] Temperature:', temperature, 'Humidity:', humidity);
        
        setWeatherData({
          temperature,
          humidity,
          loading: false
        });
        
        // Store weather data to RTDB for historical record
        if (temperature !== null || humidity !== null) {
          try {
            console.log('[Weather] Storing to RTDB...');
            const weatherRef = ref(database, `devices/${deviceId}/weather`);
            await set(weatherRef, {
              temperature,
              humidity,
              timestamp: Date.now(),
              source: 'open-meteo'
            });
            console.log('[Weather] Stored successfully');
          } catch (writeError) {
            console.error('[Weather] Error storing to RTDB (non-critical):', writeError);
            // Don't fail the whole operation if RTDB write fails
          }
        }
      } catch (error) {
        console.error('[Weather] Error fetching fresh weather data:', error);
        setWeatherData({ temperature: null, humidity: null, loading: false });
      }
    };
    
    fetchWeatherData();
    
    // Refresh weather data every 10 minutes
    const interval = setInterval(fetchWeatherData, 10 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, [deviceId]);

  // Sync live data to state and auto-log
  useEffect(() => {
    if (!liveNPK.data || !user || !paddyInfo || !fieldInfo) return;

    setDeviceInfo((prev: any) => ({
      ...prev,
      npk: liveNPK.data,
      status: liveNPK.online ? 'connected' : 'disconnected',
      connectedAt: new Date().toISOString(),
    }));
    setDeviceReadings([{ deviceId, npk: liveNPK.data, status: liveNPK.online ? 'connected' : 'disconnected' }]);

    // Auto-log NPK readings if available
    (async () => {
      const { autoLogReadings } = await import('@/lib/utils/sensorLogging');
      if (liveNPK.data.n !== undefined || liveNPK.data.p !== undefined || liveNPK.data.k !== undefined) {
        await autoLogReadings(user.uid, fieldInfo.id, paddyInfo.id, {
          n: liveNPK.data.n,
          p: liveNPK.data.p,
          k: liveNPK.data.k,
          timestamp: liveNPK.data.timestamp,
        });
      }
    })();
  }, [liveNPK.data, user, paddyInfo, fieldInfo, deviceId]);

  // Real-time RTDB listener for live chart updates
  useEffect(() => {
    if (!deviceId) return;

    const unsubscribe = onDeviceValue(deviceId, 'npk', (data) => {
      if (!data) return;
      
      // Use ESP32 timestamp if valid (in milliseconds), otherwise use current time
      const timestamp = data.timestamp && data.timestamp > 1700000000000 
        ? new Date(data.timestamp) 
        : new Date();
      
      // Only add if we have actual NPK values
      if (data.n !== undefined || data.p !== undefined || data.k !== undefined) {
        const newLog = {
          id: `rtdb-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp,
          nitrogen: data.n,
          phosphorus: data.p,
          potassium: data.k,
          _src: 'rtdb'
        };
        
        setRealtimeLogs(prev => {
          // Dedupe by NPK values (same n, p, k = same reading)
          const lastLog = prev[prev.length - 1];
          const isDuplicate = lastLog && 
            lastLog.nitrogen === data.n && 
            lastLog.phosphorus === data.p && 
            lastLog.potassium === data.k;
          
          if (isDuplicate) return prev;
          
          // Keep only last 10 real-time entries
          const updated = [...prev, newLog].slice(-10);
          return updated;
        });
      }
    });

    return () => unsubscribe();
  }, [deviceId]);
  useEffect(() => {
    if (!user || !paddyInfo || !fieldInfo) return;
    setIsLoadingLogs(true);

    const now = new Date();
    let startDate = new Date();
    switch (timeRange) {
      case '7d': startDate.setDate(now.getDate() - 7); break;
      case '30d': startDate.setDate(now.getDate() - 30); break;
      case '90d': startDate.setDate(now.getDate() - 90); break;
      case 'all': startDate = new Date(0); break;
    }

    // Keep latest snapshots for merge/dedupe
    let latestPaddy: any[] = [];
    let latestDevice: any[] = [];

    const mergeAndSet = () => {
      const merged = [...latestPaddy, ...latestDevice].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      const deduped: any[] = [];
      const seen = new Set<string>();
      for (const log of merged) {
        // Use document ID if available, otherwise use a combination of timestamp, values, and source
        // This ensures we don't lose legitimate readings that might have similar timestamps
        const key = log.id 
          ? `${log._src || 'unknown'}-${log.id}` 
          : `${log._src || 'unknown'}-${log.timestamp.getTime()}-${log.nitrogen ?? ''}-${log.phosphorus ?? ''}-${log.potassium ?? ''}`;
        if (!seen.has(key)) {
          seen.add(key);
          deduped.push(log);
        }
      }
      setHistoricalLogs(deduped);
      setIsLoadingLogs(false);
    };

    // Primary: paddy logs listener
    const paddyRef = collection(db, `users/${user.uid}/fields/${fieldInfo.id}/paddies/${paddyInfo.id}/logs`);
    const pq = timeRange === 'all' ? paddyRef : query(paddyRef, where('timestamp', '>=', startDate));
    const unsubPaddy = onSnapshot(pq, (snapshot) => {
      const arr: any[] = [];
      snapshot.forEach((doc) => {
        const data: any = doc.data();
        const logDate = data.timestamp?.toDate?.() || new Date(data.timestamp);
        if (logDate >= startDate) {
          arr.push({ ...data, id: doc.id, timestamp: logDate, _src: 'paddy' });
        }
      });
      latestPaddy = arr;
      mergeAndSet();
    }, (err) => {
      console.error('Paddy logs listener error:', err);
    });

    // Fallback: device logs listener
    const deviceRef = collection(db, `deviceLogs/${deviceId}/readings`);
    const dq = timeRange === 'all' ? deviceRef : query(deviceRef, where('timestamp', '>=', startDate));
    const unsubDevice = onSnapshot(dq, (snapshot) => {
      const arr: any[] = [];
      snapshot.forEach((doc) => {
        const data: any = doc.data();
        const logDate = data.timestamp?.toDate?.() || new Date(data.timestamp);
        if (logDate >= startDate) {
          arr.push({ ...data, id: doc.id, timestamp: logDate, _src: 'device' });
        }
      });
      latestDevice = arr;
      mergeAndSet();
    }, (err) => {
      console.error('Device logs listener error:', err);
    });

    return () => {
      try { unsubPaddy(); } catch {}
      try { unsubDevice(); } catch {}
    };
  }, [user, paddyInfo, fieldInfo, timeRange, deviceId]);

  // Reset to page 1 when time range changes
  useEffect(() => {
    setCurrentPage(1);
  }, [timeRange]);
    
  // Get device status - use liveNPK directly from RTDB
  const getDeviceStatusDisplay = () => {
    const isOnline = liveNPK.online;
    const hasNPK = liveNPK.data && (
      liveNPK.data.n !== undefined || 
      liveNPK.data.p !== undefined || 
      liveNPK.data.k !== undefined
    );
    
    if (liveNPK.loading) {
      return {
        status: 'loading',
        message: 'Connecting to device...',
        color: 'gray',
        badge: 'Loading',
        lastUpdate: 'Connecting...'
      };
    }
    
    if (!liveNPK.data && !isOnline) {
      return {
        status: 'offline',
        message: 'Device not found or offline.',
        color: 'red',
        badge: 'Offline',
        lastUpdate: 'No connection'
      };
    }
    
    if (!isOnline) {
      return {
        status: 'offline',
        message: 'Device is offline. Check power and network connection.',
        color: 'red',
        badge: 'Offline',
        lastUpdate: 'No connection'
      };
    }
    
    if (isOnline && !hasNPK) {
      return {
        status: 'sensor-issue',
        message: 'Device connected but sensor readings unavailable. Check sensor connections.',
        color: 'yellow',
        badge: 'Sensor Issue',
        lastUpdate: 'Just now'
      };
    }
    
    return {
      status: 'ok',
      message: 'All systems operational',
      color: 'green',
      badge: 'Connected',
      lastUpdate: 'Just now'
    };
  };
  
  const deviceStatus = getDeviceStatusDisplay();
  
  // Fetch device and paddy information
  useEffect(() => {
    const fetchDeviceInfo = async () => {
      if (!user) return;
      
      try {
        // Find which paddy this device belongs to
        const fieldsRef = collection(db, `users/${user.uid}/fields`);
        const fieldsSnapshot = await getDocs(fieldsRef);
        
        for (const fieldDoc of fieldsSnapshot.docs) {
          const paddiesRef = collection(db, `users/${user.uid}/fields/${fieldDoc.id}/paddies`);
          const paddiesSnapshot = await getDocs(paddiesRef);
          
          for (const paddyDoc of paddiesSnapshot.docs) {
            const paddyData = paddyDoc.data();
            if (paddyData.deviceId === deviceId) {
              setPaddyInfo({ id: paddyDoc.id, ...paddyData });
              setFieldInfo({ id: fieldDoc.id, ...fieldDoc.data() });
              return;
            }
          }
        }
      } catch (error) {
        console.error('Error fetching device info:', error);
      }
    };
    
    fetchDeviceInfo();
  }, [user, deviceId]);

  // Fetch GPS location data for device status card
  useEffect(() => {
    const fetchGPSData = async () => {
      if (!deviceId) return;
      
      try {
        const gps = await getDeviceData(deviceId, 'gps');
        
        if (gps) {
          setGpsData(gps);
        } else {
          // Try location path as fallback
          const location = await getDeviceData(deviceId, 'location');
          
          if (location) {
            setGpsData({
              lat: location.latitude ?? location.lat,
              lng: location.longitude ?? location.lng,
              ts: location.timestamp,
            });
          }
        }
      } catch (error) {
        console.error('Error fetching GPS data:', error);
      }
    };
    
    fetchGPSData();
    
    // Set up real-time listener for GPS updates
    const unsubscribe = onDeviceValue(deviceId, 'gps', (gps) => {
      if (gps) {
        setGpsData(gps);
      }
    });
    
    return () => unsubscribe();
  }, [deviceId]);
  
  // Historical logs are now handled via real-time snapshot listeners above
  
  // Disconnect device handler
  const handleDisconnect = async () => {
    if (!user || !paddyInfo || !fieldInfo) return;
    
    const confirmed = confirm('Are you sure you want to disconnect this device? This action cannot be undone.');
    if (!confirmed) return;
    
    try {
      // Delete the paddy document
      await updateDoc(doc(db, `users/${user.uid}/fields/${fieldInfo.id}/paddies/${paddyInfo.id}`), {
        deviceId: null,
        disconnectedAt: new Date().toISOString()
      });
      
      alert('Device disconnected successfully');
      router.push(`/field/${fieldInfo.id}`);
    } catch (error) {
      console.error('Error disconnecting device:', error);
      alert('Failed to disconnect device');
    }
  };

  // Handle location view
  const handleViewLocation = async () => {
    setShowLocationModal(true);
    setLoadingGps(true);
    setGpsData(null);
    
    try {
      // Fetch GPS coordinates from Firebase RTDB
      const gps = await getDeviceData(deviceId, 'gps');
      
      if (gps) {
        setGpsData(gps);
      }
    } catch (error) {
      console.error('Error fetching GPS data:', error);
    } finally {
      setLoadingGps(false);
    }
  };

  // Handle paddy name edit
  const handleStartEditPaddyName = () => {
    if (!paddyInfo) return;
    setPaddyNameValue(paddyInfo.paddyName || '');
    setIsEditingPaddyName(true);
  };

  const handleCancelEditPaddyName = () => {
    setIsEditingPaddyName(false);
    setPaddyNameValue('');
  };

  const handleSavePaddyName = async () => {
    if (!user || !paddyInfo || !fieldInfo) return;
    
    const trimmedName = paddyNameValue.trim();
    if (!trimmedName) {
      alert('Paddy name cannot be empty');
      return;
    }

    if (trimmedName === paddyInfo.paddyName) {
      setIsEditingPaddyName(false);
      return;
    }

    setIsSavingPaddyName(true);
    try {
      const paddyRef = doc(db, `users/${user.uid}/fields/${fieldInfo.id}/paddies/${paddyInfo.id}`);
      await updateDoc(paddyRef, {
        paddyName: trimmedName,
      });

      // Update local state
      setPaddyInfo({ ...paddyInfo, paddyName: trimmedName });
      setIsEditingPaddyName(false);
    } catch (error) {
      console.error('Error updating paddy name:', error);
      alert('Failed to update paddy name');
    } finally {
      setIsSavingPaddyName(false);
    }
  };

  // Format timestamp
  const formatTimestamp = (ts: number) => {
    if (!ts) return 'Unknown';
    
    // Try to determine if timestamp is in seconds or milliseconds
    // If ts is less than a reasonable date in seconds (e.g., year 2000), it's likely in seconds
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
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <nav className="bg-gradient-to-r from-green-500 via-emerald-500 to-teal-500 shadow-lg sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center gap-2 text-sm">
                {/* Breadcrumb Navigation */}
                <button
                  onClick={() => router.push('/')}
                  className="flex items-center text-white hover:text-white/80 transition-colors"
                  title="Home"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                  </svg>
                </button>
                {fieldInfo && (
                  <>
                    <svg className="w-4 h-4 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    <button
                      onClick={() => router.push(`/field/${fieldInfo.id}`)}
                      className="text-white hover:text-white/80 transition-colors"
                      style={{ fontFamily: "'Courier New', Courier, monospace" }}
                    >
                      {fieldInfo.fieldName}
                    </button>
                  </>
                )}
                <svg className="w-4 h-4 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <span className="font-medium text-white" style={{ fontFamily: "'Courier New', Courier, monospace" }}>{paddyInfo?.paddyName || 'Device'}</span>
              </div>
              <div className="flex items-center gap-2">
                <NotificationBell />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsMenuOpen(true)}
                  className="hover:bg-white/20 text-white"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </div>
        </nav>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="bg-white rounded-2xl shadow-lg p-6 mb-6 border-0">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900" style={{ fontFamily: "'Courier New', Courier, monospace" }}>Device Status</h2>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                deviceStatus.color === 'green' ? 'bg-green-100 text-green-800' :
                deviceStatus.color === 'yellow' ? 'bg-yellow-100 text-yellow-800' :
                'bg-red-100 text-red-800'
              }`}>
                {deviceStatus.status === 'ok' ? '✓ ' : deviceStatus.status === 'sensor-issue' ? '⚠ ' : '✗ '}
                {deviceStatus.badge}
              </span>
            </div>
            
            <div className={`mb-4 p-3 rounded-lg ${
              deviceStatus.color === 'green' ? 'bg-green-50' :
              deviceStatus.color === 'yellow' ? 'bg-yellow-50' :
              'bg-red-50'
            }`}>
              <p className="text-sm text-gray-700">{deviceStatus.message}</p>
            </div>
            
            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-600">Device ID</span>
                <span className="font-medium text-gray-900">{deviceId}</span>
              </div>
              {gpsData && gpsData.lat && gpsData.lng && (
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-600 flex items-center gap-2">
                    <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Location
                  </span>
                  <button
                    onClick={handleViewLocation}
                    className="font-medium text-green-600 hover:text-green-700 hover:underline text-sm"
                  >
                    {gpsData.lat?.toFixed(5)}, {gpsData.lng?.toFixed(5)}
                  </button>
                </div>
              )}
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-600">Last Update</span>
                <span className="font-medium text-gray-900">{deviceStatus.lastUpdate}</span>
              </div>
            </div>
          </div>

          {/* Sensor Readings */}
          <div className="bg-white rounded-2xl shadow-lg p-6 mb-6 border-0">
            <h3 className="text-lg font-semibold text-gray-900 mb-4" style={{ fontFamily: "'Courier New', Courier, monospace" }}>Current Readings</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="p-4 bg-blue-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-700">Nitrogen (N)</p>
                  <span className="text-lg">🧪</span>
                </div>
                <p className="text-xl font-bold text-gray-900">
                  {liveNPK.data?.n !== undefined ? Math.round(liveNPK.data.n) : '--'}
                </p>
                <p className="text-xs text-gray-500 mt-1">mg/kg</p>
              </div>
              <div className="p-4 bg-green-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-700">Phosphorus (P)</p>
                  <span className="text-lg">⚗️</span>
                </div>
                <p className="text-xl font-bold text-gray-900">
                  {liveNPK.data?.p !== undefined ? Math.round(liveNPK.data.p) : '--'}
                </p>
                <p className="text-xs text-gray-500 mt-1">mg/kg</p>
              </div>
              <div className="p-4 bg-purple-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-700">Potassium (K)</p>
                  <span className="text-lg">🔬</span>
                </div>
                <p className="text-xl font-bold text-gray-900">
                  {liveNPK.data?.k !== undefined ? Math.round(liveNPK.data.k) : '--'}
                </p>
                <p className="text-xs text-gray-500 mt-1">mg/kg</p>
              </div>
              <div className="p-4 bg-orange-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-700">Temperature</p>
                  <span className="text-lg">🌡️</span>
                </div>
                <p className="text-xl font-bold text-gray-900">
                  {weatherData.loading ? (
                    <span className="inline-block w-4 h-4 border-2 border-orange-400 border-t-transparent rounded-full animate-spin"></span>
                  ) : weatherData.temperature !== null ? (
                    Math.round(weatherData.temperature)
                  ) : '--'}
                </p>
                <p className="text-xs text-gray-500 mt-1">°C {weatherData.temperature !== null && <span className="text-orange-500">(GPS)</span>}</p>
              </div>
              <div className="p-4 bg-cyan-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-700">Humidity</p>
                  <span className="text-lg">💧</span>
                </div>
                <p className="text-xl font-bold text-gray-900">
                  {weatherData.loading ? (
                    <span className="inline-block w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"></span>
                  ) : weatherData.humidity !== null ? (
                    Math.round(weatherData.humidity)
                  ) : '--'}
                </p>
                <p className="text-xs text-gray-500 mt-1">% {weatherData.humidity !== null && <span className="text-cyan-500">(GPS)</span>}</p>
              </div>
              <div className="p-4 bg-indigo-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-700">Water Level</p>
                  <span className="text-lg">🌊</span>
                </div>
                <p className="text-xl font-bold text-gray-900">--</p>
                <p className="text-xs text-gray-500 mt-1">cm</p>
              </div>
            </div>
          </div>

          {/* NPK Statistics */}
          {user && paddyInfo && fieldInfo && (
            <DeviceStatistics 
              userId={user.uid}
              fieldId={fieldInfo.id}
              paddyId={paddyInfo.id}
              deviceId={deviceId}
              currentNPK={liveNPK.data}
            />
          )}

          {/* Data Trends */}
          <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Data Trends</h3>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={async () => {
                    if (!paddyInfo || !fieldInfo) {
                      alert('Device not yet loaded');
                      return;
                    }
                    try {
                      const { executeDeviceAction } = await import('@/lib/utils/deviceActions');
                      await executeDeviceAction(deviceId, 'scan', 15000);
                      alert('Scan initiated successfully');
                    } catch (error: any) {
                      console.error('Scan error:', error);
                      alert('Scan failed: ' + (error?.message || 'Unknown error'));
                    }
                  }}
                  className="px-3 py-1.5 text-xs sm:text-sm rounded-lg transition-colors bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-1.5"
                  title="Scan device now"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <span className="hidden sm:inline">Scan Now</span>
                  <span className="sm:hidden">Scan</span>
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
                // Merge historical and real-time logs, dedupe, sort
                const allLogs = [...historicalLogs, ...realtimeLogs];
                const seen = new Set<string>();
                const deduped = allLogs.filter(log => {
                  // Use document ID if available, otherwise use a combination of timestamp, values, and source
                  // This ensures we don't lose legitimate readings that might have similar timestamps
                  const key = log.id 
                    ? `${log._src || 'unknown'}-${log.id}` 
                    : `${log._src || 'unknown'}-${log.timestamp.getTime()}-${log.nitrogen ?? ''}-${log.phosphorus ?? ''}-${log.potassium ?? ''}`;
                  if (seen.has(key)) return false;
                  seen.add(key);
                  return true;
                });
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
                        <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                          <span className="inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                          Live updates enabled
                        </p>
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
                          <p className="text-sm text-gray-600">
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
                                  key={`${log.id || 'log'}-${globalIndex}-${log.timestamp.getTime()}`} 
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
                              key={`${log.id || 'log'}-${globalIndex}-${log.timestamp.getTime()}`}
                              className={`bg-white border rounded-lg p-4 shadow-sm ${
                                globalIndex === 0 && realtimeLogs.some(rt => rt.id === log.id) ? 'border-green-300 bg-green-50' : 'border-gray-200'
                              }`}
                            >
                              <div className="flex items-start justify-between mb-3">
                                <div className="flex-1">
                                  <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Timestamp</p>
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
                    <p className="text-gray-500">No historical data found</p>
                    <p className="text-sm text-gray-400 mt-1">Sensor readings will be logged automatically</p>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Device Information */}
          <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Device Information</h3>
              <button
                onClick={handleViewLocation}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                title="View GPS location"
              >
                <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-600">Device ID</span>
                <span className="font-medium text-gray-900">{deviceId}</span>
              </div>
              {paddyInfo && (
                <>
                  <div className="py-2 border-b border-gray-100">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-gray-600">Paddy Name</span>
                      {!isEditingPaddyName && (
                        <button
                          onClick={handleStartEditPaddyName}
                          className="text-green-600 hover:text-green-700 text-xs font-medium"
                          title="Edit paddy name"
                        >
                          ✏️ Edit
                        </button>
                      )}
                    </div>
                    {isEditingPaddyName ? (
                      <div className="space-y-2 mt-2">
                        <Input
                          type="text"
                          value={paddyNameValue}
                          onChange={(e) => setPaddyNameValue(e.target.value)}
                          className="w-full"
                          placeholder="Enter paddy name"
                          disabled={isSavingPaddyName}
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <Button
                            onClick={handleSavePaddyName}
                            disabled={isSavingPaddyName || !paddyNameValue.trim()}
                            size="sm"
                            className="bg-green-600 hover:bg-green-700 text-white"
                          >
                            {isSavingPaddyName ? 'Saving...' : 'Save'}
                          </Button>
                          <Button
                            onClick={handleCancelEditPaddyName}
                            disabled={isSavingPaddyName}
                            size="sm"
                            variant="outline"
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <span className="font-medium text-gray-900">{paddyInfo.paddyName}</span>
                    )}
                  </div>
                  {paddyInfo.description && (
                    <div className="flex justify-between py-2 border-b border-gray-100">
                      <span className="text-gray-600">Description</span>
                      <span className="font-medium text-gray-900">{paddyInfo.description}</span>
                    </div>
                  )}
                </>
              )}
              {fieldInfo && (
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-600">Field</span>
                  <button 
                    onClick={() => router.push(`/field/${fieldInfo.id}`)}
                    className="font-medium text-green-600 hover:text-green-700"
                  >
                    {fieldInfo.fieldName} →
                  </button>
                </div>
              )}
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-600">Connection Status</span>
                <span className={`font-medium ${
                  deviceStatus.color === 'green' ? 'text-green-600' :
                  deviceStatus.color === 'yellow' ? 'text-yellow-600' :
                  'text-red-600'
                }`}>
                  {deviceStatus.badge}
                </span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-gray-600">Last Heartbeat</span>
                <span className="font-medium text-gray-900">{deviceStatus.lastUpdate}</span>
              </div>
            </div>
          </div>

          {/* Danger Zone */}
          <div className="bg-white rounded-2xl shadow-lg p-6 border-0">
            <h3 className="text-lg font-semibold text-red-600 mb-2">Danger Zone</h3>
            <p className="text-sm text-gray-600 mb-4">
              Once you disconnect this device, all associated data will be removed and this action cannot be undone.
            </p>
            <button
              onClick={handleDisconnect}
              disabled={!paddyInfo}
              className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              Disconnect Device
            </button>
          </div>
        </main>

        {/* Floating Action Button - Navigate to Add Field */}
        <button 
          onClick={() => router.push('/')}
          className="fixed bottom-8 right-8 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-full shadow-2xl hover:shadow-3xl hover:from-green-700 hover:to-emerald-700 active:scale-95 transition-all flex items-center justify-center w-14 h-14 z-40"
          title="Add New Field"
        >
          <span className="text-3xl font-light">+</span>
        </button>

        {/* Location Modal */}
        {showLocationModal && (
          <>
            {/* Glassmorphism Overlay */}
            <div 
              onClick={() => setShowLocationModal(false)}
              className="fixed inset-0 backdrop-blur-sm bg-black/20 z-40 transition-all"
            />
            
            {/* Location Modal */}
            <div className="fixed inset-x-0 bottom-0 z-50 animate-slide-up">
              <div className="bg-white rounded-t-3xl shadow-2xl max-h-[85vh] flex flex-col border-t-4 border-green-500">
                {/* Handle Bar */}
                <div className="flex justify-center pt-3 pb-4">
                  <div className="w-12 h-1.5 bg-green-300 rounded-full" />
                </div>
                
                {/* Modal Header */}
                <div className="px-6 pb-4 border-b border-gray-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-2xl font-bold text-gray-900">GPS Location</h2>
                      <p className="text-sm text-gray-600 mt-1">Device: {deviceId}</p>
                    </div>
                    <button
                      onClick={() => setShowLocationModal(false)}
                      className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
                
                {/* GPS Content */}
                <div className="flex-1 overflow-y-auto p-6">
                  {loadingGps ? (
                    <div className="flex flex-col items-center justify-center py-12">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mb-4"></div>
                      <p className="text-gray-600">Fetching GPS data...</p>
                    </div>
                  ) : gpsData ? (
                    <div className="space-y-6">
                      {/* Map */}
                      {gpsData.lat && gpsData.lng && (
                        <div className="bg-gray-100 rounded-xl overflow-hidden" style={{ height: '300px' }}>
                          <iframe
                            width="100%"
                            height="100%"
                            frameBorder="0"
                            style={{ border: 0 }}
                            src={`https://www.google.com/maps?q=${gpsData.lat},${gpsData.lng}&output=embed&zoom=15`}
                            allowFullScreen
                          />
                        </div>
                      )}

                      {/* GPS Details */}
                      <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-6 border border-green-200">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                          <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                          </svg>
                          GPS Information
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="bg-white rounded-lg p-4 border border-green-100">
                            <p className="text-xs font-medium text-gray-500 mb-1">Latitude</p>
                            <p className="text-lg font-bold text-gray-900">{gpsData.lat?.toFixed(7) || 'N/A'}</p>
                          </div>
                          <div className="bg-white rounded-lg p-4 border border-green-100">
                            <p className="text-xs font-medium text-gray-500 mb-1">Longitude</p>
                            <p className="text-lg font-bold text-gray-900">{gpsData.lng?.toFixed(7) || 'N/A'}</p>
                          </div>
                          <div className="bg-white rounded-lg p-4 border border-green-100">
                            <p className="text-xs font-medium text-gray-500 mb-1">Altitude</p>
                            <p className="text-lg font-bold text-gray-900">{gpsData.alt ? `${gpsData.alt.toFixed(1)} m` : 'N/A'}</p>
                          </div>
                          <div className="bg-white rounded-lg p-4 border border-green-100">
                            <p className="text-xs font-medium text-gray-500 mb-1">HDOP</p>
                            <p className="text-lg font-bold text-gray-900">{gpsData.hdop?.toFixed(2) || 'N/A'}</p>
                            <p className="text-xs text-gray-500 mt-1">Horizontal Dilution of Precision</p>
                          </div>
                          <div className="bg-white rounded-lg p-4 border border-green-100">
                            <p className="text-xs font-medium text-gray-500 mb-1">Satellites</p>
                            <p className="text-lg font-bold text-gray-900">{gpsData.sats || 'N/A'}</p>
                            <p className="text-xs text-gray-500 mt-1">Satellites in view</p>
                          </div>
                          <div className="bg-white rounded-lg p-4 border border-green-100">
                            <p className="text-xs font-medium text-gray-500 mb-1">Timestamp</p>
                            <p className="text-lg font-bold text-gray-900">{formatTimestamp(gpsData.ts)}</p>
                          </div>
                        </div>

                        {/* Google Maps Link */}
                        {gpsData.lat && gpsData.lng && (
                          <div className="mt-4">
                            <a
                              href={`https://www.google.com/maps?q=${gpsData.lat},${gpsData.lng}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                              </svg>
                              Open in Google Maps
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12">
                      <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mb-4">
                        <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                      </div>
                      <p className="text-lg font-medium text-gray-900 mb-2">No GPS data available</p>
                      <p className="text-sm text-gray-600 text-center max-w-sm">
                        GPS coordinates have not been received from this device yet. The device may need to initialize its GPS module.
                      </p>
                    </div>
                  )}
                </div>
                
                {/* Close Button */}
                <div className="px-6 py-4 border-t border-gray-200">
                  <button
                    onClick={() => setShowLocationModal(false)}
                    className="w-full px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Sidebar Menu */}
        <Sheet open={isMenuOpen} onOpenChange={setIsMenuOpen}>
          <SheetContent side="right" className="w-80 sm:w-96 bg-gradient-to-br from-green-50 via-white to-emerald-50 border-l border-green-200/50 p-0 flex flex-col">
            <SheetHeader className="px-6 pt-6 pb-4 border-b border-green-200/50">
              <SheetTitle className="text-2xl font-bold text-gray-900" style={{ fontFamily: "'Courier New', Courier, monospace" }}>
                PadBuddy
              </SheetTitle>
            </SheetHeader>

            <div className="flex-1 flex flex-col min-h-0 px-6 py-4">
              {/* User Profile */}
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-green-200/50">
                {user?.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || user.email || "User"}
                    className="w-12 h-12 rounded-full object-cover ring-2 ring-primary/20 shadow-md"
                  />
                ) : (
                  <div className="w-12 h-12 bg-gradient-to-br from-primary to-primary/80 rounded-full flex items-center justify-center ring-2 ring-primary/20 shadow-md">
                    <span className="text-primary-foreground font-semibold text-lg">
                      {user?.displayName?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate text-gray-800">
                    {user?.displayName || user?.email?.split('@')[0] || 'User'}
                  </p>
                  <p className="text-xs text-gray-600">Rice Farmer</p>
                </div>
              </div>

              {/* Menu Items */}
              <nav className="flex-1 py-4 space-y-2 overflow-y-auto min-h-0">
                <Button
                  variant={pathname === '/' ? "default" : "ghost"}
                  className={`w-full justify-start transition-all duration-200 relative ${
                    pathname === '/' 
                      ? 'bg-gradient-to-r from-green-600 to-emerald-600 text-white shadow-md hover:from-green-700 hover:to-emerald-700' 
                      : 'hover:bg-white/60 hover:text-gray-900 text-gray-700'
                  }`}
                  onClick={() => {
                    router.push('/');
                    setIsMenuOpen(false);
                  }}
                >
                  <div className={`absolute left-0 top-1/2 -translate-y-1/2 h-8 w-1 rounded-r-full transition-all duration-200 ${
                    pathname === '/' ? 'bg-white' : 'bg-transparent'
                  }`} />
                  <HomeIcon className={`mr-3 h-5 w-5 transition-transform duration-200 ${
                    pathname === '/' ? 'scale-110' : 'group-hover:scale-110'
                  }`} />
                  <span className="font-medium">My Fields</span>
                </Button>
                <Button
                  variant={pathname === '/varieties' ? "default" : "ghost"}
                  className={`w-full justify-start transition-all duration-200 relative ${
                    pathname === '/varieties' 
                      ? 'bg-gradient-to-r from-green-600 to-emerald-600 text-white shadow-md hover:from-green-700 hover:to-emerald-700' 
                      : 'hover:bg-white/60 hover:text-gray-900 text-gray-700'
                  }`}
                  onClick={() => {
                    router.push('/varieties');
                    setIsMenuOpen(false);
                  }}
                >
                  <div className={`absolute left-0 top-1/2 -translate-y-1/2 h-8 w-1 rounded-r-full transition-all duration-200 ${
                    pathname === '/varieties' ? 'bg-white' : 'bg-transparent'
                  }`} />
                  <BookOpen className={`mr-3 h-5 w-5 transition-transform duration-200 ${
                    pathname === '/varieties' ? 'scale-110' : 'group-hover:scale-110'
                  }`} />
                  <span className="font-medium">Rice Varieties</span>
                </Button>
                {visibility.helpPageVisible && (
                  <Button
                    variant={pathname === '/help' ? "default" : "ghost"}
                    className={`w-full justify-start transition-all duration-200 relative ${
                      pathname === '/help' 
                        ? 'bg-gradient-to-r from-green-600 to-emerald-600 text-white shadow-md hover:from-green-700 hover:to-emerald-700' 
                        : 'hover:bg-white/60 hover:text-gray-900 text-gray-700'
                    }`}
                    onClick={() => {
                      router.push('/help');
                      setIsMenuOpen(false);
                    }}
                  >
                    <div className={`absolute left-0 top-1/2 -translate-y-1/2 h-8 w-1 rounded-r-full transition-all duration-200 ${
                      pathname === '/help' ? 'bg-white' : 'bg-transparent'
                    }`} />
                    <HelpCircle className={`mr-3 h-5 w-5 transition-transform duration-200 ${
                      pathname === '/help' ? 'scale-110' : 'group-hover:scale-110'
                    }`} />
                    <span className="font-medium">Help & Support</span>
                  </Button>
                )}
                {visibility.aboutPageVisible && (
                  <Button
                    variant={pathname === '/about' ? "default" : "ghost"}
                    className={`w-full justify-start transition-all duration-200 relative ${
                      pathname === '/about' 
                        ? 'bg-gradient-to-r from-green-600 to-emerald-600 text-white shadow-md hover:from-green-700 hover:to-emerald-700' 
                        : 'hover:bg-white/60 hover:text-gray-900 text-gray-700'
                    }`}
                    onClick={() => {
                      router.push('/about');
                      setIsMenuOpen(false);
                    }}
                  >
                    <div className={`absolute left-0 top-1/2 -translate-y-1/2 h-8 w-1 rounded-r-full transition-all duration-200 ${
                      pathname === '/about' ? 'bg-white' : 'bg-transparent'
                    }`} />
                    <Info className={`mr-3 h-5 w-5 transition-transform duration-200 ${
                      pathname === '/about' ? 'scale-110' : 'group-hover:scale-110'
                    }`} />
                    <span className="font-medium">About PadBuddy</span>
                  </Button>
                )}

                {/* Admin Panel - Only visible to admin */}
                {user?.email === ADMIN_EMAIL && (
                  <>
                    <div className="border-t border-gray-200 my-3"></div>
                    <Button
                      variant="ghost"
                      className="w-full justify-start transition-all duration-200 relative bg-purple-50 hover:bg-purple-100 text-purple-700"
                      onClick={() => {
                        router.push('/admin');
                        setIsMenuOpen(false);
                      }}
                    >
                      <Shield className="mr-3 h-5 w-5" />
                      <span className="font-medium">Admin Panel</span>
                    </Button>
                  </>
                )}
              </nav>

              {/* Sign Out */}
              <div className="pt-4 border-t border-green-200/50 flex-shrink-0">
                <Button
                  type="button"
                  variant="destructive"
                  className="w-full bg-gradient-to-b from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-medium py-3 rounded-lg transition-all duration-200 shadow-md hover:shadow-lg active:scale-[0.98]"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsLogoutModalOpen(true);
                  }}
                >
                  <LogOut className="mr-2 h-5 w-5" />
                  Sign Out
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>

        {/* Logout Confirmation Modal */}
        <Dialog open={isLogoutModalOpen} onOpenChange={setIsLogoutModalOpen}>
          <DialogContent className="sm:max-w-md rounded-2xl border-0 shadow-2xl bg-white animate-fade-in">
            <DialogHeader className="text-center pb-4">
              <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-gradient-to-br from-red-100 to-red-200 flex items-center justify-center shadow-md">
                <LogOut className="h-8 w-8 text-red-600" />
              </div>
              <DialogTitle className="text-2xl font-bold text-gray-900">
                Sign Out?
              </DialogTitle>
              <DialogDescription className="text-base text-gray-600 pt-2 px-2">
                Are you sure you want to sign out? You'll need to sign in again to access your fields.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-row gap-3 pt-4 pb-2">
              <Button
                variant="ghost"
                onClick={() => setIsLogoutModalOpen(false)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 font-medium py-3 rounded-xl transition-all active:scale-[0.98] border-0"
                disabled={isLoggingOut}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={async () => {
                  setIsLoggingOut(true);
                  try {
                    setIsMenuOpen(false);
                    setIsLogoutModalOpen(false);
                    await signOut();
                    router.push('/auth');
                  } catch (error) {
                    console.error('Sign out error:', error);
                    setIsLoggingOut(false);
                    setIsLogoutModalOpen(false);
                    alert('Failed to sign out. Please try again.');
                  }
                }}
                disabled={isLoggingOut}
                className="flex-1 bg-gradient-to-b from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-medium py-3 rounded-xl transition-all shadow-md hover:shadow-lg disabled:opacity-50 active:scale-[0.98]"
              >
                {isLoggingOut ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Signing out...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <LogOut className="h-4 w-4" />
                    Sign Out
                  </span>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </ProtectedRoute>
  );
}

// Device Statistics Component
function DeviceStatistics({ 
  userId, 
  fieldId, 
  paddyId, 
  deviceId,
  currentNPK 
}: { 
  userId: string; 
  fieldId: string; 
  paddyId: string;
  deviceId: string;
  currentNPK?: { n?: number; p?: number; k?: number; timestamp?: number };
}) {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const { getDeviceNPKStatistics } = await import('@/lib/utils/statistics');
        const statistics = await getDeviceNPKStatistics(userId, fieldId, paddyId, deviceId, 30);
        setStats(statistics);
      } catch (error) {
        console.error('Error fetching statistics:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [userId, fieldId, paddyId, deviceId]);

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">NPK Statistics (30 Days)</h3>
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
        </div>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">NPK Statistics (30 Days)</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Nitrogen Stats */}
        <div className="bg-blue-50 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-blue-900">Nitrogen (N)</h4>
            <span className="text-2xl">🧪</span>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-blue-700">Current:</span>
              <span className="font-bold text-blue-900">
                {stats.nitrogen.current !== null ? Math.round(stats.nitrogen.current) : '--'} mg/kg
              </span>
            </div>
            {stats.nitrogen.average !== null && (
              <>
                <div className="flex justify-between">
                  <span className="text-sm text-blue-700">Average:</span>
                  <span className="font-medium text-blue-800">{Math.round(stats.nitrogen.average)} mg/kg</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-blue-700">Range:</span>
                  <span className="text-xs text-blue-600">
                    {Math.round(stats.nitrogen.min!)} - {Math.round(stats.nitrogen.max!)} mg/kg
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs text-blue-600">Trend:</span>
                  <span className={`text-xs px-2 py-1 rounded ${
                    stats.nitrogen.trend === 'up' ? 'bg-green-200 text-green-800' :
                    stats.nitrogen.trend === 'down' ? 'bg-red-200 text-red-800' :
                    'bg-gray-200 text-gray-800'
                  }`}>
                    {stats.nitrogen.trend === 'up' ? '↑ Increasing' :
                     stats.nitrogen.trend === 'down' ? '↓ Decreasing' :
                     '→ Stable'}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Phosphorus Stats */}
        <div className="bg-purple-50 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-purple-900">Phosphorus (P)</h4>
            <span className="text-2xl">⚗️</span>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-purple-700">Current:</span>
              <span className="font-bold text-purple-900">
                {stats.phosphorus.current !== null ? Math.round(stats.phosphorus.current) : '--'} mg/kg
              </span>
            </div>
            {stats.phosphorus.average !== null && (
              <>
                <div className="flex justify-between">
                  <span className="text-sm text-purple-700">Average:</span>
                  <span className="font-medium text-purple-800">{Math.round(stats.phosphorus.average)} mg/kg</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-purple-700">Range:</span>
                  <span className="text-xs text-purple-600">
                    {Math.round(stats.phosphorus.min!)} - {Math.round(stats.phosphorus.max!)} mg/kg
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs text-purple-600">Trend:</span>
                  <span className={`text-xs px-2 py-1 rounded ${
                    stats.phosphorus.trend === 'up' ? 'bg-green-200 text-green-800' :
                    stats.phosphorus.trend === 'down' ? 'bg-red-200 text-red-800' :
                    'bg-gray-200 text-gray-800'
                  }`}>
                    {stats.phosphorus.trend === 'up' ? '↑ Increasing' :
                     stats.phosphorus.trend === 'down' ? '↓ Decreasing' :
                     '→ Stable'}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Potassium Stats */}
        <div className="bg-orange-50 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-orange-900">Potassium (K)</h4>
            <span className="text-2xl">🔬</span>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-orange-700">Current:</span>
              <span className="font-bold text-orange-900">
                {stats.potassium.current !== null ? Math.round(stats.potassium.current) : '--'} mg/kg
              </span>
            </div>
            {stats.potassium.average !== null && (
              <>
                <div className="flex justify-between">
                  <span className="text-sm text-orange-700">Average:</span>
                  <span className="font-medium text-orange-800">{Math.round(stats.potassium.average)} mg/kg</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-orange-700">Range:</span>
                  <span className="text-xs text-orange-600">
                    {Math.round(stats.potassium.min!)} - {Math.round(stats.potassium.max!)} mg/kg
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs text-orange-600">Trend:</span>
                  <span className={`text-xs px-2 py-1 rounded ${
                    stats.potassium.trend === 'up' ? 'bg-green-200 text-green-800' :
                    stats.potassium.trend === 'down' ? 'bg-red-200 text-red-800' :
                    'bg-gray-200 text-gray-800'
                  }`}>
                    {stats.potassium.trend === 'up' ? '↑ Increasing' :
                     stats.potassium.trend === 'down' ? '↓ Decreasing' :
                     '→ Stable'}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Trends Chart Component
function TrendsChart({ logs }: { logs: Array<{ timestamp: Date; nitrogen?: number; phosphorus?: number; potassium?: number }> }) {
  const { useMemo } = require('react');
  
  const data = useMemo(() => {
    // Ensure chronological order (oldest → newest)
    const ordered = [...logs].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    const labels = ordered.map((l) => l.timestamp.toLocaleString(undefined, { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }));

    return {
    labels,
    datasets: [
      {
        label: 'Nitrogen (mg/kg)',
        data: ordered.map((l) => l.nitrogen ?? null),
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37, 99, 235, 0.2)',
        tension: 0.3,
        spanGaps: true,
      },
      {
        label: 'Phosphorus (mg/kg)',
        data: ordered.map((l) => l.phosphorus ?? null),
        borderColor: '#7c3aed',
        backgroundColor: 'rgba(124, 58, 237, 0.2)',
        tension: 0.3,
        spanGaps: true,
      },
      {
        label: 'Potassium (mg/kg)',
        data: ordered.map((l) => l.potassium ?? null),
        borderColor: '#f59e0b',
        backgroundColor: 'rgba(245, 158, 11, 0.2)',
        tension: 0.3,
        spanGaps: true,
      },
    ],
    };
  }, [logs]);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 750,
    },
    plugins: {
      legend: { position: 'top' as const },
      tooltip: { mode: 'index' as const, intersect: false },
    },
    scales: {
      y: { beginAtZero: true, title: { display: true, text: 'mg/kg' } },
      x: {
        ticks: {
          maxRotation: 45,
          minRotation: 45
        }
      }
    },
  };

  return (
    <div style={{ height: 320 }}>
      <Line data={data} options={options} />
    </div>
  );
}
