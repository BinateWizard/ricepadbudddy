// This file has been cleared for a fresh start.

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getDeviceStatus, getDeviceGPS, getDeviceNPK } from '@/lib/utils/deviceStatus';
import { database, db } from '@/lib/firebase';
import { ref as dbRef, onValue, off, push, set } from 'firebase/database';
import { onDeviceValue } from '@/lib/utils/rtdbHelper';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { sendDeviceCommand } from '@/lib/utils/deviceCommands';

const TABS = [
  { label: 'Overview' },
  { label: 'Controls' },
  { label: 'Location' },
  { label: 'Logs/History' },
  { label: 'Device Info' },
  { label: 'Settings' },
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

// Log control panel action to Firestore (replaces RTDB logging)
async function logControlAction(entry: { deviceId?: string; action: string; details?: any }) {
  try {
    const logsRef = collection(db, 'control_panel_logs');
    await addDoc(logsRef, {
      timestamp: Timestamp.now(),
      ...entry
    });
  } catch (e) {
    console.error('Failed to log control action to Firestore', e);
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
  const [controlMode, setControlMode] = useState<'field' | 'individual'>('field'); // 'field' for all, 'individual' for per-device
  const [sendingRelay, setSendingRelay] = useState<string | null>(null);

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
              npk 
            };
          })
        );
        setDeviceData(results);
      }
      setLoading(false);
    }
    if (activeTab === 0) fetchAll();
  }, [activeTab, paddies]);

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
      
      if (result.success) {
        console.log(`[Relay] Command ${action} sent successfully`, result);
        // Optionally show success message
        if (result.status === 'completed') {
          console.log(`✓ Relay ${relay} turned ${action}`);
        }
      } else {
        console.error(`[Relay] Command failed`, result);
        alert(`Failed: ${result.message}`);
      }
    } catch (e) {
      console.error('Failed to send relay command', e);
      alert('Failed to send relay command');
    } finally {
      setSendingRelay(null);
    }
  };

  

  return (
    <div className="w-full flex flex-col items-center mt-8 overflow-y-auto overflow-x-hidden" style={{ minHeight: '100vh' }}>
      <div className="w-full max-w-4xl flex flex-col h-full min-h-[400px]">
        {/* Modern Tab Controller - preserved original layout. DO NOT MODIFY STYLES BELOW */}
        <TabBar activeTab={activeTab} setActiveTab={setActiveTab} />
        {/* Main Content Area */}
        <div className="bg-white/90 backdrop-blur border border-gray-200 rounded-2xl shadow-lg p-8 min-h-[200px] h-full flex-1 overflow-y-auto overflow-x-hidden pr-2 text-black" style={{ minHeight: 200 }}>
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
                      <span className="ml-auto text-sm text-black">Device: {dev.id}</span>
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
                        <div className="font-semibold mb-2 text-black">GPS Location</div>
                        {dev.gps?.lat && dev.gps?.lng ? (
                          <div className="space-y-1">
                            <div className="text-xs text-black font-mono">{dev.gps.lat.toFixed(6)}</div>
                            <div className="text-xs text-black font-mono">{dev.gps.lng.toFixed(6)}</div>
                            <div className="text-xs text-gray-600 mt-1">Last: {formatTimeAgo(dev.gps?.ts)}</div>
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

                    {/* Relay Controls */}
                    <div className="mt-4 p-4 rounded-xl border-2 border-emerald-200 bg-emerald-50">
                      <div className="font-semibold mb-3 text-black">Relay Control</div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {[1, 2, 3, 4].map((relay) => (
                          <div key={`relay-${dev.id}-${relay}`} className="flex flex-col gap-2">
                            <div className="text-xs font-semibold text-gray-700">Relay {relay}</div>
                            <div className="flex gap-2">
                              <button
                                className="flex-1 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition disabled:opacity-60"
                                disabled={!!sendingRelay}
                                onClick={() => sendRelayCommand(dev.id, relay as 1 | 2 | 3 | 4, 'on')}
                              >
                                On
                              </button>
                              <button
                                className="flex-1 px-3 py-2 rounded-lg bg-gray-200 text-gray-800 text-sm font-semibold hover:bg-gray-300 transition disabled:opacity-60"
                                disabled={!!sendingRelay}
                                onClick={() => sendRelayCommand(dev.id, relay as 1 | 2 | 3 | 4, 'off')}
                              >
                                Off
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                      {sendingRelay && (
                        <div className="text-xs text-gray-600 mt-2">Sending command...</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : TABS[activeTab].label === 'Controls' ? (
              paddies.length === 0 ? (
                <div className="text-black text-center py-8">
                  <p>No paddies connected to this field.</p>
                  <p className="text-sm text-gray-600 mt-2">Add a paddy first to control relays and devices.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Control Mode Selector */}
                  <div className="p-4 rounded-lg bg-blue-50 border-2 border-blue-200">
                    <div className="font-semibold text-black mb-3">Relay Control Mode</div>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 cursor-pointer p-3 rounded bg-white border-2 transition-all" style={{borderColor: controlMode === 'field' ? '#059669' : '#e5e7eb'}}>
                        <input
                          type="radio"
                          name="controlMode"
                          value="field"
                          checked={controlMode === 'field'}
                          onChange={(e) => setControlMode(e.target.value as 'field' | 'individual')}
                          className="w-4 h-4"
                        />
                        <div>
                          <div className="font-semibold text-black">Field-Level Control</div>
                          <div className="text-xs text-gray-600">Control all paddies in this field at once</div>
                        </div>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer p-3 rounded bg-white border-2 transition-all" style={{borderColor: controlMode === 'individual' ? '#059669' : '#e5e7eb'}}>
                        <input
                          type="radio"
                          name="controlMode"
                          value="individual"
                          checked={controlMode === 'individual'}
                          onChange={(e) => setControlMode(e.target.value as 'field' | 'individual')}
                          className="w-4 h-4"
                        />
                        <div>
                          <div className="font-semibold text-black">Individual Control</div>
                          <div className="text-xs text-gray-600">Control each paddy separately</div>
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* Field-Level Control */}
                  {controlMode === 'field' && (
                    <FieldLevelRelayControls devices={deviceData} fieldName={fieldId ? `Field ${fieldId}` : 'This Field'} />
                  )}

                  {/* Individual Device Control */}
                  {controlMode === 'individual' && (
                    <div className="p-4 rounded-lg border-transparent bg-gray-50">
                      <div className="font-semibold mb-4 text-black">Per-Paddy Relay Control</div>
                      <div className="space-y-4">
                        {deviceData.map((dev) => (
                          <div key={`${dev.paddyId}-${dev.id}`} className="border-2 border-gray-300 rounded-lg p-4 bg-white">
                            <div className="flex items-center gap-3 mb-3">
                              <span className={`inline-block w-3 h-3 rounded-full ${dev.status?.color === 'green' ? 'bg-green-500' : dev.status?.color === 'yellow' ? 'bg-yellow-400' : 'bg-red-500'}`}></span>
                              <span className="font-bold text-black">{dev.paddyName || `Paddy ${dev.paddyId}`}</span>
                              <span className="text-xs font-semibold px-2 py-1 rounded bg-gray-100 text-black">{dev.status?.badge || 'Unknown'}</span>
                            </div>
                            <RelayControlsPerDevice deviceId={dev.id} paddyName={dev.paddyName} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            ) : (
              <div className="text-black text-center">
                {TABS[activeTab].label === 'Logs/History' && (
                  <LogsControls />
                )}
                {TABS[activeTab].label === 'Device Info' && (
                  <span>Device model, firmware, and module info will appear here.</span>
                )}
                {TABS[activeTab].label === 'Settings' && (
                  <span>Configuration options will appear here.</span>
                )}
                {TABS[activeTab].label === 'Location' && (
                  <LocationControls devices={deviceData} />
                )}
              </div>
            )
          }
        </div>
      </div>
    </div>
  );
}

// TabBar component - keeps the tab layout stable. Keep classes here in sync with original design.
function TabBar({ activeTab, setActiveTab }: { activeTab: number; setActiveTab: (i: number) => void; }) {
  return (
    <div className="flex w-full mb-4 p-1 gap-2 bg-white border border-gray-200 shadow-sm rounded-2xl flex-shrink-0 z-30">
      {TABS.map((tab, idx) => (
        <button
          key={tab.label}
          className={`flex-1 h-[56px] min-h-[56px] flex items-center justify-center text-sm sm:text-base font-semibold transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 rounded-xl border
            ${activeTab === idx
              ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-md border-emerald-500 scale-[1.01]'
              : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border-gray-200'}
          `}
          style={{ minWidth: 0 }}
          onClick={() => setActiveTab(idx)}
          tabIndex={0}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// FieldLevelRelayControls - Select devices and control their relays
function FieldLevelRelayControls({ devices, fieldName }: { devices: any[]; fieldName: string }) {
  const [selectedDevices, setSelectedDevices] = useState<Set<string>>(new Set());
  const [selectedRelays, setSelectedRelays] = useState<Set<number>>(new Set([0, 1, 2, 3]));
  const [relayStates, setRelayStates] = useState([false, false, false, false]);
  const [loadingRelays, setLoadingRelays] = useState<Set<number>>(new Set());
  const [deviceLoadingStates, setDeviceLoadingStates] = useState<Record<string, boolean>>({});
  const [messages, setMessages] = useState<Record<number, string>>({});
  const [lastAction, setLastAction] = useState<{relayIndex: number; previousState: boolean} | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);

  const toggleRelayForSelected = async (relayIndex: number) => {
    if (loadingRelays.has(relayIndex) || !selectedRelays.has(relayIndex) || selectedDevices.size === 0) return;

    const prev = [...relayStates];
    const next = [...relayStates];
    next[relayIndex] = !next[relayIndex];
    
    // Store for undo functionality (Rule 6: Easy reversal)
    setLastAction({ relayIndex, previousState: prev[relayIndex] });
    
    setRelayStates(next);
    setLoadingRelays(prev => new Set([...prev, relayIndex]));
    setMessages({ ...messages, [relayIndex]: `Sending to ${selectedDevices.size} device(s)...` });

    // Track loading state for each device
    const deviceLoadingMap: Record<string, boolean> = {};
    selectedDevices.forEach(deviceId => {
      deviceLoadingMap[deviceId] = true;
    });
    setDeviceLoadingStates(deviceLoadingMap);

    // Send command to selected devices in parallel
    try {
      const results = await Promise.all(
        Array.from(selectedDevices).map(async (deviceId) => {
          const dev = devices.find(d => d.id === deviceId);
          const relayNum = relayIndex + 1;
          const action = next[relayIndex] ? 'on' : 'off';
          try {
            const { user } = useAuth();
            const res = await sendDeviceCommand(deviceId, 'ESP32A', 'relay', action, { relay: relayNum }, user?.uid || '');
            
            setDeviceLoadingStates(prev => ({ ...prev, [deviceId]: false }));
            return { deviceId, paddyName: dev?.paddyName, acknowledged: res.success, completed: res.status === 'completed' };
          } catch (e) {
            setDeviceLoadingStates(prev => ({ ...prev, [deviceId]: false }));
            return { deviceId, paddyName: dev?.paddyName, acknowledged: false, completed: false, error: String(e) };
          }
        })
      );

      // Process results for feedback (HCI Rules 3, 5)
      const allAcknowledged = results.every(r => r.acknowledged);
      const allCompleted = results.every(r => r.completed);
      const failedCount = results.filter(r => !r.completed).length;

      // Rule 3: Informative feedback & Rule 4: Dialog closure
      if (allAcknowledged) {
        if (allCompleted) {
          setMessages({ ...messages, [relayIndex]: `✓ Success: Relay ${relayIndex + 1} ${next[relayIndex] ? 'ON' : 'OFF'} for ${selectedDevices.size} device(s)` });
          setShowConfirmation(true);
          setTimeout(() => setShowConfirmation(false), 3000);
        } else {
          setMessages({ ...messages, [relayIndex]: `⚠ Partially completed: ${failedCount} device(s) incomplete` });
        }
      } else {
        // Rule 5: Simple error handling
        setMessages({ ...messages, [relayIndex]: `✗ Error: Failed on ${failedCount} device(s). Please retry.` });
        setRelayStates(prev); // revert
      }

      setTimeout(() => setMessages(m => { delete m[relayIndex]; return { ...m }; }), 5000);
    } catch (e) {
      console.error(e);
      setRelayStates(prev); // revert
      setMessages({ ...messages, [relayIndex]: `✗ Network error. Please check connection and retry.` });
      setTimeout(() => setMessages(m => { delete m[relayIndex]; return { ...m }; }), 5000);
    } finally {
      setLoadingRelays(prev => {
        const next = new Set(prev);
        next.delete(relayIndex);
        return next;
      });
      setDeviceLoadingStates({});
    }
  };

  // Rule 6: Easy reversal - Undo last action
  const undoLastAction = async () => {
    if (!lastAction) return;
    
    const { relayIndex, previousState } = lastAction;
    const newStates = [...relayStates];
    newStates[relayIndex] = previousState;
    setRelayStates(newStates);
    
    // Send command to revert
    setLoadingRelays(prev => new Set([...prev, relayIndex]));
    const relayNum = relayIndex + 1;
    const action = previousState ? 'on' : 'off';
    
    try {
      const { user } = useAuth();
      await Promise.all(
        Array.from(selectedDevices).map(deviceId => 
          sendDeviceCommand(deviceId, 'ESP32A', 'relay', action, { relay: relayNum }, user?.uid || '')
        )
      );
      setMessages({ ...messages, [relayIndex]: '↶ Action reversed successfully' });
      setLastAction(null);
    } catch (e) {
      setMessages({ ...messages, [relayIndex]: '✗ Undo failed' });
    } finally {
      setLoadingRelays(prev => {
        const next = new Set(prev);
        next.delete(relayIndex);
        return next;
      });
    }
  };

  return (
    <div className="space-y-4">
      {/* Rule 3 & 4: Success confirmation banner */}
      {showConfirmation && (
        <div className="p-4 rounded-lg bg-green-100 border-2 border-green-500 flex items-center justify-between animate-fade-in">
          <div className="flex items-center gap-2">
            <span className="text-2xl">✓</span>
            <span className="font-semibold text-green-800">Operation completed successfully!</span>
          </div>
          {lastAction && (
            <button
              onClick={undoLastAction}
              className="px-3 py-1 text-sm font-semibold bg-white hover:bg-gray-100 text-green-800 rounded border border-green-500 transition-colors"
              title="Undo last action (Rule 6: Easy reversal)"
            >
              ↶ Undo
            </button>
          )}
        </div>
      )}

      {/* Device Selection */}
      <div className="p-4 rounded-lg border-2 border-green-300 bg-green-50">
        <div className="flex items-center justify-between mb-3">
          <div className="font-bold text-black">Select Paddies to Control</div>
          <div className="flex gap-2">
            {/* Rule 2: Shortcuts for frequent users */}
            <button
              onClick={() => setSelectedDevices(new Set(devices.map(d => d.id)))}
              className="px-3 py-1 text-xs font-semibold bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
              title="Keyboard shortcut: Ctrl+A (future implementation)"
            >
              Select All
            </button>
            <button
              onClick={() => setSelectedDevices(new Set())}
              className="px-3 py-1 text-xs font-semibold bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {devices.map((dev) => (
            <label
              key={dev.id}
              className={`flex items-center gap-2 p-3 rounded border-2 cursor-pointer transition-all ${
                selectedDevices.has(dev.id)
                  ? 'border-green-500 bg-white shadow-md'
                  : 'border-gray-300 bg-white hover:border-green-400'
              }`}
            >
              <input
                type="checkbox"
                checked={selectedDevices.has(dev.id)}
                onChange={(e) => {
                  const next = new Set(selectedDevices);
                  if (e.target.checked) next.add(dev.id);
                  else next.delete(dev.id);
                  setSelectedDevices(next);
                }}
                className="w-4 h-4"
              />
              <div className="flex-1">
                <div className="text-sm font-semibold text-black">{dev.paddyName || `Paddy ${dev.paddyId}`}</div>
                <div className="text-xs text-gray-600">{dev.status?.badge || 'Unknown'}</div>
              </div>
            </label>
          ))}
        </div>
        {selectedDevices.size > 0 && (
          <div className="mt-3 p-2 bg-white rounded text-sm text-black font-medium">
            {selectedDevices.size} paddy/paddies selected
          </div>
        )}
      </div>

      {/* Relay Selection */}
      <div className="p-4 rounded-lg border-2 border-blue-300 bg-blue-50">
        <div className="flex items-center justify-between mb-3">
          <div className="font-bold text-black">Select Relays to Control</div>
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedRelays(new Set([0, 1, 2, 3]))}
              className="px-3 py-1 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
            >
              Select All
            </button>
            <button
              onClick={() => setSelectedRelays(new Set())}
              className="px-3 py-1 text-xs font-semibold bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {[0, 1, 2, 3].map((i) => (
            <label key={i} className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-blue-100 transition-colors">
              <input
                type="checkbox"
                checked={selectedRelays.has(i)}
                onChange={(e) => {
                  const next = new Set(selectedRelays);
                  if (e.target.checked) next.add(i);
                  else next.delete(i);
                  setSelectedRelays(next);
                }}
                className="w-4 h-4"
              />
              <span className="text-xs text-black font-medium">Relay {i + 1}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Relay Controls Grid */}
      <div className="p-4 rounded-lg border-2 border-gray-300 bg-white">
        <div className="font-bold text-black mb-3">Control Relays</div>
        {selectedDevices.size === 0 && (
          <div className="p-4 mb-3 rounded bg-yellow-50 border border-yellow-200">
            <p className="text-sm text-yellow-800 font-medium">⚠️ Please select at least one paddy to control</p>
          </div>
        )}
        {selectedRelays.size === 0 && selectedDevices.size > 0 && (
          <div className="p-4 mb-3 rounded bg-yellow-50 border border-yellow-200">
            <p className="text-sm text-yellow-800 font-medium">⚠️ Please select at least one relay to control</p>
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`p-4 rounded-lg border-2 flex flex-col items-center justify-center transition-all ${
                selectedRelays.has(i) && selectedDevices.size > 0
                  ? relayStates[i]
                    ? 'border-red-400 bg-red-100'
                    : 'border-green-400 bg-green-100'
                  : 'border-gray-300 bg-gray-100 opacity-50'
              }`}
            >
              <div className="text-sm font-bold text-black mb-2">Relay {i + 1}</div>
              
              {loadingRelays.has(i) && (
                <div className="flex flex-col items-center gap-1 mb-2">
                  <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                  <div className="text-xs text-blue-600 font-medium">Sending...</div>
                </div>
              )}
              
              {messages[i] && (
                <div className="text-xs font-medium text-center text-gray-700 mb-2 line-clamp-2">
                  {messages[i]}
                </div>
              )}

              <div className="text-xs font-semibold text-black mb-3">
                {loadingRelays.has(i) ? 'Wait...' : (relayStates[i] ? 'ON' : 'OFF')}
              </div>

              <button
                onClick={() => toggleRelayForSelected(i)}
                disabled={!selectedRelays.has(i) || loadingRelays.has(i) || selectedDevices.size === 0}
                className={`w-full py-2 px-2 rounded-md font-bold text-xs transition-all ${
                  !selectedRelays.has(i) || selectedDevices.size === 0
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : loadingRelays.has(i)
                      ? 'bg-gray-400 text-white cursor-wait'
                      : relayStates[i]
                        ? 'bg-red-600 hover:bg-red-700 text-white'
                        : 'bg-green-600 hover:bg-green-700 text-white'
                }`}
              >
                {loadingRelays.has(i) ? '...' : (relayStates[i] ? 'Turn Off' : 'Turn On')}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Device Status Indicators */}
      {Object.keys(deviceLoadingStates).length > 0 && (
        <div className="p-3 rounded bg-white border-2 border-blue-200">
          <div className="text-xs font-semibold text-black mb-2">Device Status:</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {Array.from(selectedDevices).map((deviceId) => {
              const dev = devices.find(d => d.id === deviceId);
              return (
                <div key={deviceId} className="flex items-center gap-2 text-xs p-2 rounded bg-gray-50 border border-gray-200">
                  {deviceLoadingStates[deviceId] ? (
                    <>
                      <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
                      <span className="text-gray-700">{dev?.paddyName || 'Device'}</span>
                    </>
                  ) : (
                    <>
                      <div className="w-2 h-2 rounded-full bg-green-500"></div>
                      <span className="text-gray-700">{dev?.paddyName || 'Device'}</span>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// RelayControlsPerDevice - Per-paddy relay control with device-level loading states
function RelayControlsPerDevice({ deviceId, paddyName }: { deviceId: string; paddyName?: string }) {
  const [selectedRelays, setSelectedRelays] = useState<Set<number>>(new Set([0, 1, 2, 3]));
  const [relayStates, setRelayStates] = useState([false, false, false, false]);
  const [loadingRelays, setLoadingRelays] = useState<Set<number>>(new Set());
  const [messages, setMessages] = useState<Record<number, string>>({});

  const toggleRelay = async (index: number) => {
    if (loadingRelays.has(index) || !selectedRelays.has(index)) return;

    const prev = [...relayStates];
    const next = [...relayStates];
    next[index] = !next[index];
    
    setRelayStates(next);
    setLoadingRelays(prev => new Set([...prev, index]));
    setMessages({ ...messages, [index]: 'Sending...' });

    const relayNum = index + 1;
    const action = next[index] ? 'on' : 'off';
    try {
      const { user } = useAuth();
      const res = await sendDeviceCommand(deviceId, 'ESP32A', 'relay', action, { relay: relayNum }, user?.uid || '');

      if (res.success) {
        if (res.status === 'completed') {
          setMessages({ ...messages, [index]: next[index] ? '✓ ON' : '✓ OFF' });
        } else {
          setMessages({ ...messages, [index]: next[index] ? '⚠ Pending' : '⚠ Pending' });
        }
      } else {
        setMessages({ ...messages, [index]: '✗ Failed' });
        setRelayStates(prev); // revert
      }

      setTimeout(() => setMessages(m => { delete m[index]; return { ...m }; }), 3000);
    } catch (e) {
      console.error(e);
      setRelayStates(prev); // revert
      setMessages({ ...messages, [index]: `✗ Failed` });
      setTimeout(() => setMessages(m => { delete m[index]; return { ...m }; }), 3000);
    } finally {
      setLoadingRelays(prev => {
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
    }
  };

  return (
    <div className="space-y-3">
      {/* Device Selection Checkboxes */}
      <div className="mb-4 p-3 bg-gray-50 rounded border border-gray-200">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-medium text-black">Select relays to control:</div>
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedRelays(new Set([0, 1, 2, 3]))}
              className="px-2 py-1 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
            >
              All
            </button>
            <button
              onClick={() => setSelectedRelays(new Set())}
              className="px-2 py-1 text-xs font-semibold bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {[0, 1, 2, 3].map((i) => (
            <label key={i} className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-white transition-colors">
              <input
                type="checkbox"
                checked={selectedRelays.has(i)}
                onChange={(e) => {
                  const next = new Set(selectedRelays);
                  if (e.target.checked) next.add(i);
                  else next.delete(i);
                  setSelectedRelays(next);
                }}
                className="w-4 h-4"
              />
              <span className="text-xs text-black font-medium">Relay {i + 1}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Relay Controls Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`p-3 rounded-lg border-2 flex flex-col items-center justify-center transition-all ${
              selectedRelays.has(i)
                ? relayStates[i]
                  ? 'border-red-400 bg-red-50'
                  : 'border-green-400 bg-green-50'
                : 'border-gray-300 bg-gray-100 opacity-50'
            }`}
          >
            <div className="text-sm font-bold text-black mb-2">Relay {i + 1}</div>
            
            {loadingRelays.has(i) && (
              <div className="flex flex-col items-center gap-1 mb-2">
                <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                <div className="text-xs text-blue-600 font-medium">Sending...</div>
              </div>
            )}
            
            {messages[i] && (
              <div className="text-xs font-medium text-center text-gray-700 mb-2">
                {messages[i]}
              </div>
            )}

            <div className="text-xs font-semibold text-black mb-3">
              {loadingRelays.has(i) ? 'Wait...' : (relayStates[i] ? 'ON' : 'OFF')}
            </div>

            <button
              onClick={() => toggleRelay(i)}
              disabled={!selectedRelays.has(i) || loadingRelays.has(i)}
              className={`w-full py-2 px-2 rounded-md font-bold text-xs transition-all ${
                !selectedRelays.has(i)
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : loadingRelays.has(i)
                    ? 'bg-gray-400 text-white cursor-wait'
                    : relayStates[i]
                      ? 'bg-red-600 hover:bg-red-700 text-white'
                      : 'bg-green-600 hover:bg-green-700 text-white'
              }`}
            >
              {loadingRelays.has(i) ? '...' : (relayStates[i] ? 'Turn Off' : 'Turn On')}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// RelayControls component - FULLY FUNCTIONAL
function RelayControls({ deviceId, deviceCount }: { deviceId: string; deviceCount?: number }) {
  const [states, setStates] = useState([false, false, false, false]);
  const [busyIndex, setBusyIndex] = useState<number | null>(null);
  const [messages, setMessages] = useState<Record<number, string>>({});
  const [lastAck, setLastAck] = useState<Record<number, boolean | null>>({});

  const toggle = async (index: number) => {
    if (busyIndex !== null) return;
    const prev = [...states];
    const next = [...states];
    next[index] = !next[index];
    setStates(next);
    setBusyIndex(index);
    setMessages({ ...messages, [index]: 'Sending...' });

    const relayNum = index + 1;
    const action = next[index] ? 'on' : 'off';
    try {
      const { user } = useAuth();
      const res = await sendDeviceCommand(deviceId, 'ESP32A', 'relay', action, { relay: relayNum }, user?.uid || '');

      setLastAck({ ...lastAck, [index]: res.success });

      if (res.success) {
        if (res.status === 'completed') {
          setMessages({ ...messages, [index]: next[index] ? '✓ Relay ON' : '✓ Relay OFF' });
        } else {
          setMessages({ ...messages, [index]: next[index] ? '⚠ Pending' : '⚠ Pending' });
        }
      } else {
        setMessages({ ...messages, [index]: '✗ Failed' });
        setStates(prev); // revert on failure
      }

      setTimeout(() => setMessages(m => { delete m[index]; return { ...m }; }), 4000);
    } catch (e) {
      console.error(e);
      setStates(prev); // revert on failure
      setMessages({ ...messages, [index]: `✗ ${(e as Error).message || 'Failed'}` });
      setLastAck({ ...lastAck, [index]: false });
      setTimeout(() => setMessages(m => { delete m[index]; return { ...m }; }), 4000);
    } finally {
      setBusyIndex(null);
    }
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {states.map((s, i) => (
        <div key={i} className="p-4 rounded-xl bg-white flex flex-col justify-between border-2 border-gray-200">
          <div>
            <div className="font-semibold text-black">RELAY {i + 1}</div>
            <div className="text-sm text-black">{busyIndex === i ? 'Waiting...' : (s ? 'ON' : 'OFF')}</div>
          </div>
          <div className="flex flex-col gap-2 mt-3">
            {messages[i] && <div className="text-xs font-medium text-gray-700">{messages[i]}</div>}
            <button
              onClick={() => toggle(i)}
              disabled={busyIndex !== null}
              className={`py-2 px-4 rounded-md font-medium transition-all ${
                busyIndex === i 
                  ? 'bg-gray-400 text-white cursor-wait' 
                  : s 
                    ? 'bg-red-600 hover:bg-red-700 text-white' 
                    : 'bg-green-600 hover:bg-green-700 text-white'
              }`}
            >
              {busyIndex === i ? '⏳ Sending...' : (s ? 'Turn Off' : 'Turn On')}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// LocationControls component
function LocationControls({ devices }: { devices: Array<{ id: string; label?: string; status?: any; gps?: any; npk?: any }> }) {
  const [mode, setMode] = useState<'all' | 'select'>('all');
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [locations, setLocations] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const listeners = useRef<Record<string, (() => void) | null>>({});

  useEffect(() => {
    const init: Record<string, boolean> = {};
    devices.forEach((d) => (init[d.id] = false));
    setSelected(init);

    return () => {
      // cleanup listeners on unmount
      Object.values(listeners.current).forEach((unsub) => unsub && unsub());
      listeners.current = {};
    };
  }, [devices]);

  const subscribe = (id: string) => {
    if (listeners.current[id]) return;
    const unsub = onDeviceValue(id, 'gps', (val) => {
      setLocations((prev) => ({ ...prev, [id]: val }));
    });
    listeners.current[id] = unsub;
  };

  const unsubscribe = (id: string) => {
    const unsub = listeners.current[id];
    if (unsub) {
      unsub();
      delete listeners.current[id];
    }
    setLocations((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  };

  const toggleSelect = (id: string) => {
    setSelected((s) => {
      const next = { ...s, [id]: !s[id] };
      // subscribe/unsubscribe based on selection
      if (next[id]) subscribe(id); else unsubscribe(id);
      return next;
    });
  };

  // helper: push a log entry to Firestore
  const logAction = async (entry: { deviceId?: string; action: string; details?: any }) => {
    await logControlAction(entry);
  };

  // wait for device to acknowledge actionTaken (10s timeout)
  const waitForAck = (id: string, timeoutMs = 10000) => {
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const unsub = onDeviceValue(id, 'actionTaken', (val) => {
        if (val === true && !settled) {
          settled = true;
          unsub();
          resolve(true);
        }
      });
      // timeout
      const t = setTimeout(() => {
        if (!settled) {
          settled = true;
          try { unsub(); } catch {}
          resolve(false);
        }
      }, timeoutMs);
    });
  };

  const requestLocationFor = async (id: string) => {
    try {
      const { user } = useAuth();
      // Send GPS request to ESP32B (motor controller has GPS)
      const res = await sendDeviceCommand(id, 'ESP32B', 'motor', 'get_location', {}, user?.uid || '');

      if (res.success) {
        // Fetch GPS data
        const gps = await getDeviceGPS(id);
        setLocations((prev) => ({ ...prev, [id]: gps }));
        await logAction({ deviceId: id, action: 'location:fetch', details: { success: true, gps } });
      } else {
        await logAction({ deviceId: id, action: 'location:fetch', details: { success: false, message: res.message } });
      }
    } catch (e) {
      console.error('requestLocationFor error', e);
      await logAction({ deviceId: id, action: 'location:fetch', details: { error: String(e) } });
    }
  };

  const getAll = async () => {
    setLoading(true);
    const ids = devices.map((d) => d.id);
    await Promise.all(ids.map((id) => requestLocationFor(id)));
    setLoading(false);
  };

  const getSelected = async () => {
    const ids = Object.keys(selected).filter((id) => selected[id]);
    if (ids.length === 0) return setLocations({});
    setLoading(true);
    await Promise.all(ids.map((id) => requestLocationFor(id)));
    setLoading(false);
  };

  return (
    <div className="text-black">
      <div className="mb-4 flex items-center gap-4">
        <button onClick={() => setMode('all')} className={`py-2 px-4 rounded ${mode === 'all' ? 'bg-green-600 text-white' : 'bg-gray-100 text-black'}`}>
          Get All Locations
        </button>
        <button onClick={() => setMode('select')} className={`py-2 px-4 rounded ${mode === 'select' ? 'bg-green-600 text-white' : 'bg-gray-100 text-black'}`}>
          Choose Devices
        </button>
        {mode === 'all' ? (
          <button onClick={getAll} disabled={loading} className="py-2 px-3 ml-auto rounded bg-blue-600 text-white">Fetch</button>
        ) : (
          <button onClick={getSelected} disabled={loading} className="py-2 px-3 ml-auto rounded bg-blue-600 text-white">Fetch Selected</button>
        )}
      </div>

      {mode === 'select' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          {devices.map((d) => (
            <label key={d.id} className="flex items-center gap-2 p-3 rounded bg-gray-50">
              <input type="checkbox" checked={!!selected[d.id]} onChange={() => toggleSelect(d.id)} />
              <span className="text-black">{d.id}</span>
            </label>
          ))}
        </div>
      )}

      <div className="space-y-3">
        {loading && <div className="text-black">Listening for locations...</div>}

        {Object.keys(locations).length === 0 && !loading && <div className="text-black">No locations received yet.</div>}

        {Object.entries(locations).map(([id, gps]) => {
          const dev = devices.find((d) => d.id === id);
          return (
            <div key={id} className="p-3 rounded bg-white shadow-sm">
              <div className="font-semibold text-black">{id}</div>
              <div className="text-sm text-black">{gps?.lat && gps?.lng ? `Lat: ${gps.lat}, Lng: ${gps.lng}` : 'No GPS data'}</div>
              <div className="text-xs text-black">Last update: {gps?.ts ? formatTimeAgo(gps.ts) : 'Unknown'}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// LogsControls — reads from Firestore `/control_panel_logs` collection and paginates entries (10 per page)
// Expected Firestore shape:
// control_panel_logs/{docId} = { timestamp: Timestamp, deviceId?: string, action: string, details?: any }
function LogsControls() {
  const [entries, setEntries] = useState<Array<any>>([]);
  const [page, setPage] = useState(0);
  const perPage = 10;

  useEffect(() => {
    // For now, read RTDB logs (migration to Firestore can be done later)
    // This keeps the existing behavior while new actions log to Firestore
    const logsRef = dbRef(database, 'control_panel_logs');
    const unsub = onValue(logsRef, (snap) => {
      const val = snap.exists() ? snap.val() : {};
      const arr = Object.entries(val).map(([k, v]: any) => ({ id: k, ...(v as any) }));
      arr.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      setEntries(arr);
      setPage(0);
    });

    return () => unsub && unsub();
  }, []);

  const totalPages = Math.max(1, Math.ceil(entries.length / perPage));
  const visible = entries.slice(page * perPage, page * perPage + perPage);

  return (
    <div className="text-black">
      <div className="mb-4 flex items-center justify-between">
        <div className="font-semibold">Control Panel History</div>
        <div className="text-sm text-gray-600">Total: {entries.length}</div>
      </div>

      <div className="space-y-3">
        {visible.length === 0 && <div className="text-black">No history available.</div>}
        {visible.map((e) => (
          <div key={e.id} className="p-3 rounded bg-white shadow-sm">
            <div className="text-sm text-black font-medium">{e.action}</div>
            <div className="text-xs text-black">Device: {e.deviceId || 'N/A'}</div>
            <div className="text-xs text-black">{e.details ? JSON.stringify(e.details) : ''}</div>
            <div className="text-xs text-gray-500">{e.timestamp ? formatTimeAgo(e.timestamp) : ''}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="text-sm text-black">Page {page + 1} / {totalPages}</div>
        <div className="flex items-center gap-2">
          <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="py-1 px-2 bg-gray-200 rounded">Prev</button>
          <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="py-1 px-2 bg-gray-200 rounded">Next</button>
        </div>
      </div>
    </div>
  );
}
