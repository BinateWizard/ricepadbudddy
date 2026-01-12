// This file has been cleared for a fresh start.

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { MapPin } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { getDeviceStatus, getDeviceGPS, getDeviceNPK } from '@/lib/utils/deviceStatus';
import { database, db } from '@/lib/firebase';
import { ref as dbRef, onValue, off, get, push, set } from 'firebase/database';
import { onDeviceValue } from '@/lib/utils/rtdbHelper';
import { collection, addDoc, Timestamp, query, orderBy, onSnapshot, limit as firestoreLimit } from 'firebase/firestore';
import { sendDeviceCommand } from '@/lib/utils/deviceCommands';
import { logUserAction } from '@/lib/utils/userActions';
import { logDeviceAction, getFieldLogs } from '@/lib/utils/deviceLogs';

// High-level tabs for the control panel.
// Desktop keeps the full set; on mobile they wrap into 2 rows
// so everything is visible without a horizontal slider.
const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'controls', label: 'Controls' },
  { id: 'location', label: 'Location' },
  { id: 'logs', label: 'Logs/History' },
  { id: 'info', label: 'Device Info' },
  { id: 'settings', label: 'Settings' },
];

type ControlActionId =
  | 'relay_on'
  | 'relay_off'
  | 'motor_extend'
  | 'motor_retract'
  | 'gps_fetch'
  | 'npk_scan';

interface ControlAction {
  id: ControlActionId;
  label: string;
  description: string;
  nodeId: 'ESP32A' | 'ESP32B' | 'ESP32C';
  role: 'relay' | 'motor' | 'npk';
  action: string;
  // Some actions (relay) need an extra relay selector in the modal.
  requiresRelay?: boolean;
}

const CONTROL_ACTIONS: ControlAction[] = [
  {
    id: 'relay_on',
    label: 'Turn Relay ON',
    description: 'Turn a specific relay ON on selected devices (ESP32A).',
    nodeId: 'ESP32A',
    role: 'relay',
    action: 'on',
    requiresRelay: true,
  },
  {
    id: 'relay_off',
    label: 'Turn Relay OFF',
    description: 'Turn a specific relay OFF on selected devices (ESP32A).',
    nodeId: 'ESP32A',
    role: 'relay',
    action: 'off',
    requiresRelay: true,
  },
  {
    id: 'motor_extend',
    label: 'Extend Motor',
    description: 'Extend irrigation motor on selected devices (ESP32B).',
    nodeId: 'ESP32B',
    role: 'motor',
    action: 'down',
  },
  {
    id: 'motor_retract',
    label: 'Retract Motor',
    description: 'Retract irrigation motor on selected devices (ESP32B).',
    nodeId: 'ESP32B',
    role: 'motor',
    action: 'up',
  },
  {
    id: 'gps_fetch',
    label: 'Request GPS Location',
    description: 'Ask devices to send their latest GPS fix (ESP32B).',
    nodeId: 'ESP32B',
    role: 'npk',
    action: 'read',
  },
  {
    id: 'npk_scan',
    label: 'Run NPK Scan',
    description: 'Trigger on-device NPK soil scan (ESP32C).',
    nodeId: 'ESP32C',
    role: 'npk',
    action: 'scan',
  },
];

// Helper for time display (moved to top-level so subcomponents can use it)
function formatTimeAgo(ts: number | undefined) {
  if (!ts) return 'Never';
  const now = Date.now();
  const diff = now - (ts < 1e11 ? ts * 1000 : ts);
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// Log control panel action via Cloud Function
async function logControlAction(entry: { deviceId?: string; action: string; details?: any }) {
  try {
    await logUserAction({
      deviceId: entry.deviceId,
      action: entry.action,
      details: entry.details
    });
  } catch (e) {
    console.error('Failed to log control action', e);
  }
}

// wait for device to set actionTaken = true (acknowledgement)
function waitForAck(id: string, timeoutMs = 10000): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const unsub = onDeviceValue(id, 'actionTaken', (val) => {
      if (val === true && !settled) {
        settled = true;
        try { unsub(); } catch {}
        resolve(true);
      }
    });
    setTimeout(() => {
      if (!settled) {
        settled = true;
        try { unsub(); } catch {}
        resolve(false);
      }
    }, timeoutMs);
  });
}

interface ControlPanelTabProps {
  paddies?: any[];
  fieldId?: string;
  deviceReadings?: any[];
}

