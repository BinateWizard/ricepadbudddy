'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { CheckCircle2, Circle, Loader2, XCircle, MapPin, Save } from 'lucide-react';
import { database, firestore } from '@/lib/firebase';
import { ref, onValue, off } from 'firebase/database';
import { doc, updateDoc, arrayUnion, serverTimestamp } from 'firebase/firestore';

interface GPSData {
  lat: number;
  lng: number;
  alt?: number;
  hdop?: number;
  sats?: number;
  ts?: number;
}

interface GetLocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  deviceId: string;
  fieldId?: string;
  userId: string;
}

export function GetLocationModal({
  isOpen,
  onClose,
  deviceId,
  fieldId,
  userId
}: GetLocationModalProps) {
  const [step, setStep] = useState<'fetching' | 'received' | 'saving' | 'saved'>('fetching');
  const [gpsData, setGpsData] = useState<GPSData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showViewPrompt, setShowViewPrompt] = useState(false);
  const [showSavePrompt, setShowSavePrompt] = useState(false);
  const [plotName, setPlotName] = useState('');
  const [elapsedTime, setElapsedTime] = useState(0);
  const [commandStartTime, setCommandStartTime] = useState<number>(0);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      console.log('[GetLocationModal] Modal opened - resetting state');
      setStep('fetching');
      setGpsData(null);
      setError(null);
      setShowViewPrompt(false);
      setShowSavePrompt(false);
      setPlotName('');
      setElapsedTime(0);
      setCommandStartTime(Date.now());
    }
  }, [isOpen]);

  // Elapsed time counter
  useEffect(() => {
    if (!isOpen || step !== 'fetching') return;

    const startTime = Date.now();
    setCommandStartTime(startTime);
    
    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen, step]);

  // Listen for GPS command status and data from ESP32B
  useEffect(() => {
    if (!isOpen || step !== 'fetching' || !commandStartTime) return;

    const commandPath = `devices/${deviceId}/commands/ESP32B/gps`;
    const gpsPath = `devices/${deviceId}/gps`;
    const commandRef = ref(database, commandPath);
    const gpsRef = ref(database, gpsPath);

    let timeoutTimer: NodeJS.Timeout;
    const modalOpenedAt = commandStartTime;

    console.log('[GetLocationModal] Started listening at:', modalOpenedAt);
    console.log('[GetLocationModal] Monitoring command:', commandPath);
    console.log('[GetLocationModal] Monitoring GPS:', gpsPath);

    // Monitor GPS data - wait for updates AFTER modal opens
    const unsubscribeGPS = onValue(gpsRef, (snapshot) => {
      const data = snapshot.val();
      
      if (!data) {
        console.log('[GetLocationModal] No GPS data yet');
        return;
      }
      
      console.log('[GetLocationModal] GPS data exists:', data);
      
      // Check if GPS data contains an error from ESP32B
      if (data.status === 'error') {
        console.log('[GetLocationModal] GPS error from device - no signal');
        setError('GPS fix timeout - device cannot acquire satellite signal');
        setStep('received');
        clearTimeout(timeoutTimer);
        return;
      }
      
      // Check if we have valid GPS coordinates and status is ok
      if (data.status === 'ok' && data.lat && data.lng && data.lat !== 0 && data.lng !== 0) {
        const gpsTime = data.timestamp || data.ts || 0;
        
        // Check if timestamp is relative (device millis) or absolute (epoch time)
        // Device millis is < 10^10, epoch time is > 10^10
        const isRelativeTime = gpsTime < 10000000000;
        
        if (isRelativeTime) {
          // Device hasn't synced NTP yet, using millis() since boot
          // Just check that we have a non-zero timestamp (any value means fresh data from current session)
          console.log('[GetLocationModal] GPS data received with relative timestamp:', gpsTime, 'ms (device boot time)');
          setGpsData({
            lat: data.lat,
            lng: data.lng,
            alt: data.alt,
            hdop: data.hdop,
            sats: data.sats,
            ts: gpsTime
          });
          setStep('received');
          setShowViewPrompt(true);
          clearTimeout(timeoutTimer);
        } else {
          // Device has NTP time synced, check if data is fresh
          const age = Date.now() - gpsTime;
          console.log('[GetLocationModal] GPS data age:', age, 'ms (epoch time)');
          
          // Accept GPS data that's fresh (less than 3 minutes old)
          if (age < 180000) {
            console.log('[GetLocationModal] Valid GPS coordinates found');
            setGpsData({
              lat: data.lat,
              lng: data.lng,
              alt: data.alt,
              hdop: data.hdop,
              sats: data.sats,
              ts: gpsTime
            });
            setStep('received');
            setShowViewPrompt(true);
            clearTimeout(timeoutTimer);
          } else {
            console.log('[GetLocationModal] GPS data too old, age:', age, 'ms');
          }
        }
      }
    });

    // Monitor command for errors - only react to commands created after modal opened
    const unsubscribeCommand = onValue(commandRef, (snapshot) => {
      const cmd = snapshot.val();
      if (!cmd) return;
      
      // Only react to commands created after modal opened
      const cmdTime = cmd.requestedAt || 0;
      if (cmdTime < modalOpenedAt - 5000) {
        console.log('[GetLocationModal] Command is from before modal opened, ignoring status:', cmd.status);
        return;
      }
      
      console.log('[GetLocationModal] Command status:', cmd.status, 'requestedAt:', cmdTime);
      
      if (cmd.status === 'error') {
        setError(cmd.error || 'GPS command failed on device');
        setStep('received');
        clearTimeout(timeoutTimer);
      } else if (cmd.status === 'completed') {
        // Command completed - GPS data should be available
        console.log('[GetLocationModal] Command completed, waiting for GPS data');
      }
    });

    // Set 2 minute timeout (120 seconds)
    timeoutTimer = setTimeout(async () => {
      if (step === 'fetching') {
        console.log('[GetLocationModal] Timeout reached, updating command status');
        
        // Update command status to timeout in RTDB
        try {
          const { update } = await import('firebase/database');
          await update(commandRef, {
            status: 'timeout',
            error: 'Frontend timeout - no response from device',
            timeoutAt: Date.now()
          });
          console.log('[GetLocationModal] Command status updated to timeout');
        } catch (error) {
          console.error('[GetLocationModal] Failed to update command status:', error);
        }
        
        setError('GPS data not received. Device may be offline or GPS signal unavailable.');
        setStep('received');
      }
    }, 120000);

    return () => {
      off(commandRef);
      off(gpsRef);
      clearTimeout(timeoutTimer);
    };
  }, [isOpen, deviceId, step, commandStartTime]);

  const handleViewLocation = () => {
    setShowViewPrompt(false);
    setShowSavePrompt(true);
  };

  const handleSkipView = () => {
    setShowViewPrompt(false);
    setShowSavePrompt(true);
  };

  const handleSavePlot = async () => {
    if (!gpsData || !fieldId || !plotName.trim()) {
      setError('Please enter a plot name');
      return;
    }

    setStep('saving');
    setShowSavePrompt(false);

    try {
      const fieldRef = doc(firestore, 'fields', fieldId);
      
      // Save plot to field's plots array
      await updateDoc(fieldRef, {
        plots: arrayUnion({
          name: plotName.trim(),
          coordinates: {
            lat: gpsData.lat,
            lng: gpsData.lng
          },
          altitude: gpsData.alt,
          deviceId,
          createdBy: userId,
          createdAt: serverTimestamp(),
          timestamp: gpsData.ts || Date.now()
        })
      });

      setStep('saved');
      
      // Auto-close after 2 seconds
      setTimeout(() => {
        onClose();
        resetState();
      }, 2000);
    } catch (error) {
      console.error('Error saving plot:', error);
      setError('Failed to save plot. Please try again.');
      setStep('received');
      setShowSavePrompt(true);
    }
  };

  const handleSkipSave = () => {
    onClose();
    resetState();
  };

  const resetState = () => {
    setStep('fetching');
    setGpsData(null);
    setError(null);
    setShowViewPrompt(false);
    setShowSavePrompt(false);
    setPlotName('');
    setElapsedTime(0);
    setCommandStartTime(0);
  };

  const formatCoordinate = (value: number, decimals: number = 7) => {
    return value.toFixed(decimals);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) {
        onClose();
        resetState();
      }
    }}>
      <DialogContent className="sm:max-w-[500px] bg-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl text-gray-900">
            <MapPin className="w-6 h-6 text-purple-600" />
            Get Location
          </DialogTitle>
          <DialogDescription className="text-gray-600">
            Fetching GPS coordinates from ESP32B device
          </DialogDescription>
        </DialogHeader>

        <div className="py-6">
          {/* Fetching State */}
          {step === 'fetching' && (
            <div className="space-y-6">
              <div className="flex flex-col items-center justify-center py-8">
                <Loader2 className="w-16 h-16 text-purple-600 animate-spin mb-4" />
                <p className="text-lg font-medium text-gray-900">Fetching GPS data...</p>
                <p className="text-sm text-gray-600 mt-2">Elapsed time: {elapsedTime}s</p>
              </div>

              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <div className="flex gap-3">
                  <Circle className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-purple-900">Waiting for device response</p>
                    <p className="text-xs text-purple-700 mt-1">
                      The ESP32B device is acquiring GPS signal and will send coordinates shortly.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Received State - View Prompt */}
          {step === 'received' && showViewPrompt && !error && (
            <div className="space-y-6">
              <div className="flex flex-col items-center justify-center py-6">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                  <CheckCircle2 className="w-10 h-10 text-green-600" />
                </div>
                <p className="text-lg font-medium text-gray-900 mb-2">Location Received!</p>
                <p className="text-sm text-gray-600 text-center">
                  GPS coordinates have been successfully retrieved from the device.
                </p>
              </div>

              {gpsData && (
                <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-lg p-4 border border-purple-200">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs font-medium text-gray-600">Latitude</p>
                      <p className="text-sm font-bold text-gray-900">{formatCoordinate(gpsData.lat)}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-600">Longitude</p>
                      <p className="text-sm font-bold text-gray-900">{formatCoordinate(gpsData.lng)}</p>
                    </div>
                    {gpsData.alt && (
                      <div>
                        <p className="text-xs font-medium text-gray-600">Altitude</p>
                        <p className="text-sm font-bold text-gray-900">{gpsData.alt.toFixed(1)} m</p>
                      </div>
                    )}
                    {gpsData.sats && (
                      <div>
                        <p className="text-xs font-medium text-gray-600">Satellites</p>
                        <p className="text-sm font-bold text-gray-900">{gpsData.sats}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-900 text-center">
                  Would you like to view this location on the map?
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={handleViewLocation}
                    className="flex-1 px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium flex items-center justify-center gap-2"
                  >
                    <MapPin className="w-5 h-5" />
                    View on Map
                  </button>
                  <button
                    onClick={handleSkipView}
                    className="flex-1 px-4 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                  >
                    Skip
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Save Prompt */}
          {step === 'received' && showSavePrompt && !error && (
            <div className="space-y-6">
              {gpsData && (
                <>
                  {/* Map Preview */}
                  <div className="bg-gray-100 rounded-lg overflow-hidden" style={{ height: '250px' }}>
                    <iframe
                      width="100%"
                      height="100%"
                      frameBorder="0"
                      src={`https://www.google.com/maps?q=${gpsData.lat},${gpsData.lng}&output=embed&zoom=17`}
                      allowFullScreen
                    />
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label htmlFor="plotName" className="block text-sm font-medium text-gray-900 mb-2">
                        Would you like to save this location as a plot?
                      </label>
                      <input
                        type="text"
                        id="plotName"
                        value={plotName}
                        onChange={(e) => setPlotName(e.target.value)}
                        placeholder="Enter plot name (e.g., Plot A, Section 1)"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition-all"
                      />
                      <p className="text-xs text-gray-600 mt-2">
                        Plots are only visible to you and saved to this field.
                      </p>
                    </div>

                    <div className="flex gap-3">
                      <button
                        onClick={handleSavePlot}
                        disabled={!plotName.trim()}
                        className="flex-1 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium flex items-center justify-center gap-2 disabled:bg-gray-300 disabled:cursor-not-allowed"
                      >
                        <Save className="w-5 h-5" />
                        Save Plot
                      </button>
                      <button
                        onClick={handleSkipSave}
                        className="flex-1 px-4 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                      >
                        Don't Save
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Saving State */}
          {step === 'saving' && (
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="w-16 h-16 text-green-600 animate-spin mb-4" />
              <p className="text-lg font-medium text-gray-900">Saving plot...</p>
            </div>
          )}

          {/* Saved State */}
          {step === 'saved' && (
            <div className="flex flex-col items-center justify-center py-8">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                <CheckCircle2 className="w-10 h-10 text-green-600" />
              </div>
              <p className="text-lg font-medium text-gray-900 mb-2">Plot Saved!</p>
              <p className="text-sm text-gray-600">
                {plotName} has been saved to your field.
              </p>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex gap-3">
                <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-900">Error</p>
                  <p className="text-xs text-red-700 mt-1">{error}</p>
                </div>
              </div>
              <button
                onClick={handleSkipSave}
                className="mt-4 w-full px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors font-medium text-sm"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
