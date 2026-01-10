import React from 'react';
import { MapPin } from 'lucide-react';

interface DeviceStatusProps {
  deviceId: string;
  deviceStatus: {
    status: string;
    message: string;
    color: string;
    badge: string;
    lastUpdate: string;
  };
  gpsData: any;
  onViewLocation: () => void;
}

export function DeviceStatus({ 
  deviceId, 
  deviceStatus, 
  gpsData, 
  onViewLocation 
}: DeviceStatusProps) {
  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 mb-6 border-0">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900 ui-heading-mono">Device Status</h2>
      </div>
      
      <div className="space-y-3">
        <div className="flex justify-between py-2 border-b border-gray-100">
          <span className="text-gray-600">Device ID</span>
          <span className="font-medium text-gray-900 font-mono">{deviceId}</span>
        </div>
        
        <div className="flex justify-between py-2 border-b border-gray-100">
          <span className="text-gray-600">Connection</span>
          <div className="flex items-center gap-2">
            <span className={`font-medium ${
              deviceStatus.color === 'green' ? 'text-green-600' :
              deviceStatus.color === 'yellow' ? 'text-yellow-600' :
              deviceStatus.color === 'red' ? 'text-red-600' :
              'text-gray-400'
            }`}>
              {deviceStatus.badge}
            </span>
            <div className={`w-2 h-2 rounded-full ${
              deviceStatus.color === 'green' ? 'bg-green-600 animate-pulse' :
              deviceStatus.color === 'yellow' ? 'bg-yellow-600 animate-pulse' :
              deviceStatus.color === 'red' ? 'bg-red-600' :
              'bg-gray-400'
            }`} />
          </div>
        </div>
        
        {gpsData && gpsData.lat && gpsData.lng && (
          <div className="flex justify-between py-2 border-b border-gray-100">
            <span className="text-gray-600 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-blue-600" />
              GPS Location
            </span>
            <button
              onClick={onViewLocation}
              className="text-blue-600 hover:text-blue-700 font-medium hover:underline"
            >
              View on Map
            </button>
          </div>
        )}
        
        <div className="flex justify-between py-2 border-b border-gray-100">
          <span className="text-gray-600">Last Update</span>
          <span className="font-medium text-gray-900">{deviceStatus.lastUpdate}</span>
        </div>
      </div>
      
      <div className={`mt-4 p-4 rounded-lg border ${
        deviceStatus.color === 'green' ? 'bg-green-50 border-green-200' :
        deviceStatus.color === 'yellow' ? 'bg-yellow-50 border-yellow-200' :
        deviceStatus.color === 'red' ? 'bg-red-50 border-red-200' :
        'bg-gray-50 border-gray-200'
      }`}>
        <p className={`text-sm ${
          deviceStatus.color === 'green' ? 'text-green-800' :
          deviceStatus.color === 'yellow' ? 'text-yellow-800' :
          deviceStatus.color === 'red' ? 'text-red-800' :
          'text-gray-700'
        }`}>
          {deviceStatus.message}
        </p>
      </div>
    </div>
  );
}