export default function ControlPanelTab({ paddies = [], fieldId, deviceReadings = [] }: ControlPanelTabProps) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState(0);
  const [deviceData, setDeviceData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingRelay, setSendingRelay] = useState<string | null>(null);
  const [isActionModalOpen, setIsActionModalOpen] = useState(false);
  const [selectedActionId, setSelectedActionId] = useState<ControlActionId | null>(null);

  // Fetch initial device data
  useEffect(() => {
    async function fetchAll() {
      setLoading(true);
      if (paddies.length > 0) {
        // Fetch data for each paddy's device
        const results = await Promise.all(
          paddies.map(async (paddy) => {
            const [status, gps, npk] = await Promise.all([
              getDeviceStatus(paddy.deviceId),
              getDeviceGPS(paddy.deviceId),
              getDeviceNPK(paddy.deviceId),
            ]);
            return { 
              id: paddy.deviceId, 
              label: paddy.paddyName || `Paddy ${paddy.id}`,
              paddyId: paddy.id,
              paddyName: paddy.paddyName,
              status, 
              gps, 
              npk,
              relayStates: { 1: 'unknown', 2: 'unknown', 3: 'unknown', 4: 'unknown' } as Record<number, 'on' | 'off' | 'unknown'>
            };
          })
        );
        setDeviceData(results);
      }
      setLoading(false);
    }
    if (activeTab === 0 || TABS[activeTab].id === 'info') fetchAll();
  }, [activeTab, paddies]);

  // Listen to relay states from RTDB in real-time (same as device page)
  useEffect(() => {
    if (!paddies || paddies.length === 0) return;
    if (activeTab !== 0 && TABS[activeTab].id !== 'info') return;

    const allUnsubscribes: (() => void)[] = [];

    paddies.forEach((paddy) => {
      const deviceId = paddy.deviceId;
      if (!deviceId) return;

      // Listen to entire relays array/object from RTDB
      const relaysRef = dbRef(database, `devices/${deviceId}/relays`);
      const relaysUnsubscribe = onValue(relaysRef, (snapshot) => {
        if (snapshot.exists()) {
          const relaysData = snapshot.val();
          
          setDeviceData(prev => 
            prev.map(dev => {
              if (dev.id === deviceId) {
                const newRelayStates = { ...dev.relayStates };
                
                // Handle both array (with null at 0) and object structure
                for (let i = 1; i <= 4; i++) {
                  const relayData = relaysData[i];
                  if (relayData && relayData.state) {
                    const state = relayData.state === 'ON' || relayData.state === 'on' || relayData.state === true ? 'on' : 'off';
                    newRelayStates[i] = state;
                  }
                }
                
                return {
                  ...dev,
                  relayStates: newRelayStates
                };
              }
              return dev;
            })
          );
        }
      });
      allUnsubscribes.push(relaysUnsubscribe);

      // FALLBACK: If /relays path doesn't have data yet, derive from latest commands
      // This keeps the UI in sync even before verifyLiveCommand populates /relays
      const commandsRef = dbRef(database, `devices/${deviceId}/commands/ESP32A`);
      const commandsUnsubscribe = onValue(commandsRef, (snapshot) => {
        const commands = snapshot.val();
        if (!commands) return;

        setDeviceData((prev) => 
          prev.map(dev => {
            if (dev.id !== deviceId) return dev;
            
            const newRelayStates = { ...dev.relayStates };
            
            for (let i = 1; i <= 4; i++) {
              const cmd = commands[`relay${i}`];
              if (!cmd) continue;

              const rawState = (cmd.actualState || cmd.action || '').toString().toUpperCase();
              const isOn = rawState === 'ON' || rawState === '1' || rawState === 'TRUE';
              newRelayStates[i] = isOn ? 'on' : 'off';
            }

            return {
              ...dev,
              relayStates: newRelayStates
            };
          })
        );
      });
      allUnsubscribes.push(commandsUnsubscribe);
    });

    return () => {
      allUnsubscribes.forEach(unsub => unsub());
    };
  }, [paddies, activeTab]);

  // Simple relay sender for ESP32A
  const sendRelayCommand = async (deviceId: string, relay: 1 | 2 | 3 | 4, action: 'on' | 'off' | 'toggle') => {
    if (!user) {
      alert('You must be signed in to control relays');
      return;
    }
    const key = `${deviceId}-r${relay}-${action}`;
    setSendingRelay(key);
    try {
      const result = await sendDeviceCommand(deviceId, 'ESP32A', 'relay', action, { relay }, user.uid);
      
      // Log the action via Cloud Function - wrapped in try-catch to prevent breaking the UI
      try {
        await logDeviceAction({
          deviceId,
          fieldId: fieldId || '',
          nodeId: 'ESP32A',
          action: `Relay ${relay} ${action.toUpperCase()}`,
          actionType: 'relay',
          params: { relay, action },
          result: result.success ? 'success' : 'failed',
          details: result
        });
      } catch (logError) {
        console.warn('Failed to log device action (non-critical):', logError);
      }
      
      if (result.success) {
        console.log(`[Relay] Command ${action} sent successfully`, result);
        if (result.status === 'completed') {
          console.log(`✓ Relay ${relay} turned ${action}`);
        }
      } else {
        console.error(`[Relay] Command failed`, result);
        alert(`Failed: ${result.message}`);
      }
    } catch (e) {
      console.error('Failed to send relay command', e);
      
      // Log the error - wrapped in try-catch to prevent breaking the UI
      try {
        await logDeviceAction({
          deviceId,
          fieldId: fieldId || '',
          nodeId: 'ESP32A',
          action: `Relay ${relay} ${action.toUpperCase()} - Failed`,
          actionType: 'relay',
          params: { relay, action },
          result: 'failed',
          error: String(e)
        });
      } catch (logError) {
        console.warn('Failed to log error (non-critical):', logError);
      }
      
      alert('Failed to send relay command');
    } finally {
      setSendingRelay(null);
    }
  };

  
  return (
    <div className="w-full flex flex-col items-stretch overflow-y-auto overflow-x-hidden">
      <div className="w-full max-w-4xl mx-auto flex flex-col h-full min-h-[400px] bg-white/90 backdrop-blur border border-gray-200 rounded-none sm:rounded-2xl shadow-lg overflow-hidden text-black">
        {/* Tab controller attached to top of panel */}
        <TabBar activeTab={activeTab} setActiveTab={setActiveTab} />
        {/* Main Content Area */}
        <div className="p-4 sm:p-6 min-h-[200px] h-full flex-1 overflow-y-auto overflow-x-hidden pr-2" style={{ minHeight: 200 }}>
          {/* Generic action runner modal (works across relays/motors/GPS/NPK) */}
          {isActionModalOpen && selectedActionId && (
            <ActionRunnerModal
              actionId={selectedActionId}
              onClose={() => setIsActionModalOpen(false)}
              devices={paddies
                .filter((p) => p.deviceId)
                .map((p) => ({
                  id: p.deviceId,
                  label: p.paddyName || `Paddy ${p.id}`,
                }))}
              userId={user?.uid || null}
            />
          )}
          {activeTab === 0 ? (
            loading ? (
              <div className="text-black text-center">Loading status...</div>
            ) : paddies.length === 0 ? (
              <div className="text-black text-center py-8">
                <p>No paddies in this field.</p>
                <p className="text-sm text-gray-600 mt-2">Add a paddy to see device status here.</p>
              </div>
            ) : (
              <div className="space-y-8">
                {deviceData.map((dev: any) => (
                  <div key={dev.id} className="mb-6">
                    <div className="flex items-center gap-4 mb-4">
                      <span className={`inline-block w-3 h-3 rounded-full ${dev.status?.color === 'green' ? 'bg-green-500' : dev.status?.color === 'yellow' ? 'bg-yellow-400' : 'bg-red-500'}`}></span>
                      <span className="font-bold text-lg text-black bg-white px-2 py-0.5 rounded">{dev.paddyName || `Paddy ${dev.paddyId}`}</span>
                      <span className="ml-2 px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-black">{dev.status?.badge || 'Unknown'}</span>
                      <div className="ml-auto flex items-center gap-2 text-sm text-black">
                        <span>Device: {dev.id}</span>
                        <Link
                          href={`/device/${dev.id}`}
                          className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 hover:bg-emerald-100 hover:text-emerald-800 transition"
                          title="View device location"
                          aria-label={`View device ${dev.id} location`}
                        >
                          <MapPin className="w-4 h-4" />
                        </Link>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {/* NPK Reading Card */}
                      <div className="p-4 rounded-xl border-2 border-gray-200 bg-white">
                        <div className="font-semibold mb-2 text-black">NPK Sensor</div>
                        {dev.npk ? (
                          <div className="space-y-1">
                            <div className="text-sm text-black">N: <span className="font-bold text-blue-600">{dev.npk.n ?? '-'}</span></div>
                            <div className="text-sm text-black">P: <span className="font-bold text-purple-600">{dev.npk.p ?? '-'}</span></div>
                            <div className="text-sm text-black">K: <span className="font-bold text-orange-600">{dev.npk.k ?? '-'}</span></div>
                            <div className="text-xs text-gray-600 mt-1">Last: {formatTimeAgo(dev.npk?.timestamp)}</div>
                          </div>
                        ) : (
                          <div className="text-sm text-gray-600">No data</div>
                        )}
                      </div>

                      {/* GPS Card */}
                      <div className="p-4 rounded-xl border-2 border-gray-200 bg-white">
                        <div className="font-semibold mb-2 text-black flex items-center gap-2">
                          <MapPin className="w-5 h-5 text-blue-600" />
                          GPS Location
                        </div>
                        {dev.gps?.lat && dev.gps?.lng ? (
                          <div className="space-y-2">
                            <div className="space-y-1">
                              <div className="text-xs text-black font-mono">{dev.gps.lat.toFixed(6)}</div>
                              <div className="text-xs text-black font-mono">{dev.gps.lng.toFixed(6)}</div>
                              <div className="text-xs text-gray-600 mt-1">Last: {formatTimeAgo(dev.gps?.ts)}</div>
                            </div>
                            <button
                              onClick={() => setActiveTab(2)}
                              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium hover:underline"
                            >
                              <MapPin className="w-3 h-3" />
                              View on Map
                            </button>
                          </div>
                        ) : (
                          <div className="text-sm text-gray-600">No data</div>
                        )}
                      </div>

                      {/* Device Info Card */}
                      <div className="p-4 rounded-xl border-2 border-gray-200 bg-white">
                        <div className="font-semibold mb-2 text-black">Device Info</div>
                        <div className="space-y-1">
                          <div className="text-xs text-black">ID: <span className="font-mono">{dev.id}</span></div>
                          <div className="text-xs text-black">Status: <span className="font-semibold">{dev.status?.badge}</span></div>
                          {dev.status?.lastUpdate && (
                            <div className="text-xs text-gray-600 mt-1">Last: {dev.status.lastUpdate}</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : TABS[activeTab].id === 'controls' ? (
              paddies.length === 0 ? (
                <div className="text-center py-12">
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
                      <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-gray-900 mb-1">No paddies connected</p>
                      <p className="text-sm text-gray-600">Add a paddy with a device to start controlling relays and sensors</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Field Controls */}
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="text-base font-bold text-gray-900">Field Controls</div>
                      <div className="text-xs text-gray-600 mt-1">Select an action to control your devices</div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {CONTROL_ACTIONS.map((action) => (
                      <div
                        key={action.id}
                        className="w-full rounded-2xl border-2 border-emerald-100 bg-white px-5 py-4 shadow-sm hover:border-emerald-400 hover:shadow-lg transition-all duration-200 min-h-[64px] flex items-center justify-between gap-4"
                      >
                        <div className="flex-1">
                          <div className="text-sm font-bold text-emerald-700 mb-1">{action.label}</div>
                          <div className="text-xs text-gray-600 line-clamp-2">{action.description}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedActionId(action.id);
                            setIsActionModalOpen(true);
                          }}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg active:scale-95 transition-all duration-200 whitespace-nowrap"
                          aria-label={`Run ${action.label}`}
                        >
                          Run
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Device Logs Section removed from Controls tab to avoid unnecessary fetches */}
                </div>
              )
            ) : (
              <div className="text-black text-center">
                {TABS[activeTab].id === 'logs' && (
                  <LogsControls />
                )}
                {TABS[activeTab].id === 'location' && (
                  <LocationControls devices={deviceData} />
                )}
                {TABS[activeTab].id === 'info' && (
                  <div className="space-y-4">
                    <div className="mb-4">
                      <h3 className="text-lg font-bold text-gray-900 mb-1">Device Summary</h3>
                      <p className="text-sm text-gray-600">Overview of all devices in this field</p>
                    </div>

                    {deviceData.length === 0 ? (
                      <div className="text-center py-12">
                        <div className="flex flex-col items-center gap-4">
                          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
                            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                            </svg>
                          </div>
                          <div>
                            <p className="text-lg font-semibold text-gray-900 mb-1">No devices found</p>
                            <p className="text-sm text-gray-600">Add paddies with devices to see their summary</p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                          <thead>
                            <tr className="bg-gray-100 border-b-2 border-gray-200">
                              <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">Device ID</th>
                              <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">Paddy</th>
                              <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">Status</th>
                              <th className="px-4 py-3 text-center text-xs font-bold text-gray-700 uppercase">Relay 1</th>
                              <th className="px-4 py-3 text-center text-xs font-bold text-gray-700 uppercase">Relay 2</th>
                              <th className="px-4 py-3 text-center text-xs font-bold text-gray-700 uppercase">Relay 3</th>
                              <th className="px-4 py-3 text-center text-xs font-bold text-gray-700 uppercase">Relay 4</th>
                              <th className="px-4 py-3 text-center text-xs font-bold text-gray-700 uppercase">NPK</th>
                              <th className="px-4 py-3 text-center text-xs font-bold text-gray-700 uppercase">GPS</th>
                            </tr>
                          </thead>
                          <tbody>
                            {deviceData.map((dev: any, idx: number) => (
                              <tr key={dev.id} className={`border-b border-gray-200 hover:bg-gray-50 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                                <td className="px-4 py-3">
                                  <div className="font-mono text-xs font-semibold text-gray-900">{dev.id}</div>
                                  <div className="text-[10px] text-gray-500 mt-0.5">{formatTimeAgo(dev.status?.lastUpdate)}</div>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="text-sm font-semibold text-gray-900">{dev.paddyName || `Paddy ${dev.paddyId}`}</div>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    <span className={`inline-block w-2.5 h-2.5 rounded-full ${dev.status?.color === 'green' ? 'bg-green-500' : dev.status?.color === 'yellow' ? 'bg-yellow-400' : 'bg-red-500'}`}></span>
                                    <span className="text-xs font-semibold text-gray-900">{dev.status?.badge || 'Unknown'}</span>
                                  </div>
                                </td>
                                {[1, 2, 3, 4].map((relayNum) => {
                                  const relayState = dev.relayStates?.[relayNum] || 'unknown';
                                  return (
                                    <td key={`relay-${relayNum}`} className="px-4 py-3 text-center">
                                      {relayState === 'on' ? (
                                        <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold bg-green-100 text-green-800 border border-green-200">
                                          ON
                                        </span>
                                      ) : relayState === 'off' ? (
                                        <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold bg-gray-200 text-gray-700 border border-gray-300">
                                          OFF
                                        </span>
                                      ) : (
                                        <span className="text-xs text-gray-400">-</span>
                                      )}
                                    </td>
                                  );
                                })}
                                <td className="px-4 py-3 text-center">
                                  {dev.npk && (dev.npk.n !== undefined || dev.npk.p !== undefined || dev.npk.k !== undefined) ? (
                                    <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                                      Active
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold bg-gray-200 text-gray-600 border border-gray-300">
                                      No data
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-center">
                                  {dev.gps?.lat && dev.gps?.lng ? (
                                    <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                                      Located
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold bg-gray-200 text-gray-600 border border-gray-300">
                                      No data
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Summary Stats */}
                    {deviceData.length > 0 && (
                      <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div className="p-4 rounded-xl bg-green-50 border-2 border-green-200">
                          <div className="text-xs font-semibold text-green-700 mb-1">Online Devices</div>
                          <div className="text-2xl font-black text-green-600">
                            {deviceData.filter((d: any) => d.status?.color === 'green').length}
                          </div>
                        </div>
                        <div className="p-4 rounded-xl bg-yellow-50 border-2 border-yellow-200">
                          <div className="text-xs font-semibold text-yellow-700 mb-1">Issues</div>
                          <div className="text-2xl font-black text-yellow-600">
                            {deviceData.filter((d: any) => d.status?.color === 'yellow').length}
                          </div>
                        </div>
                        <div className="p-4 rounded-xl bg-red-50 border-2 border-red-200">
                          <div className="text-xs font-semibold text-red-700 mb-1">Offline</div>
                          <div className="text-2xl font-black text-red-600">
                            {deviceData.filter((d: any) => d.status?.color === 'red').length}
                          </div>
                        </div>
                        <div className="p-4 rounded-xl bg-blue-50 border-2 border-blue-200">
                          <div className="text-xs font-semibold text-blue-700 mb-1">Total Devices</div>
                          <div className="text-2xl font-black text-blue-600">
                            {deviceData.length}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {TABS[activeTab].id === 'settings' && (
                  <span>Configuration options will appear here.</span>
                )}
              </div>
            )
          }
        </div>
      </div>
    </div>
  );
}

// TabBar component - horizontal tabs connected to the panel header
function TabBar({ activeTab, setActiveTab }: { activeTab: number; setActiveTab: (i: number) => void; }) {
  return (
    <div className="flex w-full flex-wrap border-b-2 border-gray-200 bg-white/90">
      {TABS.map((tab, idx) => (
        <button
          key={tab.id}
          className={`flex-1 sm:flex-none px-3 sm:px-5 h-12 flex items-center justify-center text-xs sm:text-sm font-bold whitespace-nowrap transition-all duration-200 border-b-4
            ${activeTab === idx
              ? 'border-emerald-500 text-emerald-600 bg-white shadow-sm'
              : 'border-transparent text-gray-600 hover:text-emerald-600 hover:border-emerald-200 hover:bg-emerald-50/50 active:scale-95'}
          `}
          onClick={() => setActiveTab(idx)}
          tabIndex={0}
          role="tab"
          aria-selected={activeTab === idx}
          aria-label={tab.label}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

interface ActionRunnerModalProps {
  actionId: ControlActionId;
  onClose: () => void;
  devices: Array<{ id: string; label: string }>;
  userId: string | null;
}

function ActionRunnerModal({ actionId, onClose, devices, userId }: ActionRunnerModalProps) {
  const action = CONTROL_ACTIONS.find((a) => a.id === actionId);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Record<string, { status: 'idle' | 'running' | 'success' | 'error'; message: string }>>({});
  const [isRunning, setIsRunning] = useState(false);
  const [relayNumber, setRelayNumber] = useState(1);

  useEffect(() => {
    const initialSelected: Record<string, boolean> = {};
    devices.forEach((d) => {
      initialSelected[d.id] = true;
    });
    setSelected(initialSelected);
    setResults({});
    setIsRunning(false);
  }, [devices, actionId]);

  if (!action) return null;

  const handleToggleDevice = (id: string) => {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleRun = async () => {
    if (!userId) {
      alert('You must be signed in to run device commands.');
      return;
    }
    const targetIds = devices.map((d) => d.id).filter((id) => selected[id]);
    if (targetIds.length === 0) {
      alert('Please select at least one device.');
      return;
    }

    setIsRunning(true);
    setResults((prev) => {
      const next = { ...prev };
      targetIds.forEach((id) => {
        next[id] = { status: 'running', message: 'Sending command…' };
      });
      return next;
    });

    await Promise.all(
      targetIds.map(async (deviceId) => {
        const params: Record<string, any> = {};

        if (action.role === 'relay') {
          params.relay = relayNumber;
        }
        if (action.role === 'motor' && (action.action === 'extend' || action.action === 'retract')) {
          params.duration = 5000; // 5s default, consistent with device page
        }
        if (action.role === 'npk' && action.action === 'scan') {
          // Duration handled on-device; optional hint only
          params.duration = 30000;
        }

        try {
          const res = await sendDeviceCommand(
            deviceId,
            action.nodeId,
            action.role,
            action.action,
            params,
            userId
          );

          setResults((prev) => ({
            ...prev,
            [deviceId]: {
              status: res.success ? 'success' : 'error',
              message: res.message || (res.success ? 'Success' : 'Failed'),
            },
          }));

          // Log control action - wrapped in try-catch to prevent breaking the UI
          try {
            await logControlAction({
              deviceId,
              action: `${action.role}:${action.action}`,
              details: {
                via: 'field-control-modal',
                relay: params.relay,
                duration: params.duration,
                success: res.success,
                status: res.status,
                message: res.message,
              },
            });
          } catch (logError) {
            console.warn('Failed to log control action (non-critical):', logError);
          }
        } catch (e: any) {
          const msg = e instanceof Error ? e.message : String(e);
          setResults((prev) => ({
            ...prev,
            [deviceId]: { status: 'error', message: `Error: ${msg}` },
          }));
          
          // Log error - wrapped in try-catch to prevent breaking the UI
          try {
            await logControlAction({
              deviceId,
              action: `${action.role}:${action.action}`,
              details: { via: 'field-control-modal', error: msg },
            });
          } catch (logError) {
            console.warn('Failed to log error (non-critical):', logError);
          }
        }
      })
    );

    setIsRunning(false);
  };

  const anySelected = devices.some((d) => selected[d.id]);

  return (
    <>
      {/* Glassmorphism-style overlay reused from Add Paddy modal */}
      <div
        onClick={onClose}
        className="fixed inset-0 backdrop-blur-sm bg-black/20 z-40 transition-all"
      />

      {/* Bottom sheet container, matching Add Paddy modal structure */}
      <div className="fixed inset-x-0 bottom-0 z-50 animate-slide-up">
        <div className="bg-white rounded-t-3xl shadow-2xl h-[85vh] flex flex-col border-t-4 border-green-500">
          {/* Handle bar */}
          <div className="flex justify-center pt-3 pb-3">
            <div className="w-12 h-1.5 bg-green-300 rounded-full" />
          </div>

          {/* Modal header */}
          <div className="px-5 pb-2 flex items-center justify-between">
          <div>
              <div className="text-base font-semibold text-black">{action.label}</div>
              <div className="text-xs text-gray-600 mt-0.5 max-w-xs">{action.description}</div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-gray-500 hover:text-gray-800 px-3 py-1.5 rounded-lg hover:bg-gray-100"
            >
              Close
            </button>
          </div>

          {/* Modal body */}
          <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-3">
            {action.requiresRelay && (
              <div className="flex items-center gap-2 text-xs">
                <span className="font-semibold text-black">Relay:</span>
                <select
                  className="border border-gray-300 rounded-md px-2 py-1 text-xs bg-white"
                  value={relayNumber}
                  onChange={(e) => setRelayNumber(Number(e.target.value) || 1)}
                >
                  {[1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>{`Relay ${n}`}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="min-w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="w-10 px-2 py-2 text-left">
                      <input
                        type="checkbox"
                        className="w-3 h-3"
                        checked={anySelected && devices.every((d) => selected[d.id])}
                        onChange={(e) => {
                          const next: Record<string, boolean> = {};
                          devices.forEach((d) => {
                            next[d.id] = e.target.checked;
                          });
                          setSelected(next);
                        }}
                      />
                    </th>
                    <th className="px-2 py-2 text-left font-semibold text-gray-700">Device</th>
                    <th className="px-2 py-2 text-left font-semibold text-gray-700">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {devices.map((d) => {
                    const row = results[d.id];
                    return (
                      <tr key={d.id} className="border-b border-gray-100 last:border-b-0">
                        <td className="px-2 py-1.5 align-top">
                          <input
                            type="checkbox"
                            className="w-3 h-3 mt-0.5"
                            checked={!!selected[d.id]}
                            onChange={() => handleToggleDevice(d.id)}
                          />
                        </td>
                        <td className="px-2 py-1.5 align-top">
                          <div className="text-xs font-semibold text-black">{d.label}</div>
                          <div className="text-[11px] text-gray-500 font-mono break-all">{d.id}</div>
                        </td>
                        <td className="px-2 py-1.5 align-top">
                          {!row && <span className="text-[11px] text-gray-400">Waiting…</span>}
                          {row && row.status === 'running' && (
                            <span className="text-[11px] text-blue-600 flex items-center gap-1">
                              <span className="inline-block w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                              Running…
                            </span>
                          )}
                          {row && row.status === 'success' && (
                            <span className="text-[11px] text-green-700">{row.message}</span>
                          )}
                          {row && row.status === 'error' && (
                            <span className="text-[11px] text-red-600">{row.message}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-gray-200 flex items-center justify-between">
            <div className="text-[11px] text-gray-600">
              {anySelected ? `${devices.filter((d) => selected[d.id]).length} device(s) selected` : 'No devices selected'}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-xs rounded-md border border-gray-300 text-gray-700 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRun}
                disabled={!anySelected || isRunning}
                className={`px-3 py-1.5 text-xs rounded-md font-semibold text-white flex items-center gap-1 ${
                  !anySelected || isRunning
                    ? 'bg-emerald-300 cursor-not-allowed'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {isRunning && (
                  <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                )}
                <span>{isRunning ? 'Running…' : 'Run command'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// LocationControls component
function LocationControls({ devices }: { devices: Array<{ id: string; label?: string; status?: any; gps?: any; npk?: any; paddyName?: string }> }) {
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [loadingDevices, setLoadingDevices] = useState<Record<string, boolean>>({});
  const { user } = useAuth();

  useEffect(() => {
    const init: Record<string, boolean> = {};
    devices.forEach((d) => (init[d.id] = false));
    setSelected(init);
  }, [devices]);

  const toggleSelect = (id: string) => {
    setSelected((s) => ({ ...s, [id]: !s[id] }));
  };

  const requestLocationFor = async (id: string) => {
    setLoadingDevices((prev) => ({ ...prev, [id]: true }));
    try {
      const res = await sendDeviceCommand(id, 'ESP32B', 'gps', 'read', {}, user?.uid || '');
      
      try {
        await logControlAction({
          deviceId: id,
          action: 'location:fetch',
          details: { success: res.success, message: res.message }
        });
      } catch (logError) {
        console.warn('Failed to log control action (non-critical):', logError);
      }
    } catch (e) {
      console.error('requestLocationFor error', e);
    } finally {
      setLoadingDevices((prev) => ({ ...prev, [id]: false }));
    }
  };

  const requestSelected = async () => {
    const ids = Object.keys(selected).filter((id) => selected[id]);
    if (ids.length === 0) {
      alert('Please select at least one device.');
      return;
    }
    await Promise.all(ids.map((id) => requestLocationFor(id)));
  };

  return (
    <div className="text-black">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-gray-900">Device Locations</h3>
          <p className="text-sm text-gray-600 mt-1">View GPS coordinates from your devices</p>
        </div>
        <button 
          onClick={requestSelected}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:bg-gray-400"
        >
          Fetch Selected
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {devices.map((dev) => (
          <div key={dev.id} className="p-4 border-2 border-gray-200 rounded-xl bg-white hover:border-blue-300 transition-colors">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3 flex-1">
                <input
                  type="checkbox"
                  checked={!!selected[dev.id]}
                  onChange={() => toggleSelect(dev.id)}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <h4 className="font-semibold text-gray-900">{dev.paddyName || dev.label || dev.id}</h4>
                  <p className="text-xs text-gray-500 font-mono">{dev.id}</p>
                </div>
              </div>
              <MapPin className="w-5 h-5 text-blue-600 flex-shrink-0" />
            </div>

            {loadingDevices[dev.id] ? (
              <div className="flex items-center gap-2 text-sm text-gray-600 py-3">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                <span>Requesting location...</span>
              </div>
            ) : dev.gps?.lat && dev.gps?.lng ? (
              <div className="space-y-2">
                <div className="space-y-1">
                  <div className="text-sm text-gray-700">
                    <span className="font-medium">Latitude:</span>
                    <span className="ml-2 font-mono">{dev.gps.lat.toFixed(6)}</span>
                  </div>
                  <div className="text-sm text-gray-700">
                    <span className="font-medium">Longitude:</span>
                    <span className="ml-2 font-mono">{dev.gps.lng.toFixed(6)}</span>
                  </div>
                  {dev.gps.ts && (
                    <div className="text-xs text-gray-500 mt-1">
                      Last updated: {formatTimeAgo(dev.gps.ts)}
                    </div>
                  )}
                </div>
                <a
                  href={`https://www.google.com/maps?q=${dev.gps.lat},${dev.gps.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium hover:underline"
                >
                  <MapPin className="w-4 h-4" />
                  Open in Google Maps
                </a>
              </div>
            ) : (
              <div className="text-sm text-gray-500 py-3">
                No GPS data available. Select and fetch to request location.
              </div>
            )}
          </div>
        ))}
      </div>

      {devices.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          No devices found in this field.
        </div>
      )}
    </div>
  );
}

// LogsControls — reads from Firestore actions/{userId}/userActions collection and paginates entries (10 per page)
// Expected Firestore shape:
// actions/{userId}/userActions/{docId} = { timestamp: Timestamp, deviceId?: string, action: string, details?: any }
function LogsControls() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<Array<any>>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const perPage = 10;

  useEffect(() => {
    if (!user?.uid) {
      setEntries([]);
      setLoading(false);
      return;
    }

    // Read from Firestore actions/{userId}/userActions collection
    const actionsRef = collection(db, 'actions', user.uid, 'userActions');
    const q = query(actionsRef, orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      console.log(`[Logs] Fetched ${snapshot.docs.length} documents from Firestore`);
      const arr = snapshot.docs.map((doc) => {
        const data = doc.data();
        console.log(`[Logs] Document ${doc.id}:`, data);
        return {
          id: doc.id,
          ...data,
          timestamp: data.timestamp?.toMillis() || data.createdAt || Date.now()
        };
      });
      console.log(`[Logs] Processed ${arr.length} entries for display, Total entries:`, arr);
      setEntries(arr);
      setLoading(false);
      if (page >= Math.ceil(arr.length / perPage)) {
        setPage(0);
      }
    });

    return () => unsubscribe();
  }, [user?.uid]);

  const totalPages = Math.max(1, Math.ceil(entries.length / perPage));
  const visible = entries.slice(page * perPage, page * perPage + perPage);

  return (
    <div className="text-black">
      <div className="mb-4 flex items-center justify-between">
        <div className="font-semibold">Control Panel History</div>
        <div className="text-sm text-gray-600">Total: {entries.length}</div>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-600">Loading logs...</div>
      ) : (
        <>
      <div className="space-y-3">
        {visible.length === 0 && <div className="text-black">No history available.</div>}
        {visible.map((e) => {
          const details = e.details || {};
          const isError = details.error || details.status === 'error' || details.status === 'timeout' || details.status === 'failed';
          const isSuccess = details.success || details.status === 'success' || details.status === 'completed';
          
          return (
            <div 
              key={e.id} 
              className={`p-3 rounded-lg border-2 transition-all ${
                isError ? 'bg-red-50 border-red-200' : 
                isSuccess ? 'bg-green-50 border-green-200' : 
                'bg-white border-gray-200'
              }`}
            >
              {/* Header: Action and Time */}
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-900 truncate">{e.action}</div>
                  <div className="text-xs text-gray-600 mt-0.5">
                    Device: <span className="font-mono">{e.deviceId || 'N/A'}</span>
                  </div>
                </div>
                <div className="text-[10px] text-gray-500 whitespace-nowrap">
                  {e.timestamp ? formatTimeAgo(e.timestamp) : ''}
                </div>
              </div>

              {/* Status Badge */}
              {details.status && (
                <div className="mb-2">
                  <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    isError ? 'bg-red-100 text-red-700 border border-red-300' :
                    isSuccess ? 'bg-green-100 text-green-700 border border-green-300' :
                    'bg-gray-100 text-gray-700 border border-gray-300'
                  }`}>
                    {details.status.toUpperCase()}
                  </span>
                </div>
              )}

              {/* Message */}
              {details.message && (
                <div className={`text-xs mb-1 ${
                  isError ? 'text-red-700 font-medium' :
                  isSuccess ? 'text-green-700' :
                  'text-gray-700'
                }`}>
                  {details.message}
                </div>
              )}

              {/* Error Details */}
              {details.error && (
                <div className="text-xs text-red-600 bg-red-100 rounded p-2 mb-1 font-mono">
                  {details.error}
                </div>
              )}

              {/* Additional Details */}
              <div className="text-[10px] text-gray-600 space-y-0.5">
                {details.via && (
                  <div>Source: <span className="font-medium">{details.via}</span></div>
                )}
                {details.relay && (
                  <div>Relay: <span className="font-medium">#{details.relay}</span></div>
                )}
                {details.duration && (
                  <div>Duration: <span className="font-medium">{details.duration}ms</span></div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="text-sm text-black">Page {page + 1} / {totalPages}</div>
        <div className="flex items-center gap-2">
          <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="py-1 px-2 bg-gray-200 rounded">Prev</button>
          <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="py-1 px-2 bg-gray-200 rounded">Next</button>
        </div>
      </div>
        </>
      )}
    </div>
  );
}

// DeviceLogsSection - Shows recent device actions from Cloud Functions
function DeviceLogsSection({ fieldId }: { fieldId: string }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true);
      try {
        const result = await getFieldLogs(fieldId, 50);
        if (result.success) {
          setLogs(result.logs || []);
        } else {
          // Treat as empty rather than surfacing console errors
          setLogs([]);
        }
      } catch (_error: any) {
        // Suppress noisy console errors; just show empty state
        setLogs([]);
      } finally {
        setLoading(false);
      }
    };

    if (fieldId) {
      fetchLogs();
      // Refresh logs every 30 seconds
      const interval = setInterval(fetchLogs, 30000);
      return () => clearInterval(interval);
    } else {
      setLoading(false);
      setLogs([]);
    }
  }, [fieldId]);

  const displayLogs = showAll ? logs : logs.slice(0, 5);

  const getActionIcon = (actionType: string) => {
    switch (actionType) {
      case 'relay': return '⚡';
      case 'motor': return '🔧';
      case 'npk': return '🧪';
      case 'gps': return '📍';
      default: return '📝';
    }
  };

  const getResultColor = (result: string) => {
    switch (result) {
      case 'success': return 'text-green-600 bg-green-50 border-green-200';
      case 'failed': return 'text-red-600 bg-red-50 border-red-200';
      case 'timeout': return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'pending': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-bold text-gray-900">Device Action Logs</h3>
          <p className="text-xs text-gray-600 mt-1">Recent device control actions</p>
        </div>
        {logs.length > 5 && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-xs font-semibold text-emerald-600 hover:text-emerald-700"
          >
            {showAll ? 'Show Less' : `Show All (${logs.length})`}
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
          <p className="text-sm text-gray-600 mt-2">Loading logs...</p>
        </div>
      ) : displayLogs.length === 0 ? (
        <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-gray-200">
          <p className="text-sm text-gray-600">No device actions yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {displayLogs.map((log: any, index: number) => (
            <div
              key={log.id || index}
              className="p-3 rounded-lg bg-white border-2 border-gray-100 hover:border-gray-200 transition-all"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">{getActionIcon(log.actionType)}</span>
                    <span className="text-sm font-semibold text-gray-900 truncate">{log.action}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getResultColor(log.result)}`}>
                      {log.result || 'pending'}
                    </span>
                  </div>
                  <div className="text-xs text-gray-600 space-y-0.5">
                    <div>Device: <span className="font-mono">{log.deviceId}</span></div>
                    {log.nodeId && <div>Node: <span className="font-semibold">{log.nodeId}</span></div>}
                    {log.params && Object.keys(log.params).length > 0 && (
                      <div className="font-mono text-[10px] text-gray-500">
                        {JSON.stringify(log.params)}
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-[10px] text-gray-500 whitespace-nowrap">
                  {log.timestamp ? formatTimeAgo(log.timestamp) : 'Unknown'}
                </div>
              </div>
              {log.error && (
                <div className="mt-2 text-xs text-red-600 bg-red-50 rounded p-2">
                  Error: {log.error}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
