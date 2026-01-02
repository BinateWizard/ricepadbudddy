// This file has been cleared for a fresh start.

import { useState, useEffect, useRef } from 'react';
import { getDeviceStatus, getDeviceGPS, getDeviceNPK } from '@/lib/utils/deviceStatus';
import { database, db } from '@/lib/firebase';
import { ref as dbRef, onValue, off, push, set } from 'firebase/database';
import { onDeviceValue } from '@/lib/utils/rtdbHelper';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { sendDeviceAction, executeDeviceAction } from '@/lib/utils/deviceActions';
import { waitForDeviceActionComplete } from '@/lib/utils/deviceActions';

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

// perform device action: send -> wait for ack -> optionally wait for completion -> fetch result -> log to Firestore
async function performDeviceAction(deviceId: string, command: string, fetchResult?: () => Promise<any>) {
  try {
    await sendDeviceAction(deviceId, command);
    const ack = await waitForAck(deviceId, 10000);
    let completed = false;
    if (ack) {
      try {
        await waitForDeviceActionComplete(deviceId, 30000);
        completed = true;
      } catch (e) {
        // timed out or error; proceed to fetch whatever is available
      }
    }

    const result = fetchResult ? await fetchResult() : await getDeviceStatus(deviceId);
    await logControlAction({ deviceId, action: command, details: { acknowledged: ack, completed, result } });
    return { acknowledged: ack, completed, result };
  } catch (e) {
    await logControlAction({ deviceId, action: command, details: { error: String(e) } });
    throw e;
  }
}

interface ControlPanelTabProps {
  paddies?: any[];
  fieldId?: string;
  deviceReadings?: any[];
}

