'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { DeviceLoadingModal } from '@/components/DeviceLoadingModal';

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
  const hasNPK = deviceReading.npk && (
    deviceReading.npk.n !== undefined || 
    deviceReading.npk.p !== undefined || 
    deviceReading.npk.k !== undefined
  );
  
  let hasRecentNPK = false;
  if (deviceReading.npk?.timestamp) {
    const npkTimestamp = deviceReading.npk.timestamp;
    const npkTime = npkTimestamp < 10000000000 ? npkTimestamp * 1000 : npkTimestamp;
    const timeSinceNPK = Date.now() - npkTime;
    hasRecentNPK = timeSinceNPK < 10 * 60 * 1000;
  }
  
  const isOnline = deviceStatus === 'connected' || 
                   deviceStatus === 'alive' || 
                   hasRecentNPK;
  
  if (!isOnline) {
    return {
      status: 'offline',
      message: 'Device is offline. Check power supply and network connection.',
      color: 'red',
      badge: 'Offline'
    };
  }
  
  if (isOnline && !hasNPK) {
    return {
      status: 'sensor-issue',
      message: 'Device is online but sensors are not reporting data. Check sensor connections.',
      color: 'yellow',
      badge: 'Sensor Issue'
    };
  }
  
  return {
    status: 'ok',
    message: 'Device and sensors are working properly.',
    color: 'green',
    badge: 'Connected'
  };
}

interface PaddiesTabProps {
  paddies: any[];
  deviceReadings?: any[];
  fieldId: string;
  onAddDevice: () => void;
  onViewLocation: (paddy: any, e: React.MouseEvent) => void;
}

