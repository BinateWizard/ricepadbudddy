"use client";
import React, { useState } from 'react';
import { MapPin, Edit2, Check, X } from 'lucide-react';

interface DeviceInformationProps {
  deviceId: string;
  paddyInfo: any;
  fieldInfo: any;
  gpsData: any;
  deviceOnlineStatus: {online: boolean; lastChecked: number} | null;
  onViewLocation: () => void;
  onSavePaddyName: (name: string) => Promise<void>;
}

export function DeviceInformation({
  deviceId,
  paddyInfo,
  fieldInfo,
  gpsData,
  deviceOnlineStatus,
  onViewLocation,
  onSavePaddyName
}: DeviceInformationProps) {
  const [isEditingPaddyName, setIsEditingPaddyName] = useState(false);
  const [paddyNameValue, setPaddyNameValue] = useState('');
  const [isSavingPaddyName, setIsSavingPaddyName] = useState(false);

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
      await onSavePaddyName(trimmedName);
      setIsEditingPaddyName(false);
    } catch (error) {
      console.error('Error updating paddy name:', error);
      alert('Failed to update paddy name');
    } finally {
      setIsSavingPaddyName(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Device Information</h3>
        <button
          onClick={onViewLocation}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          title="View GPS location"
        >
          <MapPin className="w-5 h-5 text-gray-600" />
        </button>
      </div>
      <div className="space-y-3">
        <div className="flex justify-between py-2 border-b border-gray-100">
          <span className="text-gray-600">Device ID</span>
          <span className="font-medium text-gray-900 font-mono">{deviceId}</span>
        </div>
        {paddyInfo && (
          <div className="flex justify-between py-2 border-b border-gray-100">
            <span className="text-gray-600">Paddy Name</span>
            {isEditingPaddyName ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={paddyNameValue}
                  onChange={(e) => setPaddyNameValue(e.target.value)}
                  className="px-2 py-1 border border-gray-300 rounded text-sm font-medium text-gray-900"
                  placeholder="Enter paddy name"
                  autoFocus
                />
                <button
                  onClick={handleSavePaddyName}
                  disabled={isSavingPaddyName}
                  className="p-1 text-green-600 hover:bg-green-50 rounded"
                  title="Save"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  onClick={handleCancelEditPaddyName}
                  disabled={isSavingPaddyName}
                  className="p-1 text-red-600 hover:bg-red-50 rounded"
                  title="Cancel"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900">
                  {paddyInfo.paddyName || 'Unnamed Paddy'}
                </span>
                <button
                  onClick={handleStartEditPaddyName}
                  className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                  title="Edit paddy name"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}
        {fieldInfo && (
          <div className="flex justify-between py-2 border-b border-gray-100">
            <span className="text-gray-600">Field</span>
            <span className="font-medium text-gray-900">
              {fieldInfo.name || 'Unnamed Field'}
            </span>
          </div>
        )}
        <div className="flex justify-between py-2 border-b border-gray-100">
          <span className="text-gray-600">GPS Coordinates</span>
          <span className="font-medium text-gray-900">
            {gpsData && gpsData.lat && gpsData.lng
              ? `${gpsData.lat.toFixed(6)}, ${gpsData.lng.toFixed(6)}`
              : 'Not available'}
          </span>
        </div>
        <div className="flex justify-between py-2">
          <span className="text-gray-600">Connection</span>
          {deviceOnlineStatus ? (
            <div className="flex items-center gap-2">
              <span className={`font-medium ${
                deviceOnlineStatus.online ? 'text-green-600' : 'text-red-600'
              }`}>
                {deviceOnlineStatus.online ? 'Active' : 'Offline'}
              </span>
              <div className={`w-2 h-2 rounded-full ${
                deviceOnlineStatus.online ? 'bg-green-600 animate-pulse' : 'bg-red-600'
              }`} />
            </div>
          ) : (
            <span className="font-medium text-gray-400">Unknown</span>
          )}
        </div>
      </div>
    </div>
  );
}
