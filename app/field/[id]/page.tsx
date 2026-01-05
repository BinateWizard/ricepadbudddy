'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { db, database } from '@/lib/firebase';
import { doc, getDoc, collection, getDocs, updateDoc, setDoc, query, where, orderBy, onSnapshot, deleteDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, onValue, update } from 'firebase/database';
import { getDeviceData } from '@/lib/utils/rtdbHelper';
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

// Register Chart.js components
ChartJS.register(LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend);
import ProtectedRoute from '@/components/ProtectedRoute';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { getVarietyByName } from '@/lib/utils/varietyHelpers';
import { getCurrentStage, getDaysSincePlanting, getExpectedHarvestDate, getGrowthProgress } from '@/lib/utils/stageCalculator';
import { ACTIVITIES, PRE_PLANTING_ACTIVITIES } from '@/lib/data/activities';
import { VARIETY_ACTIVITY_TRIGGERS } from '@/lib/data/activityTriggers';
import { Zap, Moon, RotateCcw, Settings, CheckCircle, TrendingUp } from 'lucide-react';
import { Search } from 'lucide-react';

// Import tab components
import { OverviewTab } from './components/OverviewTab';
import { PaddiesTab } from './components/PaddiesTab';
import { StatisticsTab } from './components/StatisticsTab';
import ControlPanelTab from './components/ControlPanelTab';
import { InformationTab } from './components/InformationTab';
import { FieldHeader } from './components/FieldHeader';
import { FieldTabNavigation } from './components/FieldTabNavigation';
import { AddPaddyModal } from './components/AddPaddyModal';
import { LocationMapModal } from './components/LocationMapModal';

// Pre-import utility modules to avoid dynamic import timing issues
import { getDeviceData as getDeviceStatus, getDeviceGPS } from '@/lib/utils/deviceStatus';
import { logSensorReading } from '@/lib/utils/fieldHelpers';

