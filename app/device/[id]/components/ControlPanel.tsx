import React from 'react';
import { Scan, Map, MapPin, Power, Loader2 } from 'lucide-react';

interface ControlPanelProps {
  isScanning: boolean;
  lastScanTime: Date | null;
  scanSuccess: boolean;
  hasSavedBoundary: boolean;
  gpsData: any;
  relayStates: boolean[];
  relayProcessing?: boolean[];
  motorExtended: boolean;
  motorProcessing: boolean;
  gpsProcessing?: boolean;
  onScanNow: () => Promise<void>;
  onOpenBoundaryMap: () => void;
  onViewLocation: () => void;
  onRelayToggle: (index: number) => Promise<void>;
  onMotorToggle: () => Promise<void>;
}

export function ControlPanel(props: ControlPanelProps) {
  const {
    isScanning,
    lastScanTime,
    scanSuccess,
    hasSavedBoundary,
    gpsData,
    relayStates,
    relayProcessing,
    motorExtended,
    motorProcessing,
    gpsProcessing,
    onScanNow,
    onOpenBoundaryMap,
    onViewLocation,
    onRelayToggle,
    onMotorToggle,
  } = props;

  const safeRelayProcessing = relayProcessing ?? [false, false, false, false];
  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 mb-6 border-0">
      <h3 className="text-lg font-semibold text-gray-900 mb-4 ui-heading-mono">Device Controls</h3>
      
      {/* Success Banner */}
      {scanSuccess && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 animate-fade-in">
          <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm text-green-800 font-medium">✓ Scan command sent successfully!</span>
        </div>
      )}
      
      <div className="space-y-6">
        {/* Global / Field-level controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {/* Map Boundary */}
          <div className="p-4 border border-gray-200 rounded-lg hover:border-blue-500 transition-colors">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h4 className="font-semibold text-gray-900">Paddy Boundary</h4>
                <p className="text-xs text-gray-600 mt-1">Field mapping (not tied to ESP32)</p>
              </div>
              <Map className="w-5 h-5 text-blue-600" />
            </div>
            <button
              onClick={onOpenBoundaryMap}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              {hasSavedBoundary ? 'Edit Boundary' : 'Map Boundary'}
            </button>
            {hasSavedBoundary && (
              <p className="text-xs text-green-600 mt-2 text-center flex items-center justify-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Boundary saved
              </p>
            )}
          </div>
        </div>

        {/* ESP32A - Relay Controller */}
        <div>
          <div className="flex items-baseline justify-between mb-3">
            <div>
              <h4 className="text-base font-semibold text-gray-900">ESP32A – Relay Controller</h4>
              <p className="text-xs text-gray-600 mt-1">Controls irrigation valves and actuators</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {/* Relay 1 */}
            <div className="p-4 border border-gray-200 rounded-lg hover:border-orange-500 transition-colors">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-gray-900">Relay 1</h4>
                <Power className={`w-5 h-5 ${relayStates[0] ? 'text-orange-600' : 'text-gray-400'}`} />
              </div>
              <button
                onClick={() => onRelayToggle(0)}
                disabled={safeRelayProcessing[0]}
                className={`w-full px-4 py-2 rounded-lg transition-colors font-medium flex items-center justify-center gap-2 ${
                  safeRelayProcessing[0]
                    ? 'bg-gray-400 cursor-not-allowed text-white'
                    : relayStates[0]
                    ? 'bg-orange-600 hover:bg-orange-700 text-white'
                    : 'bg-orange-100 hover:bg-orange-200 text-orange-700'
                }`}
              >
                {safeRelayProcessing[0] ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Waiting...
                  </>
                ) : (
                  relayStates[0] ? 'Turn OFF' : 'Turn ON'
                )}
              </button>
              {safeRelayProcessing[0] && (
                <p className="text-xs text-gray-500 mt-2 text-center">
                  Waiting for device response...
                </p>
              )}
            </div>
        
            {/* Relay 2 */}
            <div className="p-4 border border-gray-200 rounded-lg hover:border-orange-500 transition-colors">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-gray-900">Relay 2</h4>
                <Power className={`w-5 h-5 ${relayStates[1] ? 'text-orange-600' : 'text-gray-400'}`} />
              </div>
              <button
                onClick={() => onRelayToggle(1)}
                disabled={safeRelayProcessing[1]}
                className={`w-full px-4 py-2 rounded-lg transition-colors font-medium flex items-center justify-center gap-2 ${
                  safeRelayProcessing[1]
                    ? 'bg-gray-400 cursor-not-allowed text-white'
                    : relayStates[1]
                    ? 'bg-orange-600 hover:bg-orange-700 text-white'
                    : 'bg-orange-100 hover:bg-orange-200 text-orange-700'
                }`}
              >
                {safeRelayProcessing[1] ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Waiting...
                  </>
                ) : (
                  relayStates[1] ? 'Turn OFF' : 'Turn ON'
                )}
              </button>
              {safeRelayProcessing[1] && (
                <p className="text-xs text-gray-500 mt-2 text-center">
                  Waiting for device response...
                </p>
              )}
            </div>
        
            {/* Relay 3 */}
            <div className="p-4 border border-gray-200 rounded-lg hover:border-orange-500 transition-colors">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-gray-900">Relay 3</h4>
                <Power className={`w-5 h-5 ${relayStates[2] ? 'text-orange-600' : 'text-gray-400'}`} />
              </div>
              <button
                onClick={() => onRelayToggle(2)}
                disabled={safeRelayProcessing[2]}
                className={`w-full px-4 py-2 rounded-lg transition-colors font-medium flex items-center justify-center gap-2 ${
                  safeRelayProcessing[2]
                    ? 'bg-gray-400 cursor-not-allowed text-white'
                    : relayStates[2]
                    ? 'bg-orange-600 hover:bg-orange-700 text-white'
                    : 'bg-orange-100 hover:bg-orange-200 text-orange-700'
                }`}
              >
                {safeRelayProcessing[2] ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Waiting...
                  </>
                ) : (
                  relayStates[2] ? 'Turn OFF' : 'Turn ON'
                )}
              </button>
              {safeRelayProcessing[2] && (
                <p className="text-xs text-gray-500 mt-2 text-center">
                  Waiting for device response...
                </p>
              )}
            </div>
        
            {/* Relay 4 */}
            <div className="p-4 border border-gray-200 rounded-lg hover:border-orange-500 transition-colors">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-gray-900">Relay 4</h4>
                <Power className={`w-5 h-5 ${relayStates[3] ? 'text-orange-600' : 'text-gray-400'}`} />
              </div>
              <button
                onClick={() => onRelayToggle(3)}
                disabled={safeRelayProcessing[3]}
                className={`w-full px-4 py-2 rounded-lg transition-colors font-medium flex items-center justify-center gap-2 ${
                  safeRelayProcessing[3]
                    ? 'bg-gray-400 cursor-not-allowed text-white'
                    : relayStates[3]
                    ? 'bg-orange-600 hover:bg-orange-700 text-white'
                    : 'bg-orange-100 hover:bg-orange-200 text-orange-700'
                }`}
              >
                {safeRelayProcessing[3] ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Waiting...
                  </>
                ) : (
                  relayStates[3] ? 'Turn OFF' : 'Turn ON'
                )}
              </button>
              {safeRelayProcessing[3] && (
                <p className="text-xs text-gray-500 mt-2 text-center">
                  Waiting for device response...
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ESP32B - Motor & GPS */}
        <div>
          <div className="flex items-baseline justify-between mb-3">
            <div>
              <h4 className="text-base font-semibold text-gray-900">ESP32B – Motor &amp; GPS</h4>
              <p className="text-xs text-gray-600 mt-1">Controls motor position and reports GPS location</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Motor Control (ESP32B) */}
            <div className="p-4 border border-gray-200 rounded-lg hover:border-blue-500 transition-colors">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="font-semibold text-gray-900">Motor Controller</h4>
                  <p className="text-xs text-gray-600 mt-1">ESP32B - Extend/Retract</p>
                </div>
                <span className="text-lg">{motorExtended ? '⬆️' : '⬇️'}</span>
              </div>
              <button
                onClick={onMotorToggle}
                disabled={motorProcessing}
                className={`w-full px-4 py-2 rounded-lg transition-colors font-medium flex items-center justify-center gap-2 ${
                  motorProcessing
                    ? 'bg-gray-400 cursor-not-allowed text-white'
                    : motorExtended
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                {motorProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  motorExtended ? 'Retract Motor' : 'Extend Motor'
                )}
              </button>
            </div>

            {/* GPS Location */}
            <div className="p-4 border border-gray-200 rounded-lg hover:border-purple-500 transition-colors">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="font-semibold text-gray-900">GPS Location</h4>
                  <p className="text-xs text-gray-600 mt-1">ESP32B - Get device coordinates</p>
                </div>
                <MapPin className="w-5 h-5 text-purple-600" />
              </div>
              <button
                onClick={onViewLocation}
                disabled={gpsProcessing}
                className={`w-full px-4 py-2 rounded-lg transition-colors font-medium flex items-center justify-center gap-2 ${
                  gpsProcessing
                    ? 'bg-gray-400 cursor-not-allowed text-white'
                    : 'bg-purple-600 hover:bg-purple-700 text-white'
                }`}
              >
                {gpsProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  'Get Location'
                )}
              </button>
              {gpsData && gpsData.lat && gpsData.lng && (
                <p className="text-xs text-gray-500 mt-2 text-center">
                  Last: {gpsData.lat.toFixed(4)}, {gpsData.lng.toFixed(4)}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ESP32C - NPK Sensor */}
        <div>
          <div className="flex items-baseline justify-between mb-3">
            <div>
              <h4 className="text-base font-semibold text-gray-900">ESP32C – NPK Sensor</h4>
              <p className="text-xs text-gray-600 mt-1">Triggers on-device NPK scan (soil nutrients)</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {/* Scan Device */}
            <div className="p-4 border border-gray-200 rounded-lg hover:border-green-500 transition-colors">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-gray-900">Scan Device</h4>
                <Scan className="w-5 h-5 text-green-600" />
              </div>
              <button
                onClick={onScanNow}
                disabled={isScanning}
                className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
              >
                {isScanning ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Scanning...
                  </span>
                ) : (
                  'Scan Now'
                )}
              </button>
              {lastScanTime && (
                <p className="text-xs text-gray-500 mt-2 text-center">
                  Last scan: {lastScanTime.toLocaleTimeString()}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
