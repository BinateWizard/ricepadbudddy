'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

interface AddPaddyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    paddyName: string;
    paddyDescription: string;
    deviceId: string;
    paddyShapeType: 'rectangle' | 'trapezoid';
    paddyLength: string;
    paddyWidth: string;
    paddyWidth2: string;
  }) => Promise<void>;
  isVerifying: boolean;
}

export function AddPaddyModal({ isOpen, onClose, onSubmit, isVerifying }: AddPaddyModalProps) {
  const [paddyName, setPaddyName] = useState("");
  const [paddyDescription, setPaddyDescription] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [paddyShapeType, setPaddyShapeType] = useState<'rectangle' | 'trapezoid'>('rectangle');
  const [paddyLength, setPaddyLength] = useState("");
  const [paddyWidth, setPaddyWidth] = useState("");
  const [paddyWidth2, setPaddyWidth2] = useState("");
  const [errors, setErrors] = useState<{[key: string]: string}>({});

  const handleClose = () => {
    setErrors({});
    setPaddyName("");
    setPaddyDescription("");
    setDeviceId("");
    setPaddyShapeType('rectangle');
    setPaddyLength("");
    setPaddyWidth("");
    setPaddyWidth2("");
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: {[key: string]: string} = {};
    
    if (!paddyName.trim()) newErrors.paddyName = "Please enter a paddy name";
    if (!deviceId.trim()) {
      newErrors.deviceId = "Please enter a device ID";
    } else {
      const deviceIdPattern = /^DEVICE_\d{4}$/;
      if (!deviceIdPattern.test(deviceId)) {
        newErrors.deviceId = "Invalid format. Use DEVICE_0001 format";
      }
    }
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      await onSubmit({
        paddyName,
        paddyDescription,
        deviceId,
        paddyShapeType,
        paddyLength,
        paddyWidth,
        paddyWidth2
      });
      handleClose();
    } catch (error: any) {
      setErrors({ submit: error.message || 'Failed to add paddy' });
    }
  };

  const calculatePaddyArea = () => {
    if (!paddyLength) return null;
    
    if (paddyShapeType === 'rectangle') {
      if (!paddyWidth) return null;
      return parseFloat(paddyLength) * parseFloat(paddyWidth);
    } else if (paddyShapeType === 'trapezoid') {
      if (!paddyWidth || !paddyWidth2) return null;
      return ((parseFloat(paddyWidth) + parseFloat(paddyWidth2)) / 2) * parseFloat(paddyLength);
    }
    return null;
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Glassmorphism Overlay */}
      <div 
        onClick={handleClose}
        className="fixed inset-0 backdrop-blur-sm bg-black/20 z-40 transition-all"
      />
      
      {/* Bottom Sheet */}
      <div className="fixed inset-x-0 bottom-0 z-50 animate-slide-up">
        <div className="bg-white rounded-t-3xl shadow-2xl h-[70vh] flex flex-col border-t-4 border-green-500">
          {/* Handle Bar */}
          <div className="flex justify-center pt-3 pb-4">
            <div className="w-12 h-1.5 bg-green-300 rounded-full" />
          </div>
          
          {/* Modal Content */}
          <div className="flex-1 overflow-y-auto px-6 pb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Add Paddy</h2>
            
            <form onSubmit={handleSubmit} className="space-y-5">
              {errors.submit && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-sm text-red-600">{errors.submit}</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Paddy Name
                </label>
                <input
                  type="text"
                  value={paddyName}
                  onChange={(e) => {
                    setPaddyName(e.target.value);
                    setErrors(prev => ({...prev, paddyName: ""}));
                  }}
                  placeholder="e.g., North Paddy"
                  className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white text-gray-900 ${
                    errors.paddyName ? 'border-red-400 bg-red-50' : 'border-gray-300'
                  }`}
                />
                {errors.paddyName && (
                  <p className="text-red-500 text-sm mt-1.5 flex items-center gap-1">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    {errors.paddyName}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description (Optional)
                </label>
                <textarea
                  value={paddyDescription}
                  onChange={(e) => setPaddyDescription(e.target.value)}
                  placeholder="Add any notes about this paddy"
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none bg-white text-gray-900"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Device ID
                </label>
                <input
                  type="text"
                  value={deviceId}
                  onChange={(e) => {
                    setDeviceId(e.target.value.toUpperCase());
                    setErrors(prev => ({...prev, deviceId: ""}));
                  }}
                  placeholder="DEVICE_0001"
                  className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent font-mono bg-white text-gray-900 ${
                    errors.deviceId ? 'border-red-400 bg-red-50' : 'border-gray-300'
                  }`}
                />
                {errors.deviceId && (
                  <p className="text-red-500 text-sm mt-1.5 flex items-center gap-1">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    {errors.deviceId}
                  </p>
                )}
                <p className="mt-1.5 text-xs text-gray-500">Format: DEVICE_0001</p>
              </div>

              {/* Paddy Dimensions / Area */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Field Shape
                </label>
                <select
                  value={paddyShapeType}
                  onChange={(e) => {
                    setPaddyShapeType(e.target.value as 'rectangle' | 'trapezoid');
                    setErrors(prev => ({ ...prev, area: "" }));
                  }}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white text-gray-900 mb-3"
                >
                  <option value="rectangle">Rectangle</option>
                  <option value="trapezoid">Trapezoid (varying width)</option>
                </select>
                <p className="text-xs text-gray-500 mb-4">
                  {paddyShapeType === 'rectangle' 
                    ? 'For rectangular paddies with uniform width'
                    : 'For paddies where one end is wider than the other'}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Paddy Dimensions (for area)
                </label>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Length (m)</label>
                    <input
                      type="number"
                      value={paddyLength}
                      onChange={(e) => {
                        setPaddyLength(e.target.value);
                        setErrors(prev => ({ ...prev, area: "" }));
                      }}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white text-gray-900"
                      placeholder="e.g., 50"
                      step="0.1"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">
                      {paddyShapeType === 'rectangle' ? 'Width (m)' : 'Width 1 (m)'}
                    </label>
                    <input
                      type="number"
                      value={paddyWidth}
                      onChange={(e) => {
                        setPaddyWidth(e.target.value);
                        setErrors(prev => ({ ...prev, area: "" }));
                      }}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white text-gray-900"
                      placeholder="e.g., 40"
                      step="0.1"
                    />
                  </div>
                </div>
                {paddyShapeType === 'trapezoid' && (
                  <div className="mb-3">
                    <label className="block text-xs text-gray-600 mb-1">Width 2 (m)</label>
                    <input
                      type="number"
                      value={paddyWidth2}
                      onChange={(e) => {
                        setPaddyWidth2(e.target.value);
                        setErrors(prev => ({ ...prev, area: "" }));
                      }}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white text-gray-900"
                      placeholder="e.g., 45"
                      step="0.1"
                    />
                    <p className="text-xs text-gray-500 mt-1">Width at the other end of the paddy</p>
                  </div>
                )}

                {errors.area && (
                  <p className="text-red-500 text-sm mt-1.5 flex items-center gap-1">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    {errors.area}
                  </p>
                )}

                {calculatePaddyArea() && (
                  <div className="mt-3 space-y-1.5 p-3 bg-green-50 rounded-lg border border-green-200">
                    <p className="text-sm text-green-700 font-medium">
                      📐 Area: {calculatePaddyArea()?.toFixed(2)} m²
                    </p>
                    <p className="text-sm text-emerald-700 font-medium">
                      🌾 Hectares: {((calculatePaddyArea() || 0) / 10000).toFixed(4)} ha
                    </p>
                  </div>
                )}
                <p className="text-xs text-gray-500 mt-2">
                  Enter the dimensions of this paddy to store its area for fertilizer and yield calculations.
                </p>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={handleClose}
                  className="flex-1 px-4 py-3 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isVerifying}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl hover:from-green-700 hover:to-emerald-700 active:scale-95 transition-all font-bold shadow-lg hover:shadow-xl disabled:bg-gray-400 disabled:cursor-not-allowed disabled:active:scale-100"
                >
                  {isVerifying ? 'Adding...' : 'Add Paddy'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