export default function FieldDetail() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const fieldId = params.id as string;
  
  const [field, setField] = useState<any>(null);
  const [paddies, setPaddies] = useState<any[]>([]);
  const [deviceReadings, setDeviceReadings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'paddies' | 'statistics' | 'information' | 'control-panel'>('overview');
  
  // Add device modal state
  const [isAddDeviceModalOpen, setIsAddDeviceModalOpen] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  
  // Map modal state
  const [showMapModal, setShowMapModal] = useState(false);
  const [selectedPaddy, setSelectedPaddy] = useState<any>(null);
  const [locationData, setLocationData] = useState<{lat: number; lng: number; timestamp?: any} | null>(null);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [otherDevicesHaveLocation, setOtherDevicesHaveLocation] = useState(false);
  
  // Scan modal state
  const [isScanModalOpen, setIsScanModalOpen] = useState(false);
  const [scanMode, setScanMode] = useState<"all" | "manual">("all");
  const [selectedDevices, setSelectedDevices] = useState<Set<string>>(new Set());
  const [isScanning, setIsScanning] = useState(false);
  const [scanResults, setScanResults] = useState<{[deviceId: string]: {status: string; message: string}}>({});

  // TODO: Implement automatic logging of sensor readings
  // When device readings are received from Firebase RTDB, call logSensorReading():
  // Example usage:
  // await logSensorReading(user.uid, fieldId, paddyId, {
  //   nitrogen: 45.2,
  //   phosphorus: 12.8,
  //   potassium: 38.5
  // });

  const hasDevices = paddies.length > 0;

  // Handle scan button click - open modal
  const handleScanButtonClick = () => {
    if (paddies.length === 0) {
      alert('No paddies connected to scan');
      return;
    }
    setIsScanModalOpen(true);
    setScanMode('all');
    setSelectedDevices(new Set());
    setScanResults({});
  };

  // Handle scan devices execution
  const handleScanDevices = async () => {
    const devicesToScan = scanMode === 'all' 
      ? paddies.map(p => p.deviceId)
      : paddies.filter(p => selectedDevices.has(p.id)).map(p => p.deviceId);

    if (devicesToScan.length === 0) {
      alert('Please select at least one device to scan');
      return;
    }

    setIsScanning(true);
    setScanResults({});

    try {
      const { sendDeviceCommand } = await import('@/lib/utils/deviceCommands');
      const scanPromises = devicesToScan.map(async (deviceId) => {
        try {
          // Execute scan on device (NPK sensor on ESP32C)
          await sendDeviceCommand(deviceId, 'ESP32C', 'npk', 'scan', {}, '');
          
          // Fetch NPK data from RTDB after successful scan
          const npkData = await getDeviceData(deviceId, 'npk');
          
          if (npkData) {
            return {
              deviceId,
              npk: {
                n: npkData.n,
                p: npkData.p,
                k: npkData.k
              },
              timestamp: npkData.timestamp
            };
          }
          return { deviceId, npk: null };
        } catch (err) {
          return {
            error: true,
            deviceId,
            message: (err as any).message
          };
        }
      });

      const results = await Promise.all(scanPromises);
      const newResults: {[deviceId: string]: {status: string; message: string; npk?: any}} = {};

      results.forEach((result: any) => {
        const paddy = paddies.find(p => p.deviceId === result.deviceId);
        const paddyId = paddy?.id || result.deviceId;
        
        if (result.error) {
          newResults[paddyId] = {
            status: 'error',
            message: `✗ ${result.message || 'Scan failed'}`
          };
        } else if (result.npk) {
          newResults[paddyId] = {
            status: 'success',
            message: `✓ N: ${result.npk.n} | P: ${result.npk.p} | K: ${result.npk.k}`,
            npk: result.npk
          };
        } else {
          newResults[paddyId] = {
            status: 'success',
            message: `✓ Scan completed (no NPK data)`
          };
        }
      });

      setScanResults(newResults);

      // Auto-close modal after 4 seconds if all successful
      const allSuccessful = Object.values(newResults).every(r => r.status === 'success');
      if (allSuccessful) {
        setTimeout(() => {
          closeScanModal();
        }, 4000);
      }
    } catch (error: any) {
      console.error('Scan error:', error);
      alert('Failed to scan devices');
    } finally {
      setIsScanning(false);
    }
  };

  const closeScanModal = async () => {
    // Commands are now automatically managed by Cloud Functions
    setIsScanModalOpen(false);
    setTimeout(() => {
      setScanMode('all');
      setSelectedDevices(new Set());
      setScanResults({});
    }, 300);
  };

  // Scan all devices function is moved to statistics tab
  // const handleScanAllDevices = async () => { ... };

  useEffect(() => {
    const fetchFieldData = async () => {
      if (!user) {
        console.log('No user found');
        setLoading(false);
        return;
      }

      console.log('Fetching field data for user:', user.uid, 'field:', fieldId);

      try {
        // Fetch field data
        const fieldRef = doc(db, 'users', user.uid, 'fields', fieldId);
        console.log('Field path:', `users/${user.uid}/fields/${fieldId}`);
        const fieldSnap = await getDoc(fieldRef);

        if (fieldSnap.exists()) {
          console.log('Field data found:', fieldSnap.data());
          setField({ id: fieldSnap.id, ...fieldSnap.data() });

          // Fetch paddies for this field
          const paddiesRef = collection(db, 'users', user.uid, 'fields', fieldId, 'paddies');
          console.log('Paddies path:', `users/${user.uid}/fields/${fieldId}/paddies`);
          const paddiesSnap = await getDocs(paddiesRef);
          const paddiesData = paddiesSnap.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          console.log('Paddies found:', paddiesData.length);
          setPaddies(paddiesData);

          // Device readings will be fetched separately from RTDB
          setDeviceReadings([]);
        } else {
          console.error('Field document does not exist');
        }
      } catch (error: any) {
        console.error('Error fetching field data:', error);
        console.error('Error code:', error?.code);
        console.error('Error message:', error?.message);
        if (error?.code === 'permission-denied') {
          console.error('PERMISSION DENIED: Check Firestore rules for users/{userId}/fields/{fieldId}');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchFieldData();
  }, [user, fieldId]);

  // Fetch device readings from RTDB and auto-log
  const fetchDeviceReadings = useCallback(async () => {
    if (!user || paddies.length === 0) return;

    try {
      const readings: any[] = [];
      
      for (const paddy of paddies) {
        if (!paddy.deviceId) continue;
        
        try {
          const deviceData = await getDeviceStatus(paddy.deviceId);
          console.log(`[Device Fetch] ${paddy.deviceId}:`, deviceData);
          
          if (deviceData) {
            readings.push({
              deviceId: paddy.deviceId,
              paddyId: paddy.id,
              ...deviceData,
            });
          } else {
            console.log(`[Device Fetch] No data found for ${paddy.deviceId}`);
          }
        } catch (error) {
          console.error(`Error fetching device ${paddy.deviceId}:`, error);
        }
      }
      
      console.log('[Device Fetch] All readings:', readings);
      setDeviceReadings(readings);
    } catch (error) {
      console.error('Error fetching device readings:', error);
    }
  }, [user, fieldId, paddies]);

  useEffect(() => {
    fetchDeviceReadings();
    
    // Refresh device readings every 30 seconds
    const interval = setInterval(fetchDeviceReadings, 30 * 1000);
    
    return () => clearInterval(interval);
  }, [fetchDeviceReadings]);

  // Refresh device readings when statistics tab becomes active
  useEffect(() => {
    if (activeTab === 'statistics' && paddies.length > 0) {
      fetchDeviceReadings();
    }
  }, [activeTab, paddies.length, fetchDeviceReadings]);
  
  // Calculate area based on paddy shape
  const calculatePaddyArea = (
    shapeType: 'rectangle' | 'trapezoid',
    length: string,
    width: string,
    width2: string
  ) => {
    if (!length) return null;
    
    if (shapeType === 'rectangle') {
      if (!width) return null;
      return parseFloat(length) * parseFloat(width);
    } else if (shapeType === 'trapezoid') {
      if (!width || !width2) return null;
      return ((parseFloat(width) + parseFloat(width2)) / 2) * parseFloat(length);
    }
    return null;
  };
  
  // Handle add device submission
  const handleAddDevice = async (data: {
    paddyName: string;
    paddyDescription: string;
    deviceId: string;
    paddyShapeType: 'rectangle' | 'trapezoid';
    paddyLength: string;
    paddyWidth: string;
    paddyWidth2: string;
  }) => {
    setIsVerifying(true);
    try {
      if (!user) {
        throw new Error("Session error. Please try again.");
      }

      // Verify device exists in RTDB and is not owned/connected to another user
      const deviceData = await getDeviceData(data.deviceId.trim(), '');

      if (!deviceData) {
        throw new Error("Device not found. Please check the ID");
      }

      if (deviceData?.ownedBy && deviceData.ownedBy !== user.uid) {
        throw new Error("Device is already owned by another user. Access restricted due to policy changes.");
      }

      if (deviceData?.connectedTo && deviceData.connectedTo !== user.uid) {
        throw new Error("Device is already connected to another user");
      }

      const areaM2 = calculatePaddyArea(data.paddyShapeType, data.paddyLength, data.paddyWidth, data.paddyWidth2);
      const areaHectares = areaM2 ? areaM2 / 10000 : null;

      // Create paddy document with area metadata
      const paddyRef = doc(collection(db, `users/${user.uid}/fields/${fieldId}/paddies`));
      await setDoc(paddyRef, {
        paddyName: data.paddyName.trim(),
        description: data.paddyDescription.trim(),
        deviceId: data.deviceId.trim(),
        shapeType: data.paddyShapeType,
        length: data.paddyLength ? parseFloat(data.paddyLength) : null,
        width: data.paddyWidth ? parseFloat(data.paddyWidth) : null,
        width2: data.paddyShapeType === 'trapezoid' && data.paddyWidth2 ? parseFloat(data.paddyWidth2) : null,
        areaM2,
        areaHectares,
        connectedAt: new Date().toISOString(),
        status: 'connected',
        createdAt: new Date().toISOString()
      });

      // Update device in RTDB to mark it as connected to this user and field
      const deviceRef = ref(database, `devices/${data.deviceId.trim()}`);
      await update(deviceRef, {
        ownedBy: user.uid,
        connectedTo: user.uid,
        connectedAt: new Date().toISOString(),
        fieldId,
        paddyName: data.paddyName.trim(),
        status: 'connected'
      });
      
      // Refresh paddies list
      const paddiesRef = collection(db, `users/${user.uid}/fields/${fieldId}/paddies`);
      const paddiesSnapshot = await getDocs(paddiesRef);
      const paddiesData = paddiesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setPaddies(paddiesData);
    } finally {
      setIsVerifying(false);
    }
  };
  
  // Handle location view
  const handleViewLocation = async (paddy: any, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click
    setSelectedPaddy(paddy);
    setShowMapModal(true);
    setLoadingLocation(true);
    setLocationData(null);
    setOtherDevicesHaveLocation(false);
    
    try {
      // Fetch GPS coordinates from Firebase RTDB
      const gps = await getDeviceGPS(paddy.deviceId);
      
      if (gps && gps.lat && gps.lng) {
        setLocationData({ 
          lat: gps.lat, 
          lng: gps.lng,
          timestamp: gps.ts
        });
      } else {
        // Check if other devices have location
        for (const otherPaddy of paddies) {
          if (otherPaddy.deviceId !== paddy.deviceId) {
            const otherGPS = await getDeviceGPS(otherPaddy.deviceId);
            if (otherGPS && otherGPS.lat && otherGPS.lng) {
              setOtherDevicesHaveLocation(true);
              break;
            }
          }
        }
      }
      
      setLoadingLocation(false);
    } catch (error) {
      console.error('Error fetching location:', error);
      setLoadingLocation(false);
    }
  };

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 flex items-center justify-center">
          <svg className="animate-spin h-12 w-12 text-green-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        </div>
      </ProtectedRoute>
    );
  }

  if (!field) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 flex items-center justify-center">
          <div className="text-center">
            <div className="bg-red-100 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-4">
              <svg className="w-10 h-10 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Field not found</h2>
            <button
              onClick={() => router.push('/')}
              className="inline-flex items-center gap-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white px-6 py-3 rounded-xl font-semibold hover:from-green-700 hover:to-emerald-700 transition-all shadow-lg hover:shadow-xl"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Home
            </button>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50">
        {/* Header */}
        <FieldHeader field={field} />

        {/* Bottom Tab Navigation - Facebook Style */}
        <FieldTabNavigation 
          activeTab={activeTab}
          onTabChange={setActiveTab}
          hasDevices={hasDevices}
        />

        {/* Content with smooth transitions */}
        <main className="w-full px-2 sm:px-4 lg:px-8 pt-0 sm:pt-6 pb-24">
          {/* Tab Content with Fade Transition */}
          <div className="relative">
            {/* Overview Tab */}
            <div className={`transition-all duration-300 ease-in-out ${
              activeTab === 'overview' 
                ? 'opacity-100 translate-y-0' 
                : 'opacity-0 translate-y-4 absolute inset-0 pointer-events-none'
            }`}>
              {activeTab === 'overview' && <OverviewTab field={field} paddies={paddies} />}
            </div>

            {/* Paddies Tab */}
            <div className={`transition-all duration-300 ease-in-out ${
              activeTab === 'paddies' 
                ? 'opacity-100 translate-y-0' 
                : 'opacity-0 translate-y-4 absolute inset-0 pointer-events-none'
            }`}>
              {activeTab === 'paddies' && (
                <PaddiesTab 
                  paddies={paddies} 
                  deviceReadings={deviceReadings} 
                  fieldId={fieldId}
                  onAddDevice={() => setIsAddDeviceModalOpen(true)}
                  onViewLocation={handleViewLocation}
                />
              )}
            </div>

            {/* Statistics Tab */}
            <div className={`transition-all duration-300 ease-in-out ${
              activeTab === 'statistics' 
                ? 'opacity-100 translate-y-0' 
                : 'opacity-0 translate-y-4 absolute inset-0 pointer-events-none'
            }`}>
              {activeTab === 'statistics' && hasDevices && (
                <StatisticsTab 
                  paddies={paddies} 
                  deviceReadings={deviceReadings} 
                  fieldId={fieldId}
                  setDeviceReadings={setDeviceReadings}
                  key={`stats-${paddies.length}-${deviceReadings.length}`}
                />
              )}
            </div>

            {/* Information Tab */}
            <div className={`transition-all duration-300 ease-in-out ${
              activeTab === 'information' 
                ? 'opacity-100 translate-y-0' 
                : 'opacity-0 translate-y-4 absolute inset-0 pointer-events-none'
            }`}>
              {activeTab === 'information' && (
                <InformationTab 
                  field={{ ...field, id: fieldId }} 
                  onFieldUpdate={() => {
                    // Re-fetch field data after status change
                    const fetchUpdatedField = async () => {
                      if (!user) return;
                      const fieldRef = doc(db, `users/${user.uid}/fields/${fieldId}`);
                      const fieldSnap = await getDoc(fieldRef);
                      if (fieldSnap.exists()) {
                        setField({ id: fieldSnap.id, ...fieldSnap.data() });
                      }
                    };
                    fetchUpdatedField();
                  }}
                />
              )}
            </div>

            {/* Control Panel Tab */}
            <div className={`transition-all duration-300 ease-in-out ${
              activeTab === 'control-panel' 
                ? 'opacity-100 translate-y-0' 
                : 'opacity-0 translate-y-4 absolute inset-0 pointer-events-none'
            }`}>
              {activeTab === 'control-panel' && (
                <ControlPanelTab paddies={paddies} fieldId={fieldId} deviceReadings={deviceReadings} />
              )}
            </div>
          </div>
        </main>

        {/* Floating Action Button - Add Paddy (only on Paddies tab) */}
        {activeTab === 'paddies' && (
          <button 
            onClick={() => setIsAddDeviceModalOpen(true)}
            className="fixed bottom-20 right-6 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-full shadow-2xl hover:shadow-3xl hover:from-green-700 hover:to-emerald-700 active:scale-95 transition-all flex items-center justify-center w-14 h-14 z-[60]"
            title="Add New Paddy"
          >
            <span className="text-3xl font-light">+</span>
          </button>
        )}
        
        {/* Add Device Modal */}
        <AddPaddyModal
          isOpen={isAddDeviceModalOpen}
          onClose={() => setIsAddDeviceModalOpen(false)}
          onSubmit={handleAddDevice}
          isVerifying={isVerifying}
        />

        {/* Map Modal */}
        <LocationMapModal
          isOpen={showMapModal}
          onClose={() => setShowMapModal(false)}
          selectedPaddy={selectedPaddy}
          loadingLocation={loadingLocation}
          locationData={locationData}
          otherDevicesHaveLocation={otherDevicesHaveLocation}
        />
      </div>
    </ProtectedRoute>
  );
}
