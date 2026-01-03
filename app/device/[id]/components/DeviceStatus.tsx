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
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-900 ui-heading-mono">Device Status</h2>
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
            <span className="text-gray-600">GPS Location</span>
            <button
              onClick={onViewLocation}
              className="flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium"
            >
              <MapPin className="w-4 h-4" />
              View on Map
            </button>
          </div>
        )}
        <div className="flex justify-between py-2 border-b border-gray-100">
          <span className="text-gray-600">Last Update</span>
          <span className="font-medium text-gray-900">{deviceStatus.lastUpdate}</span>
        </div>
      </div>
    </div>
  );
}
