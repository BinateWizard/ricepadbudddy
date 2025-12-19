'use client';

import ProtectedRoute from "@/components/ProtectedRoute";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { db, database } from '@/lib/firebase';
import { doc, getDoc, collection, getDocs, updateDoc, query, where } from 'firebase/firestore';
import { ref, get } from 'firebase/database';

export default function DeviceDetail() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const deviceId = params.id as string;
  
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | 'all'>('7d');
  const [historicalLogs, setHistoricalLogs] = useState<any[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [deviceInfo, setDeviceInfo] = useState<any>(null);
  const [paddyInfo, setPaddyInfo] = useState<any>(null);
  const [fieldInfo, setFieldInfo] = useState<any>(null);
  const [deviceReadings, setDeviceReadings] = useState<any[]>([]);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [gpsData, setGpsData] = useState<any>(null);
  const [loadingGps, setLoadingGps] = useState(false);
  
  // Fetch device data from RTDB and auto-log
  useEffect(() => {
    const fetchDeviceData = async () => {
      if (!user || !paddyInfo || !fieldInfo) return;
      
      try {
        const { getDeviceData, getDeviceStatus } = await import('@/lib/utils/deviceStatus');
        const { autoLogReadings } = await import('@/lib/utils/sensorLogging');
        const deviceData = await getDeviceData(deviceId);
        const status = await getDeviceStatus(deviceId);
        
        if (deviceData) {
          setDeviceInfo(deviceData);
          setDeviceReadings([{ deviceId, ...deviceData }]);
          
          // Auto-log NPK readings if available
          if (deviceData.npk && (deviceData.npk.n !== undefined || deviceData.npk.p !== undefined || deviceData.npk.k !== undefined)) {
            await autoLogReadings(user.uid, fieldInfo.id, paddyInfo.id, deviceData.npk);
          }
        }
      } catch (error) {
        console.error('Error fetching device data:', error);
      }
    };
    
    fetchDeviceData();
    
    // Refresh every 30 seconds
    const interval = setInterval(fetchDeviceData, 30000);
    return () => clearInterval(interval);
  }, [deviceId, user, paddyInfo, fieldInfo]);
  
  // Get device status
  const getDeviceStatusDisplay = () => {
    if (!deviceInfo) {
      return {
        status: 'offline',
        message: 'Device not found or offline.',
        color: 'red',
        badge: 'Offline',
        lastUpdate: 'No connection'
      };
    }
    
    const deviceStatus = deviceInfo.status || 'disconnected';
    const hasNPK = deviceInfo.npk && (
      deviceInfo.npk.n !== undefined || 
      deviceInfo.npk.p !== undefined || 
      deviceInfo.npk.k !== undefined
    );
    
    if (deviceStatus !== 'connected') {
      return {
        status: 'offline',
        message: 'Device is offline. Check power and network connection.',
        color: 'red',
        badge: 'Offline',
        lastUpdate: deviceInfo.connectedAt ? new Date(deviceInfo.connectedAt).toLocaleString() : 'No connection'
      };
    }
    
    if (deviceStatus === 'connected' && !hasNPK) {
      return {
        status: 'sensor-issue',
        message: 'Device connected but sensor readings unavailable. Check sensor connections.',
        color: 'yellow',
        badge: 'Sensor Issue',
        lastUpdate: deviceInfo.connectedAt ? new Date(deviceInfo.connectedAt).toLocaleString() : 'Just now'
      };
    }
    
    return {
      status: 'ok',
      message: 'All systems operational',
      color: 'green',
      badge: 'Connected',
      lastUpdate: deviceInfo.connectedAt ? new Date(deviceInfo.connectedAt).toLocaleString() : 'Just now'
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
  
  // Fetch historical logs
  useEffect(() => {
    if (!user || !paddyInfo || !fieldInfo) return;
    
    const fetchLogs = async () => {
      setIsLoadingLogs(true);
      try {
        const now = new Date();
        let startDate = new Date();
        
        switch(timeRange) {
          case '7d':
            startDate.setDate(now.getDate() - 7);
            break;
          case '30d':
            startDate.setDate(now.getDate() - 30);
            break;
          case '90d':
            startDate.setDate(now.getDate() - 90);
            break;
          case 'all':
            startDate = new Date(0);
            break;
        }
        
        const logsRef = collection(db, `users/${user.uid}/fields/${fieldInfo.id}/paddies/${paddyInfo.id}/logs`);
        const q = timeRange === 'all' ? logsRef : query(logsRef, where('timestamp', '>=', startDate));
        
        const snapshot = await getDocs(q);
        const logs: any[] = [];
        snapshot.forEach(doc => {
          const data = doc.data();
          const logDate = data.timestamp?.toDate?.() || new Date(data.timestamp);
          if (logDate >= startDate) {
            logs.push({ ...data, id: doc.id, timestamp: logDate });
          }
        });
        
        logs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
        setHistoricalLogs(logs);
      } catch (error) {
        console.error('Error fetching logs:', error);
      } finally {
        setIsLoadingLogs(false);
      }
    };
    
    fetchLogs();
  }, [user, paddyInfo, fieldInfo, timeRange]);
  
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
      const gpsRef = ref(database, `devices/${deviceId}/gps`);
      const snapshot = await get(gpsRef);
      
      if (snapshot.exists()) {
        const gps = snapshot.val();
        setGpsData(gps);
      }
    } catch (error) {
      console.error('Error fetching GPS data:', error);
    } finally {
      setLoadingGps(false);
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
        <nav className="bg-gradient-to-r from-green-500 via-emerald-500 to-teal-500 shadow-lg">
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
              <div className="flex items-center gap-3">
                {/* Notification Bell */}
                <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                  <svg 
                    xmlns="http://www.w3.org/2000/svg" 
                    className="h-6 w-6 text-gray-600" 
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke="currentColor"
                  >
                    <path 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                      strokeWidth={2} 
                      d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" 
                    />
                  </svg>
                </button>
                
                {/* Hamburger Menu */}
                <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                  <svg 
                    xmlns="http://www.w3.org/2000/svg" 
                    className="h-6 w-6 text-gray-600" 
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke="currentColor"
                  >
                    <path 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                      strokeWidth={2} 
                      d="M4 6h16M4 12h16M4 18h16" 
                    />
                  </svg>
                </button>
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
                  {deviceInfo?.npk?.n !== undefined ? Math.round(deviceInfo.npk.n) : '--'}
                </p>
                <p className="text-xs text-gray-500 mt-1">mg/kg</p>
              </div>
              <div className="p-4 bg-green-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-700">Phosphorus (P)</p>
                  <span className="text-lg">⚗️</span>
                </div>
                <p className="text-xl font-bold text-gray-900">
                  {deviceInfo?.npk?.p !== undefined ? Math.round(deviceInfo.npk.p) : '--'}
                </p>
                <p className="text-xs text-gray-500 mt-1">mg/kg</p>
              </div>
              <div className="p-4 bg-purple-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-700">Potassium (K)</p>
                  <span className="text-lg">🔬</span>
                </div>
                <p className="text-xl font-bold text-gray-900">
                  {deviceInfo?.npk?.k !== undefined ? Math.round(deviceInfo.npk.k) : '--'}
                </p>
                <p className="text-xs text-gray-500 mt-1">mg/kg</p>
              </div>
              <div className="p-4 bg-orange-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-700">Temperature</p>
                  <span className="text-lg">🌡️</span>
                </div>
                <p className="text-xl font-bold text-gray-900">--</p>
                <p className="text-xs text-gray-500 mt-1">°C</p>
              </div>
              <div className="p-4 bg-cyan-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-700">Humidity</p>
                  <span className="text-lg">💧</span>
                </div>
                <p className="text-xl font-bold text-gray-900">--</p>
                <p className="text-xs text-gray-500 mt-1">%</p>
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
              currentNPK={deviceInfo?.npk}
            />
          )}

          {/* Data Trends */}
          <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Data Trends</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => setTimeRange('7d')}
                  className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                    timeRange === '7d' 
                      ? 'bg-green-600 text-white' 
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  7 Days
                </button>
                <button
                  onClick={() => setTimeRange('30d')}
                  className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                    timeRange === '30d' 
                      ? 'bg-green-600 text-white' 
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  30 Days
                </button>
                <button
                  onClick={() => setTimeRange('90d')}
                  className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                    timeRange === '90d' 
                      ? 'bg-green-600 text-white' 
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  90 Days
                </button>
                <button
                  onClick={() => setTimeRange('all')}
                  className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                    timeRange === 'all' 
                      ? 'bg-green-600 text-white' 
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  All Time
                </button>
              </div>
            </div>
            <div className="text-center py-8">
              {isLoadingLogs ? (
                <div className="flex flex-col items-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mb-3"></div>
                  <p className="text-gray-500">Loading historical data...</p>
                </div>
              ) : historicalLogs.length > 0 ? (
                <div>
                  <div className="text-5xl mb-3">📊</div>
                  <p className="text-gray-500">Found {historicalLogs.length} readings</p>
                  <p className="text-sm text-gray-400 mt-1">Data over the last {
                    timeRange === '7d' ? '7 days' :
                    timeRange === '30d' ? '30 days' :
                    timeRange === '90d' ? '90 days' :
                    'recording period'
                  }</p>
                  <p className="text-xs text-gray-400 mt-2">Chart visualization coming soon</p>
                </div>
              ) : (
                <div>
                  <div className="text-5xl mb-3">📊</div>
                  <p className="text-gray-500">No historical data found</p>
                  <p className="text-sm text-gray-400 mt-1">Sensor readings will be logged automatically</p>
                </div>
              )}
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
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-600">Paddy Name</span>
                    <span className="font-medium text-gray-900">{paddyInfo.paddyName}</span>
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