export function PaddiesTab({ paddies, deviceReadings, fieldId, onAddDevice, onViewLocation }: PaddiesTabProps) {
  const router = useRouter();
  const [scanningDevices, setScanningDevices] = useState<Set<string>>(new Set());
  const [scanResults, setScanResults] = useState<{[deviceId: string]: {status: string; message: string; timestamp: number}}>({});
  const [isLoadingDevice, setIsLoadingDevice] = useState(false);
  const [loadingDeviceId, setLoadingDeviceId] = useState<string | null>(null);
  const [navigationTimeout, setNavigationTimeout] = useState<NodeJS.Timeout | null>(null);

  const handleDeviceClick = (deviceId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setLoadingDeviceId(deviceId);
    setIsLoadingDevice(true);
    
    // Delay navigation to show the modal, but allow cancellation
    const timeout = setTimeout(() => {
      router.push(`/device/${deviceId}`);
    }, 100);
    setNavigationTimeout(timeout);
  };

  const handleCancelLoading = () => {
    // Cancel the pending navigation
    if (navigationTimeout) {
      clearTimeout(navigationTimeout);
      setNavigationTimeout(null);
    }
    setIsLoadingDevice(false);
    setLoadingDeviceId(null);
  };

  const handleLoadingError = (error: string) => {
    console.error('Device loading error:', error);
    // Error state is shown in the modal, user can close it
  };

  const handleScanDevice = async (e: React.MouseEvent, paddy: any) => {
    e.stopPropagation();

    if (scanningDevices.has(paddy.deviceId)) return;

    setScanningDevices(prev => new Set([...prev, paddy.deviceId]));

    try {
      const { sendDeviceCommand } = await import('@/lib/utils/deviceCommands');
      const { useAuth } = await import('@/context/AuthContext');
      
      // Get user from auth context - need to call hook properly
      // For now, use empty string as fallback
      await sendDeviceCommand(paddy.deviceId, 'ESP32C', 'npk', 'scan', {}, '');
      
      setScanResults(prev => ({
        ...prev,
        [paddy.deviceId]: {
          status: 'success',
          message: `✓ Scan complete - ${new Date().toLocaleTimeString()}`,
          timestamp: Date.now()
        }
      }));

      setTimeout(() => {
        setScanResults(prev => {
          const newResults = {...prev};
          delete newResults[paddy.deviceId];
          return newResults;
        });
      }, 5000);
    } catch (error: any) {
      console.error('Scan error:', error);
      setScanResults(prev => ({
        ...prev,
        [paddy.deviceId]: {
          status: 'error',
          message: `✗ Scan failed: ${error?.message || 'Timeout'}`,
          timestamp: Date.now()
        }
      }));

      setTimeout(() => {
        setScanResults(prev => {
          const newResults = {...prev};
          delete newResults[paddy.deviceId];
          return newResults;
        });
      }, 5000);
    } finally {
      setScanningDevices(prev => {
        const newSet = new Set(prev);
        newSet.delete(paddy.deviceId);
        return newSet;
      });
    }
  };

  return (
    <div className="space-y-4 -mx-1 sm:mx-0">
      {/* Loading Modal */}
      {loadingDeviceId && (
        <DeviceLoadingModal
          isOpen={isLoadingDevice}
          deviceId={loadingDeviceId}
          onCancel={handleCancelLoading}
          onError={handleLoadingError}
        />
      )}
      
      <div className="flex items-center justify-between px-1 sm:px-0 mt-1">
        <h2 className="text-2xl font-bold text-gray-900">Connected Paddies</h2>
      </div>
      {paddies.length === 0 ? (
        <div className="bg-white rounded-xl shadow-md p-8 sm:p-12 text-center">
          <p className="text-gray-500">No paddies connected yet</p>
        </div>
      ) : (
        <div className="space-y-4">
          {paddies.map((paddy) => {
            const deviceStatus = getDeviceStatus(paddy, deviceReadings || []);
            const deviceReading = deviceReadings?.find(r => r.deviceId === paddy.deviceId);
            const npk = deviceReading?.npk;
            const temperature = deviceReading?.sensors?.temperature ?? deviceReading?.temperature;
            const humidity = deviceReading?.sensors?.humidity ?? deviceReading?.humidity;
            const hasNPK = npk && (npk.n !== undefined || npk.p !== undefined || npk.k !== undefined);
            const hasTempHumidity = temperature !== undefined || humidity !== undefined;
            
            return (
              <div 
                key={paddy.id} 
                onClick={(e) => handleDeviceClick(paddy.deviceId, e)}
                className="bg-white rounded-xl shadow-md border border-gray-200 p-4 sm:p-6 hover:border-green-500 hover:shadow-lg transition-all cursor-pointer">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900">{paddy.paddyName}</h3>
                    <p className="text-sm text-gray-600">Device: {paddy.deviceId}</p>
                    {paddy.description && (
                      <p className="text-sm text-gray-500 mt-2">{paddy.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={(e) => onViewLocation(paddy, e)}
                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                      title="View location on map"
                    >
                      <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </button>
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                      deviceStatus.color === 'green' ? 'bg-green-100 text-green-800' :
                      deviceStatus.color === 'yellow' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {deviceStatus.badge}
                    </span>
                  </div>
                </div>
                
                {(hasNPK || hasTempHumidity) && (
                  <div className={`grid gap-3 ${
                    hasTempHumidity 
                      ? 'grid-cols-3 sm:grid-cols-5' 
                      : 'grid-cols-3'
                  }`}>
                    {npk?.n !== undefined && (
                      <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                        <p className="text-xs text-blue-600 font-semibold mb-1">Nitrogen</p>
                        <p className="text-lg font-bold text-blue-900">{Math.round(npk.n)}</p>
                        <p className="text-xs text-blue-500 mt-0.5">mg/kg</p>
                      </div>
                    )}
                    {npk?.p !== undefined && (
                      <div className="bg-purple-50 rounded-lg p-3 border border-purple-100">
                        <p className="text-xs text-purple-600 font-semibold mb-1">Phosphorus</p>
                        <p className="text-lg font-bold text-purple-900">{Math.round(npk.p)}</p>
                        <p className="text-xs text-purple-500 mt-0.5">mg/kg</p>
                      </div>
                    )}
                    {npk?.k !== undefined && (
                      <div className="bg-orange-50 rounded-lg p-3 border border-orange-100">
                        <p className="text-xs text-orange-600 font-semibold mb-1">Potassium</p>
                        <p className="text-lg font-bold text-orange-900">{Math.round(npk.k)}</p>
                        <p className="text-xs text-orange-500 mt-0.5">mg/kg</p>
                      </div>
                    )}
                    {temperature !== undefined && (
                      <div className="bg-red-50 rounded-lg p-3 border border-red-100">
                        <p className="text-xs text-red-600 font-semibold mb-1 flex items-center gap-1">
                          <span>🌡️</span> Temperature
                        </p>
                        <p className="text-lg font-bold text-red-900">{Math.round(temperature)}</p>
                        <p className="text-xs text-red-500 mt-0.5">°C</p>
                      </div>
                    )}
                    {humidity !== undefined && (
                      <div className="bg-cyan-50 rounded-lg p-3 border border-cyan-100">
                        <p className="text-xs text-cyan-600 font-semibold mb-1 flex items-center gap-1">
                          <span>💧</span> Humidity
                        </p>
                        <p className="text-lg font-bold text-cyan-900">{Math.round(humidity)}</p>
                        <p className="text-xs text-cyan-500 mt-0.5">%</p>
                      </div>
                    )}
                  </div>
                )}
                <div className={`mt-3 p-3 rounded-lg text-sm ${
                  deviceStatus.color === 'green' ? 'bg-green-50 text-green-800' :
                  deviceStatus.color === 'yellow' ? 'bg-yellow-50 text-yellow-800' :
                  'bg-red-50 text-red-800'
                }`}>
                  {deviceStatus.message}
                </div>
                
                {scanResults[paddy.deviceId] && (
                  <div className={`mt-2 p-3 rounded-lg text-sm font-medium animate-fade-in ${
                    scanResults[paddy.deviceId].status === 'success' 
                      ? 'bg-green-100 text-green-700 border border-green-300' 
                      : 'bg-red-100 text-red-700 border border-red-300'
                  }`}>
                    {scanResults[paddy.deviceId].message}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
