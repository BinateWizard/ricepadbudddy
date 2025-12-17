'use client';

import ProtectedRoute from "@/components/ProtectedRoute";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, getDocs, updateDoc, query, where } from 'firebase/firestore';

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
  
  // Get device status based on heartbeat and sensor readings
  const getDeviceStatus = () => {
    // TODO: Check actual heartbeat from Firebase RTDB
    const hasHeartbeat = false; // Placeholder - implement real RTDB check
    const readings = deviceReadings.filter(r => r.deviceId === deviceId);
    
    if (!hasHeartbeat && readings.length === 0) {
      return {
        status: 'offline',
        message: 'Device is offline. Check power and network connection.',
        color: 'red',
        badge: 'Offline',
        lastUpdate: 'No connection'
      };
    }
    
    if (hasHeartbeat && readings.length === 0) {
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
  
  const deviceStatus = getDeviceStatus();
  
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

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <nav className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center gap-2 text-sm">
                {/* Breadcrumb Navigation */}
                <button
                  onClick={() => router.push('/')}
                  className="flex items-center text-gray-600 hover:text-gray-900 transition-colors"
                  title="Home"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                  </svg>
                </button>
                {fieldInfo && (
                  <>
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    <button
                      onClick={() => router.push(`/field/${fieldInfo.id}`)}
                      className="text-gray-600 hover:text-gray-900 transition-colors"
                    >
                      {fieldInfo.fieldName}
                    </button>
                  </>
                )}
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <span className="font-medium text-gray-900">{paddyInfo?.paddyName || 'Device'}</span>
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
          <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Device Status</h2>
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
          <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Current Readings</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="p-4 bg-blue-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-700">Nitrogen (N)</p>
                  <span className="text-lg">🧪</span>
                </div>
                <p className="text-xl font-bold text-gray-900">--</p>
                <p className="text-xs text-gray-500 mt-1">mg/kg</p>
              </div>
              <div className="p-4 bg-green-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-700">Phosphorus (P)</p>
                  <span className="text-lg">⚗️</span>
                </div>
                <p className="text-xl font-bold text-gray-900">--</p>
                <p className="text-xs text-gray-500 mt-1">mg/kg</p>
              </div>
              <div className="p-4 bg-purple-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-700">Potassium (K)</p>
                  <span className="text-lg">🔬</span>
                </div>
                <p className="text-xl font-bold text-gray-900">--</p>
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
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Device Information</h3>
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
          <div className="bg-white rounded-2xl shadow-lg p-6 border-2 border-red-200">
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
      </div>
    </ProtectedRoute>
  );
}