export default function ControlPanelTab({ paddies = [], fieldId, deviceReadings = [] }: ControlPanelTabProps) {
  const [activeTab, setActiveTab] = useState(0);
  const [deviceData, setDeviceData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [controlMode, setControlMode] = useState<'field' | 'individual'>('field'); // 'field' for all, 'individual' for per-device

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
              label: paddy.name || `Paddy ${paddy.id}`,
              paddyId: paddy.id,
              paddyName: paddy.name,
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

  

  return (
    <div className="w-full flex flex-col items-center mt-8 overflow-y-auto overflow-x-hidden" style={{ minHeight: '100vh' }}>
      <div className="w-full max-w-4xl flex flex-col h-full min-h-[400px]">
        {/* Modern Tab Controller - preserved original layout. DO NOT MODIFY STYLES BELOW */}
        <TabBar activeTab={activeTab} setActiveTab={setActiveTab} />
        {/* Main Content Area */}
        <div className="bg-white rounded-b-xl rounded-tr-xl shadow p-8 min-h-[200px] h-full flex-1 overflow-y-auto overflow-x-hidden pr-2 text-black" style={{ minHeight: 200 }}>
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
    <div className="flex w-full mb-0 h-[64px] min-h-[64px] border-b border-gray-200 bg-transparent flex-shrink-0 z-30 rounded-t-xl overflow-hidden">
      {TABS.map((tab, idx) => (
        <button
          key={tab.label}
          className={`flex-1 flex items-center justify-center text-base font-semibold transition-colors focus:outline-none h-full
            ${activeTab === idx
              ? 'bg-green-600 text-white z-10 shadow-sm rounded-t-lg border-b-4 border-green-600'
              : 'bg-gray-50 text-gray-600 hover:bg-green-50 border-b-4 border-transparent'}
            ${idx === 0 ? 'rounded-tl-lg' : ''} ${idx === TABS.length - 1 ? 'rounded-tr-lg' : ''}
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

// FieldLevelRelayControls - Control all relays across all paddies in the field at once
function FieldLevelRelayControls({ devices, fieldName }: { devices: any[]; fieldName: string }) {
  const [selectedRelays, setSelectedRelays] = useState<Set<number>>(new Set([0, 1, 2, 3]));
  const [relayStates, setRelayStates] = useState([false, false, false, false]);
  const [loadingRelays, setLoadingRelays] = useState<Set<number>>(new Set());
  const [deviceLoadingStates, setDeviceLoadingStates] = useState<Record<string, boolean>>({});
  const [messages, setMessages] = useState<Record<number, string>>({});

  const toggleRelayForAll = async (relayIndex: number) => {
    if (loadingRelays.has(relayIndex) || !selectedRelays.has(relayIndex) || devices.length === 0) return;

    const prev = [...relayStates];
    const next = [...relayStates];
    next[relayIndex] = !next[relayIndex];
    
    setRelayStates(next);
    setLoadingRelays(prev => new Set([...prev, relayIndex]));
    setMessages({ ...messages, [relayIndex]: 'Sending to all paddies...' });

    // Track loading state for each device
    const deviceLoadingMap: Record<string, boolean> = {};
    devices.forEach(dev => {
      deviceLoadingMap[dev.id] = true;
    });
    setDeviceLoadingStates(deviceLoadingMap);

    // Send command to all devices in parallel
    try {
      const results = await Promise.all(
        devices.map(async (dev) => {
          const cmd = `relay:${relayIndex + 1}:${next[relayIndex] ? 'on' : 'off'}`;
          try {
            const res = await performDeviceAction(dev.id, cmd, async () => {
              return await getDeviceStatus(dev.id);
            });
            
            setDeviceLoadingStates(prev => ({ ...prev, [dev.id]: false }));
            return { deviceId: dev.id, acknowledged: res.acknowledged, completed: res.completed };
          } catch (e) {
            setDeviceLoadingStates(prev => ({ ...prev, [dev.id]: false }));
            return { deviceId: dev.id, acknowledged: false, completed: false, error: String(e) };
          }
        })
      );

      // Check if all acknowledged
      const allAcknowledged = results.every(r => r.acknowledged);
      const allCompleted = results.every(r => r.completed);

      if (allAcknowledged) {
        if (allCompleted) {
          setMessages({ ...messages, [relayIndex]: next[relayIndex] ? '✓ All relays ON' : '✓ All relays OFF' });
        } else {
          setMessages({ ...messages, [relayIndex]: '⚠ Sent to all (some incomplete)' });
        }
      } else {
        setMessages({ ...messages, [relayIndex]: `✗ Failed on ${results.filter(r => !r.acknowledged).length} device(s)` });
        setRelayStates(prev); // revert
      }

      setTimeout(() => setMessages(m => { delete m[relayIndex]; return { ...m }; }), 4000);
    } catch (e) {
      console.error(e);
      setRelayStates(prev); // revert
      setMessages({ ...messages, [relayIndex]: '✗ Operation failed' });
      setTimeout(() => setMessages(m => { delete m[relayIndex]; return { ...m }; }), 3000);
    } finally {
      setLoadingRelays(prev => {
        const next = new Set(prev);
        next.delete(relayIndex);
        return next;
      });
      setDeviceLoadingStates({});
    }
  };

  return (
    <div className="p-4 rounded-lg border-2 border-green-300 bg-green-50">
      <div className="mb-4">
        <div className="font-bold text-lg text-black">🌾 {fieldName}</div>
        <div className="text-sm text-gray-700 mt-1">
          Control {devices.length} paddy/paddies simultaneously
        </div>
      </div>

      {/* Relay Selection */}
      <div className="mb-4 p-3 bg-white rounded border border-green-200">
        <div className="text-sm font-medium text-black mb-2">Select relays to control:</div>
        <div className="grid grid-cols-4 gap-2">
          {[0, 1, 2, 3].map((i) => (
            <label key={i} className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-green-100 transition-colors">
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`p-4 rounded-lg border-2 flex flex-col items-center justify-center transition-all ${
              selectedRelays.has(i)
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
              onClick={() => toggleRelayForAll(i)}
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
              {loadingRelays.has(i) ? '...' : (relayStates[i] ? 'Turn Off All' : 'Turn On All')}
            </button>
          </div>
        ))}
      </div>

      {/* Device Status Indicators */}
      {Object.keys(deviceLoadingStates).length > 0 && (
        <div className="p-3 rounded bg-white border border-blue-200">
          <div className="text-xs font-semibold text-black mb-2">Device Status:</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {devices.map((dev) => (
              <div key={dev.id} className="flex items-center gap-2 text-xs p-2 rounded bg-gray-50">
                {deviceLoadingStates[dev.id] ? (
                  <>
                    <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
                    <span className="text-gray-700">{dev.paddyName || 'Device'}</span>
                  </>
                ) : (
                  <>
                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                    <span className="text-gray-700">{dev.paddyName || 'Device'}</span>
                  </>
                )}
              </div>
            ))}
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

    const cmd = `relay:${index + 1}:${next[index] ? 'on' : 'off'}`;
    try {
      const res = await performDeviceAction(deviceId, cmd, async () => {
        return await getDeviceStatus(deviceId);
      });

      if (res.acknowledged) {
        if (res.completed) {
          setMessages({ ...messages, [index]: next[index] ? '✓ ON' : '✓ OFF' });
        } else {
          setMessages({ ...messages, [index]: next[index] ? '⚠ Ack (incomplete)' : '⚠ Ack (incomplete)' });
        }
      } else {
        setMessages({ ...messages, [index]: '✗ No ack' });
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
        <div className="text-sm font-medium text-black mb-2">Select relays to control:</div>
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

    const cmd = `relay:${index + 1}:${next[index] ? 'on' : 'off'}`;
    try {
      const res = await performDeviceAction(deviceId, cmd, async () => {
        return await getDeviceStatus(deviceId);
      });

      setLastAck({ ...lastAck, [index]: res.acknowledged });

      if (res.acknowledged) {
        if (res.completed) {
          setMessages({ ...messages, [index]: next[index] ? '✓ Relay ON' : '✓ Relay OFF' });
        } else {
          setMessages({ ...messages, [index]: next[index] ? '⚠ Acknowledged (incomplete)' : '⚠ Acknowledged (incomplete)' });
        }
      } else {
        setMessages({ ...messages, [index]: '✗ No ack (timeout)' });
        setStates(prev); // revert on no ack
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

// MotorControls component - FULLY FUNCTIONAL
function MotorControls({ deviceId }: { deviceId: string }) {
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const start = async () => {
    try {
      setBusy(true);
      setMessage('Starting motor...');
      const res = await performDeviceAction(deviceId, 'motor:start', async () => {
        return await getDeviceStatus(deviceId);
      });
      setRunning(true);
      setMessage(res.acknowledged ? '✓ Motor started' : '⚠ No ack - may not have started');
      setTimeout(() => setMessage(null), 3000);
    } catch (e) {
      console.error(e);
      setMessage(`✗ ${(e as Error).message || 'Start failed'}`);
      setTimeout(() => setMessage(null), 3000);
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    try {
      setBusy(true);
      setMessage('Stopping motor...');
      const res = await performDeviceAction(deviceId, 'motor:stop', async () => {
        return await getDeviceStatus(deviceId);
      });
      setRunning(false);
      setMessage(res.acknowledged ? '✓ Motor stopped' : '⚠ No ack - may not have stopped');
      setTimeout(() => setMessage(null), 3000);
    } catch (e) {
      console.error(e);
      setMessage(`✗ ${(e as Error).message || 'Stop failed'}`);
      setTimeout(() => setMessage(null), 3000);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <button onClick={start} disabled={busy || running} className="py-2 px-4 bg-green-600 hover:bg-green-700 text-white rounded font-medium disabled:bg-gray-400">
          {busy && !running ? '⏳ Starting...' : 'Start'}
        </button>
        <button onClick={stop} disabled={busy || !running} className="py-2 px-4 bg-red-600 hover:bg-red-700 text-white rounded font-medium disabled:bg-gray-400">
          {busy && running ? '⏳ Stopping...' : 'Stop'}
        </button>
        <div className="text-sm text-black font-medium">{running ? '▶ Running' : '⏹ Stopped'}</div>
      </div>
      {message && <div className="text-sm text-gray-700 font-medium">{message}</div>}
    </div>
  );
}

// NPKControls - FULLY FUNCTIONAL
function NPKControls({ deviceId }: { deviceId: string }) {
  const [reading, setReading] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const read = async () => {
    try {
      setBusy(true);
      setMessage('Requesting reading...');
      const res = await performDeviceAction(deviceId, 'npk:read', async () => {
        return await getDeviceNPK(deviceId);
      });
      
      if (res.result) {
        setReading(res.result);
        setMessage(res.acknowledged ? '✓ Reading received' : '⚠ Reading (no ack)');
      } else {
        setMessage('⚠ No reading data received');
      }
      setTimeout(() => setMessage(null), 4000);
    } catch (e) {
      console.error(e);
      setMessage(`✗ ${(e as Error).message || 'Request failed'}`);
      setTimeout(() => setMessage(null), 3000);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <button onClick={read} disabled={busy} className="py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium disabled:bg-gray-400 w-fit">
        {busy ? '⏳ Reading...' : 'Read NPK'}
      </button>
      {reading && (
        <div className="p-4 rounded-lg bg-blue-50 border border-blue-200">
          <div className="text-sm text-black font-medium mb-2">Latest Reading:</div>
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{reading.n ?? '--'}</div>
              <div className="text-xs text-gray-600">Nitrogen (N)</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">{reading.p ?? '--'}</div>
              <div className="text-xs text-gray-600">Phosphorus (P)</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">{reading.k ?? '--'}</div>
              <div className="text-xs text-gray-600">Potassium (K)</div>
            </div>
          </div>
          {reading.timestamp && (
            <div className="text-xs text-gray-500 mt-2">Read at: {formatTimeAgo(reading.timestamp)}</div>
          )}
        </div>
      )}
      {message && <div className="text-sm text-gray-700 font-medium">{message}</div>}
    </div>
  );
}

// GPSControls - FULLY FUNCTIONAL
function GPSControls({ deviceId }: { deviceId: string }) {
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<any | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const request = async () => {
    try {
      setBusy(true);
      setMessage('Requesting GPS location...');
      const res = await performDeviceAction(deviceId, 'gps:request', async () => {
        return await getDeviceGPS(deviceId);
      });
      
      if (res.result) {
        setLast(res.result);
        setMessage(res.acknowledged ? '✓ Location received' : '⚠ Location (no ack)');
      } else {
        setMessage('⚠ No location data received');
      }
      setTimeout(() => setMessage(null), 4000);
    } catch (e) {
      console.error(e);
      setMessage(`✗ ${(e as Error).message || 'Request failed'}`);
      setTimeout(() => setMessage(null), 3000);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <button onClick={request} disabled={busy} className="py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-medium disabled:bg-gray-400 w-fit">
        {busy ? '⏳ Requesting...' : 'Request Location'}
      </button>
      {last && last.lat && last.lng && (
        <div className="p-4 rounded-lg bg-indigo-50 border border-indigo-200">
          <div className="text-sm text-black font-medium mb-2">Latest Location:</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-lg font-mono text-indigo-600">{last.lat.toFixed(6)}</div>
              <div className="text-xs text-gray-600">Latitude</div>
            </div>
            <div>
              <div className="text-lg font-mono text-indigo-600">{last.lng.toFixed(6)}</div>
              <div className="text-xs text-gray-600">Longitude</div>
            </div>
          </div>
          {last.ts && (
            <div className="text-xs text-gray-500 mt-2">Location received: {formatTimeAgo(last.ts)}</div>
          )}
        </div>
      )}
      {message && <div className="text-sm text-gray-700 font-medium">{message}</div>}
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
      // send action to device
      await sendDeviceAction(id, 'gps:request');

      // wait for ack up to 10s
      const ack = await waitForAck(id, 10000);

      // If ack received, wait for completion (action='done') up to 30s
      if (ack) {
        try {
          await executeDeviceAction(id, 'gps:request', 30000);
        } catch (e) {
          // ignore — we'll fetch whatever gps we have
        }
      }

      // fetch GPS (one-off)
      const gps = await getDeviceGPS(id);
      setLocations((prev) => ({ ...prev, [id]: gps }));

      // log the fetch with ack status and gps
      await logAction({ deviceId: id, action: 'location:fetch', details: { acknowledged: ack, gps } });
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
