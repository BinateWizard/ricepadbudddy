'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { db, database } from '@/lib/firebase';
import { doc, getDoc, collection, getDocs, updateDoc, setDoc, query, where, orderBy, onSnapshot, deleteDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, onValue } from 'firebase/database';
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

/**
 * Log sensor readings to Firestore for historical tracking
 * 
 * This function saves NPK and other sensor readings with timestamps
 * to enable historical data analysis and trend visualization.
 * 
 * Usage:
 * await logSensorReading(user.uid, fieldId, paddyId, {
 *   nitrogen: 45.2,
 *   phosphorus: 12.8,
 *   potassium: 38.5
 * });
 * 
 * Data is stored in: users/{userId}/fields/{fieldId}/paddies/{paddyId}/logs/{logId}
 * Each log automatically includes timestamp and createdAt fields
 */
async function logSensorReading(
  userId: string, 
  fieldId: string, 
  paddyId: string, 
  readings: {
    nitrogen?: number;
    phosphorus?: number;
    potassium?: number;
    temperature?: number;
    humidity?: number;
    waterLevel?: number;
  }
) {
  try {
    const logsRef = collection(db, `users/${userId}/fields/${fieldId}/paddies/${paddyId}/logs`);
    await addDoc(logsRef, {
      ...readings,
      timestamp: serverTimestamp(),
      createdAt: new Date().toISOString()
    });
    console.log('Sensor reading logged successfully');
    return true;
  } catch (error) {
    console.error('Error logging sensor reading:', error);
    return false;
  }
}

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
  const [paddyName, setPaddyName] = useState("");
  const [paddyDescription, setPaddyDescription] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [errors, setErrors] = useState<{[key: string]: string}>({});
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
  
  // Format time ago
  const getTimeAgo = (timestamp: any) => {
    if (!timestamp) return 'Unknown';
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    return 'Just now';
  };

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
      const { executeDeviceAction } = await import('@/lib/utils/deviceActions');
      
      const scanPromises = devicesToScan.map(async (deviceId) => {
        try {
          // Execute scan on device
          await executeDeviceAction(deviceId, 'scan', 15000);
          
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
    // Reset action to "none" for all paddies when closing
    const { resetDeviceAction } = await import('@/lib/utils/deviceActions');
    for (const paddy of paddies) {
      try {
        await resetDeviceAction(paddy.deviceId);
      } catch (error) {
        console.error(`Error resetting action for ${paddy.deviceId}:`, error);
      }
    }
    
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
      const { database } = await import('@/lib/firebase');
      const { ref, get } = await import('firebase/database');
      const { getDeviceData } = await import('@/lib/utils/deviceStatus');
      const { autoLogReadings } = await import('@/lib/utils/sensorLogging');

      const readings: any[] = [];
      
      for (const paddy of paddies) {
        if (!paddy.deviceId) continue;
        
        try {
          const deviceData = await getDeviceData(paddy.deviceId);
          console.log(`[Device Fetch] ${paddy.deviceId}:`, deviceData);
          
          if (deviceData) {
            readings.push({
              deviceId: paddy.deviceId,
              paddyId: paddy.id,
              ...deviceData,
            });

            // Auto-log NPK readings if available
            if (deviceData.npk && (deviceData.npk.n !== undefined || deviceData.npk.p !== undefined || deviceData.npk.k !== undefined)) {
              console.log(`[Auto-Log] Logging NPK for ${paddy.deviceId}:`, deviceData.npk);
              await autoLogReadings(user.uid, fieldId, paddy.id, deviceData.npk);
            } else {
              console.log(`[Auto-Log] No NPK data for ${paddy.deviceId}`);
            }
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
  
  // Handle add device submission
  const handleAddDevice = async (e: React.FormEvent) => {
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
    
    setIsVerifying(true);
    try {
      // Create paddy document
      const paddyRef = doc(collection(db, `users/${user?.uid}/fields/${fieldId}/paddies`));
      await setDoc(paddyRef, {
        paddyName: paddyName.trim(),
        description: paddyDescription.trim(),
        deviceId: deviceId.trim(),
        createdAt: new Date().toISOString()
      });
      
      // Refresh paddies list
      const paddiesRef = collection(db, `users/${user?.uid}/fields/${fieldId}/paddies`);
      const paddiesSnapshot = await getDocs(paddiesRef);
      const paddiesData = paddiesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setPaddies(paddiesData);
      
      // Close modal and reset form
      setIsAddDeviceModalOpen(false);
      setPaddyName("");
      setPaddyDescription("");
      setDeviceId("");
      setErrors({});
    } catch (error) {
      console.error("Error adding device:", error);
      setErrors({ submit: "Failed to add device. Please try again." });
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
      const { getDeviceGPS } = await import('@/lib/utils/deviceStatus');
      
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
        <nav className="bg-white/80 backdrop-blur-md shadow-sm sticky top-0 z-30 border-b border-green-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              {/* Breadcrumb Navigation */}
              <div className="flex items-center gap-2 text-sm">
                <button
                  onClick={() => router.push('/')}
                  className="flex items-center text-green-600 hover:text-green-800 transition-colors p-2 hover:bg-green-50 rounded-lg"
                  title="Home"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                  </svg>
                </button>
                <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <span className="font-bold text-gray-900">{field.fieldName}</span>
              </div>
              
              {/* Field Status Badges */}
              <div className="flex items-center gap-2">
                {field.status === 'harvested' && (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    🌾 Harvested
                  </span>
                )}
                {field.status === 'concluded' && (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                    🔚 Season Ended
                  </span>
                )}
              </div>
            </div>
            {/* Field Status badges moved to tab - no header scan UI */}
          </div>
        </nav>

        {/* Bottom Tab Navigation - Facebook Style */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-50 safe-area-bottom">
          <nav className="max-w-lg mx-auto flex justify-around items-center h-16 px-2">
            {/* Overview Tab */}
            <button
              onClick={() => setActiveTab('overview')}
              className={`relative flex flex-col items-center justify-center w-16 h-14 rounded-xl transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white ${
                activeTab === 'overview'
                  ? 'text-emerald-600'
                  : 'text-gray-400 hover:text-emerald-600'
              }`}
            >
              {/* Active Indicator */}
              <div className={`absolute -top-1 left-1/2 -translate-x-1/2 w-8 h-1 rounded-full transition-all duration-300 ${
                activeTab === 'overview' ? 'bg-emerald-600' : 'bg-transparent'
              }`} />
              <svg className={`w-6 h-6 transition-transform duration-300 ${activeTab === 'overview' ? 'scale-110' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={activeTab === 'overview' ? 2 : 1.5} d="M3 10.5L12 4l9 6.5V20a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1V10.5z" />
              </svg>
              {/* Label - only show when active */}
              <span className={`text-[10px] font-semibold mt-0.5 transition-all duration-300 ${
                activeTab === 'overview' ? 'opacity-100' : 'opacity-0 h-0'
              }`}>Overview</span>
            </button>

            {/* Paddies Tab */}
            <button
              onClick={() => setActiveTab('paddies')}
              className={`relative flex flex-col items-center justify-center w-16 h-14 rounded-xl transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white ${
                activeTab === 'paddies'
                  ? 'text-emerald-600'
                  : 'text-gray-400 hover:text-emerald-600'
              }`}
            >
              <div className={`absolute -top-1 left-1/2 -translate-x-1/2 w-8 h-1 rounded-full transition-all duration-300 ${
                activeTab === 'paddies' ? 'bg-emerald-600' : 'bg-transparent'
              }`} />
              <svg className={`w-6 h-6 transition-transform duration-300 ${activeTab === 'paddies' ? 'scale-110' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={activeTab === 'paddies' ? 2 : 1.5} d="M12 2c4 0 7 3 7 7a7 7 0 11-14 0c0-4 3-7 7-7zM5 20c1.5-2 4-3 7-3s5.5 1 7 3" />
              </svg>
              <span className={`text-[10px] font-semibold mt-0.5 transition-all duration-300 ${
                activeTab === 'paddies' ? 'opacity-100' : 'opacity-0 h-0'
              }`}>Paddies</span>
            </button>

            {/* Statistics Tab */}
            {hasDevices && (
              <button
                onClick={() => setActiveTab('statistics')}
                className={`relative flex flex-col items-center justify-center w-16 h-14 rounded-xl transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white ${
                  activeTab === 'statistics'
                    ? 'text-emerald-600'
                    : 'text-gray-400 hover:text-emerald-600'
                }`}
              >
                <div className={`absolute -top-1 left-1/2 -translate-x-1/2 w-8 h-1 rounded-full transition-all duration-300 ${
                  activeTab === 'statistics' ? 'bg-emerald-600' : 'bg-transparent'
                }`} />
                <svg className={`w-6 h-6 transition-transform duration-300 ${activeTab === 'statistics' ? 'scale-110' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={activeTab === 'statistics' ? 2 : 1.5} d="M7 16V10M12 16V7M17 16V13" />
                </svg>
                <span className={`text-[10px] font-semibold mt-0.5 transition-all duration-300 ${
                  activeTab === 'statistics' ? 'opacity-100' : 'opacity-0 h-0'
                }`}>Stats</span>
              </button>
            )}

            {/* Information Tab */}
            <button
              onClick={() => setActiveTab('information')}
              className={`relative flex flex-col items-center justify-center w-16 h-14 rounded-xl transition-all duration-300 ${
                activeTab === 'information'
                  ? 'text-green-600'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <div className={`absolute -top-1 left-1/2 -translate-x-1/2 w-8 h-1 rounded-full transition-all duration-300 ${
                activeTab === 'information' ? 'bg-emerald-600' : 'bg-transparent'
              }`} />
              <svg className={`w-6 h-6 transition-transform duration-300 ${activeTab === 'information' ? 'scale-110' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="9" strokeLinecap="round" strokeLinejoin="round" strokeWidth={activeTab === 'information' ? 2 : 1.5} />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={activeTab === 'information' ? 2 : 1.5} d="M12 8h.01M12 11v5" />
              </svg>
              <span className={`text-[10px] font-semibold mt-0.5 transition-all duration-300 ${
                activeTab === 'information' ? 'opacity-100' : 'opacity-0 h-0'
              }`}>Info</span>
            </button>

            {/* Control Panel Tab */}
            <button
              onClick={() => setActiveTab('control-panel')}
              className={`relative flex flex-col items-center justify-center w-16 h-14 rounded-xl transition-all duration-300 ${
                activeTab === 'control-panel'
                  ? 'text-green-600'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <div className={`absolute -top-1 left-1/2 -translate-x-1/2 w-8 h-1 rounded-full transition-all duration-300 ${
                activeTab === 'control-panel' ? 'bg-emerald-600' : 'bg-transparent'
              }`} />
              <svg className={`w-6 h-6 transition-transform duration-300 ${activeTab === 'control-panel' ? 'scale-110' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={activeTab === 'control-panel' ? 2 : 1.5} d="M12 8a4 4 0 100 8 4 4 0 000-8zm8 4c0 .7-.1 1.4-.3 2l1.8 1.4-2 3.5-2.1-.8a8.1 8.1 0 01-1.6.9L14.7 21h-5.4l-.9-2.8c-.6-.2-1.1-.5-1.6-.9l-2.1.8-2-3.5L4.3 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2L2.5 8.6l2-3.5 2.1.8c.5-.4 1-.7 1.6-.9L9.3 3h5.4l.9 2.8c.6.2 1.1.5 1.6.9l2.1-.8 2 3.5-1.8 1.4c.2.6.3 1.3.3 2z" />
              </svg>
              <span className={`text-[10px] font-semibold mt-0.5 transition-all duration-300 ${
                activeTab === 'control-panel' ? 'opacity-100' : 'opacity-0 h-0'
              }`}>Control</span>
            </button>
          </nav>
        </div>

        {/* Content with smooth transitions */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24">
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
                <ControlPanelTab />
              )}
            </div>
          </div>
        </main>

        {/* Floating Action Button - Add Paddy (only on Paddies tab) */}
        {activeTab === 'paddies' && (
          <button 
            onClick={() => setIsAddDeviceModalOpen(true)}
            className="fixed bottom-8 right-8 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-full shadow-2xl hover:shadow-3xl hover:from-green-700 hover:to-emerald-700 active:scale-95 transition-all flex items-center justify-center w-14 h-14 z-40"
            title="Add New Paddy"
          >
            <span className="text-3xl font-light">+</span>
          </button>
        )}
        
        {/* Add Device Modal */}
        {isAddDeviceModalOpen && (
          <>
            {/* Glassmorphism Overlay */}
            <div 
              onClick={() => {
                setIsAddDeviceModalOpen(false);
                setErrors({});
                setPaddyName("");
                setPaddyDescription("");
                setDeviceId("");
              }}
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
                  
                  <form onSubmit={handleAddDevice} className="space-y-5">
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

                    <div className="flex gap-3 pt-4">
                      <button
                        type="button"
                        onClick={() => {
                          setIsAddDeviceModalOpen(false);
                          setErrors({});
                          setPaddyName("");
                          setPaddyDescription("");
                          setDeviceId("");
                        }}
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
        )}
        
        {/* Map Modal */}
        {showMapModal && (
          <>
            {/* Glassmorphism Overlay */}
            <div 
              onClick={() => setShowMapModal(false)}
              className="fixed inset-0 backdrop-blur-sm bg-black/20 z-40 transition-all"
            />
            
            {/* Map Modal */}
            <div className="fixed inset-x-0 bottom-0 z-50 animate-slide-up">
              <div className="bg-white rounded-t-3xl shadow-2xl h-[80vh] flex flex-col border-t-4 border-green-500">
                {/* Handle Bar */}
                <div className="flex justify-center pt-3 pb-4">
                  <div className="w-12 h-1.5 bg-green-300 rounded-full" />
                </div>
                
                {/* Modal Header */}
                <div className="px-6 pb-4 border-b border-gray-200">
                  <h2 className="text-2xl font-bold text-gray-900">{selectedPaddy?.paddyName}</h2>
                  <p className="text-sm text-gray-600 mt-1">Device: {selectedPaddy?.deviceId}</p>
                </div>
                
                {/* Map Content */}
                <div className="flex-1 relative">
                  {loadingLocation ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-6">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mb-4"></div>
                      <p className="text-gray-600">Fetching location...</p>
                    </div>
                  ) : locationData ? (
                    <div className="absolute inset-0">
                      {/* Map Container */}
                      <iframe
                        width="100%"
                        height="100%"
                        frameBorder="0"
                        style={{ border: 0 }}
                        src={`https://www.google.com/maps?q=${locationData.lat},${locationData.lng}&output=embed`}
                        allowFullScreen
                      />
                      
                      {/* Last Location Info Overlay */}
                      <div className="absolute top-4 left-4 right-4 bg-white rounded-lg shadow-lg p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-2">
                            <svg className="w-5 h-5 text-green-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <div>
                              <p className="text-sm font-medium text-gray-900">Last location</p>
                              <p className="text-xs text-gray-600 mt-0.5">{getTimeAgo(locationData.timestamp)}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => setShowMapModal(false)}
                            className="text-gray-400 hover:text-gray-600 transition-colors"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-6">
                      <div className="max-w-sm w-full bg-yellow-50 border border-yellow-200 rounded-lg p-6">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-start gap-3">
                            <svg className="w-6 h-6 text-yellow-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <div>
                              <p className="font-medium text-gray-900">
                                {otherDevicesHaveLocation ? "This device doesn't have a location" : "Location isn't initialized"}
                              </p>
                              <p className="text-sm text-gray-600 mt-1">
                                GPS coordinates have not been received from this device yet.
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => setShowMapModal(false)}
                            className="text-gray-400 hover:text-gray-600 transition-colors ml-2"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Close Button */}
                <div className="px-6 py-4 border-t border-gray-200">
                  <button
                    onClick={() => setShowMapModal(false)}
                    className="w-full px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </>
        )}


      </div>
    </ProtectedRoute>
  );
}
