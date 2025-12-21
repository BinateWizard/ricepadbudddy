'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, useMemo, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { db, database } from '@/lib/firebase';
import { doc, getDoc, collection, getDocs, updateDoc, setDoc, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { ref, onValue } from 'firebase/database';
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
import { ACTIVITIES } from '@/lib/data/activities';
import { VARIETY_ACTIVITY_TRIGGERS } from '@/lib/data/activityTriggers';

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
    const logRef = doc(collection(db, `users/${userId}/fields/${fieldId}/paddies/${paddyId}/logs`));
    await setDoc(logRef, {
      ...readings,
      timestamp: new Date(),
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
  const [activeTab, setActiveTab] = useState<'overview' | 'paddies' | 'statistics' | 'information'>('overview');
  
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
              
              {/* Field Status Badge */}
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
        </nav>

        {/* Bottom Tab Navigation - Facebook Style */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-50 safe-area-bottom">
          <nav className="max-w-lg mx-auto flex justify-around items-center h-16 px-2">
            {/* Overview Tab */}
            <button
              onClick={() => setActiveTab('overview')}
              className={`relative flex flex-col items-center justify-center w-16 h-14 rounded-xl transition-all duration-300 ${
                activeTab === 'overview'
                  ? 'text-green-600'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {/* Active Indicator */}
              <div className={`absolute -top-1 left-1/2 -translate-x-1/2 w-8 h-1 rounded-full transition-all duration-300 ${
                activeTab === 'overview' ? 'bg-green-600' : 'bg-transparent'
              }`} />
              {/* Icon */}
              <svg className={`w-6 h-6 transition-transform duration-300 ${activeTab === 'overview' ? 'scale-110' : ''}`} fill={activeTab === 'overview' ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={activeTab === 'overview' ? 0 : 2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
              </svg>
              {/* Label - only show when active */}
              <span className={`text-[10px] font-semibold mt-0.5 transition-all duration-300 ${
                activeTab === 'overview' ? 'opacity-100' : 'opacity-0 h-0'
              }`}>Overview</span>
            </button>

            {/* Paddies Tab */}
            <button
              onClick={() => setActiveTab('paddies')}
              className={`relative flex flex-col items-center justify-center w-16 h-14 rounded-xl transition-all duration-300 ${
                activeTab === 'paddies'
                  ? 'text-green-600'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <div className={`absolute -top-1 left-1/2 -translate-x-1/2 w-8 h-1 rounded-full transition-all duration-300 ${
                activeTab === 'paddies' ? 'bg-green-600' : 'bg-transparent'
              }`} />
              <svg className={`w-6 h-6 transition-transform duration-300 ${activeTab === 'paddies' ? 'scale-110' : ''}`} fill={activeTab === 'paddies' ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={activeTab === 'paddies' ? 0 : 2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <span className={`text-[10px] font-semibold mt-0.5 transition-all duration-300 ${
                activeTab === 'paddies' ? 'opacity-100' : 'opacity-0 h-0'
              }`}>Paddies</span>
            </button>

            {/* Statistics Tab */}
            {hasDevices && (
              <button
                onClick={() => setActiveTab('statistics')}
                className={`relative flex flex-col items-center justify-center w-16 h-14 rounded-xl transition-all duration-300 ${
                  activeTab === 'statistics'
                    ? 'text-green-600'
                    : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                <div className={`absolute -top-1 left-1/2 -translate-x-1/2 w-8 h-1 rounded-full transition-all duration-300 ${
                  activeTab === 'statistics' ? 'bg-green-600' : 'bg-transparent'
                }`} />
                <svg className={`w-6 h-6 transition-transform duration-300 ${activeTab === 'statistics' ? 'scale-110' : ''}`} fill={activeTab === 'statistics' ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={activeTab === 'statistics' ? 0 : 2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
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
                activeTab === 'information' ? 'bg-green-600' : 'bg-transparent'
              }`} />
              <svg className={`w-6 h-6 transition-transform duration-300 ${activeTab === 'information' ? 'scale-110' : ''}`} fill={activeTab === 'information' ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={activeTab === 'information' ? 0 : 2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className={`text-[10px] font-semibold mt-0.5 transition-all duration-300 ${
                activeTab === 'information' ? 'opacity-100' : 'opacity-0 h-0'
              }`}>Info</span>
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
          </div>
        </main>
        
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

// Helper function to sanitize stage names for Firebase paths
const sanitizeStageName = (stageName: string) => {
  return stageName.replace(/\//g, '-').replace(/\s+/g, '-').toLowerCase();
};

// Overview Tab Component
function OverviewTab({ field, paddies }: { field: any; paddies: any[] }) {
  const { user } = useAuth();
  const [completedTasks, setCompletedTasks] = useState<{ [key: string]: boolean }>({});
  const [loadingTasks, setLoadingTasks] = useState(true);

  if (!field) return null;

  const variety = getVarietyByName(field.riceVariety);
  
  if (!variety) {
    return (
      <div className="bg-white rounded-xl shadow-md p-6">
        <p className="text-red-600">Rice variety data not found</p>
      </div>
    );
  }
  
  const daysSincePlanting = getDaysSincePlanting(field.startDay);
  const currentStage = getCurrentStage(variety, daysSincePlanting);
  const expectedHarvest = getExpectedHarvestDate(field.startDay, variety);
  const progress = getGrowthProgress(variety, daysSincePlanting);

  // Get variety-specific activities for current day and upcoming activities
  const currentAndUpcomingActivities = variety.activities
    .filter(activity => 
      activity.day >= daysSincePlanting && 
      activity.day <= (currentStage?.endDay || daysSincePlanting + 7)
    )
    .sort((a, b) => a.day - b.day);

  const varietyTriggers = VARIETY_ACTIVITY_TRIGGERS[field.riceVariety] || [];
  const currentTriggers = varietyTriggers.filter(t => t.stage === currentStage?.name);

  // Load completed tasks from Firestore
  useEffect(() => {
    const loadCompletedTasks = async () => {
      if (!user || !field.id || !currentStage) {
        setLoadingTasks(false);
        return;
      }
      
      try {
        const sanitizedStageName = sanitizeStageName(currentStage.name);
        const tasksPath = `users/${user.uid}/fields/${field.id}/tasks/${sanitizedStageName}`;
        console.log('Loading tasks from:', tasksPath);
        const tasksRef = doc(db, 'users', user.uid, 'fields', field.id, 'tasks', sanitizedStageName);
        const tasksSnap = await getDoc(tasksRef);
        
        if (tasksSnap.exists()) {
          console.log('Tasks loaded successfully');
          setCompletedTasks(tasksSnap.data().completed || {});
        } else {
          console.log('No existing tasks document found (this is normal for first time)');
        }
      } catch (error: any) {
        console.error('Error loading tasks:', error);
        console.error('Error code:', error?.code);
        if (error?.code === 'permission-denied') {
          console.error('PERMISSION DENIED: Check Firestore rules for tasks subcollection');
        }
      } finally {
        setLoadingTasks(false);
      }
    };

    loadCompletedTasks();
  }, [user, field.id, currentStage?.name]);

  // Toggle task completion
  const toggleTask = async (taskKey: string) => {
    if (!user || !field.id || !currentStage) return;

    const newCompletedTasks = {
      ...completedTasks,
      [taskKey]: !completedTasks[taskKey]
    };

    setCompletedTasks(newCompletedTasks);

    try {
      const sanitizedStageName = sanitizeStageName(currentStage.name);
      const tasksRef = doc(db, 'users', user.uid, 'fields', field.id, 'tasks', sanitizedStageName);
      await setDoc(tasksRef, {
        completed: newCompletedTasks,
        updatedAt: new Date()
      }, { merge: true });
    } catch (error) {
      console.error('Error saving task:', error);
      // Revert on error
      setCompletedTasks(completedTasks);
    }
  };

  return (
    <div className="space-y-6">
      {/* Growth Progress Bar */}
      <div className="bg-white rounded-xl shadow-md p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-900">Growth Progress</h2>
          <div className="text-right">
            <p className="text-sm text-gray-600">Expected Harvest</p>
            <p className="text-lg font-semibold text-gray-900">
              {new Date(expectedHarvest).toLocaleDateString()}
            </p>
          </div>
        </div>
        
        {/* Simple Progress Bar */}
        <div className="mb-2">
          <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-green-500 to-green-600 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Days Counter - Smaller */}
        <div className="flex justify-end mb-4">
          <div className="text-right">
            <p className="text-lg font-bold text-green-600">
              {daysSincePlanting} / {variety.maturityDays.max || 130}
            </p>
            <p className="text-xs text-gray-500">days</p>
          </div>
        </div>

        {/* Current Stage - Below Progress Bar */}
        {currentStage && (
          <div className="p-4 bg-green-50 rounded-lg border border-green-200">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 bg-green-600 rounded-full animate-pulse" />
              <h3 className="font-semibold text-green-900">Current Stage: {currentStage.name}</h3>
            </div>
            <p className="text-sm text-green-800">
              Day {currentStage.startDay} - {currentStage.endDay} of growth cycle
            </p>
          </div>
        )}
      </div>

      {/* Growth Stages */}
      <div className="bg-white rounded-xl shadow-md p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Growth Stages</h2>
        <div className="space-y-2">
          {variety?.growthStages?.map((stage, index) => {
            const isPassed = daysSincePlanting > stage.endDay;
            const isCurrent = daysSincePlanting >= stage.startDay && daysSincePlanting <= stage.endDay;
            
            return (
              <div
                key={index}
                className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                  isCurrent ? 'bg-green-50 border-green-300' :
                  isPassed ? 'bg-gray-50 border-gray-200' :
                  'bg-white border-gray-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-3 h-3 rounded-full ${
                      isPassed ? 'bg-green-600' :
                      isCurrent ? 'bg-green-600 animate-pulse' :
                      'bg-gray-300'
                    }`}
                  />
                  <span className={`font-medium ${
                    isCurrent ? 'text-green-900' : 'text-gray-900'
                  }`}>
                    {stage.name}
                  </span>
                </div>
                <span className="text-sm text-gray-600">
                  {stage.startDay}-{stage.endDay} days
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Activities & Tasks */}
      <div className="bg-white rounded-xl shadow-md p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Activities & Tasks</h2>
        
        {/* Variety-Specific Triggers */}
        {currentTriggers.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Variety-Specific Notes</h3>
            <div className="space-y-2">
              {currentTriggers.map((trigger, index) => (
                <div
                  key={index}
                  className={`p-3 rounded-lg border ${
                    trigger.type === 'warning' ? 'bg-red-50 border-red-200' :
                    trigger.type === 'precaution' ? 'bg-yellow-50 border-yellow-200' :
                    trigger.type === 'optional' ? 'bg-blue-50 border-blue-200' :
                    'bg-gray-50 border-gray-200'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-lg">
                      {trigger.type === 'warning' ? '⚠️' :
                       trigger.type === 'precaution' ? '⚡' :
                       trigger.type === 'optional' ? '💡' : '👀'}
                    </span>
                    <p className="text-sm text-gray-800">{trigger.message}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Variety-Specific Activities */}
        {currentAndUpcomingActivities.length > 0 ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">Upcoming Activities</h3>
              <span className="text-xs text-gray-500">
                {Object.values(completedTasks).filter(Boolean).length} / {currentAndUpcomingActivities.length} completed
              </span>
            </div>
            {currentAndUpcomingActivities.map((activity, index) => {
              const taskKey = `day-${activity.day}-${index}`;
              const isCompleted = Boolean(completedTasks[taskKey]);
              const daysDiff = activity.day - daysSincePlanting;
              const isPast = daysDiff < 0;
              const isToday = daysDiff === 0;
              
              return (
                <div 
                  key={index} 
                  className={`flex items-start gap-3 p-3 rounded-lg transition-colors cursor-pointer ${
                    isCompleted 
                      ? 'bg-green-50 hover:bg-green-100 border border-green-200' 
                      : isToday 
                      ? 'bg-yellow-50 hover:bg-yellow-100 border border-yellow-300'
                      : 'bg-gray-50 hover:bg-gray-100'
                  }`}
                  onClick={() => !loadingTasks && toggleTask(taskKey)}
                >
                  <input
                    type="checkbox"
                    checked={isCompleted}
                    onChange={() => toggleTask(taskKey)}
                    onClick={(e) => e.stopPropagation()}
                    disabled={loadingTasks}
                    className="mt-1 w-5 h-5 text-green-600 rounded focus:ring-green-500 cursor-pointer disabled:opacity-50"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                        isToday ? 'bg-yellow-200 text-yellow-900' :
                        isPast ? 'bg-red-100 text-red-700' :
                        'bg-blue-100 text-blue-700'
                      }`}>
                        {isToday ? 'TODAY' : isPast ? `Day ${activity.day}` : `Day ${activity.day} (in ${daysDiff} days)`}
                      </span>
                      {activity.type && (
                        <span className="text-xs px-2 py-0.5 rounded bg-gray-200 text-gray-700 capitalize">
                          {activity.type.replace('-', ' ')}
                        </span>
                      )}
                    </div>
                    <p className={`font-medium ${isCompleted ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
                      {activity.action}
                    </p>
                    <div className="mt-2 space-y-1">
                      {activity.water && (
                        <p className={`text-sm ${isCompleted ? 'text-gray-400' : 'text-blue-700'}`}>
                          💧 {activity.water}
                        </p>
                      )}
                      {activity.fertilizer && (
                        <p className={`text-sm ${isCompleted ? 'text-gray-400' : 'text-green-700'}`}>
                          🌾 {activity.fertilizer}
                        </p>
                      )}
                      {activity.notes && (
                        <p className={`text-sm ${isCompleted ? 'text-gray-400' : 'text-gray-600'}`}>
                          ℹ️ {activity.notes}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-gray-500 text-center py-8">No upcoming activities</p>
        )}
      </div>
    </div>
  );
}

// Helper function to check device status
function getDeviceStatus(paddy: any, deviceReadings: any[]) {
  const deviceReading = deviceReadings.find(r => r.deviceId === paddy.deviceId);
  
  if (!deviceReading) {
    return {
      status: 'offline',
      message: 'Device is offline. Check power supply and network connection.',
      color: 'red',
      badge: 'Offline'
    };
  }
  
  const deviceStatus = deviceReading.status || 'disconnected';
  const hasNPK = deviceReading.npk && (
    deviceReading.npk.n !== undefined || 
    deviceReading.npk.p !== undefined || 
    deviceReading.npk.k !== undefined
  );
  
  // Check if device has recent NPK timestamp (within last 10 minutes)
  let hasRecentNPK = false;
  if (deviceReading.npk?.timestamp) {
    const npkTimestamp = deviceReading.npk.timestamp;
    // Handle both seconds and milliseconds timestamps
    const npkTime = npkTimestamp < 10000000000 ? npkTimestamp * 1000 : npkTimestamp;
    const timeSinceNPK = Date.now() - npkTime;
    hasRecentNPK = timeSinceNPK < 10 * 60 * 1000; // 10 minutes
  }
  
  // Device is online if:
  // 1. Status is 'connected' or 'alive' (ESP32 sends 'alive')
  // 2. OR has recent NPK readings (within 10 minutes)
  const isOnline = deviceStatus === 'connected' || 
                   deviceStatus === 'alive' || 
                   hasRecentNPK;
  
  if (!isOnline) {
    return {
      status: 'offline',
      message: 'Device is offline. Check power supply and network connection.',
      color: 'red',
      badge: 'Offline'
    };
  }
  
  if (isOnline && !hasNPK) {
    return {
      status: 'sensor-issue',
      message: 'Device is online but sensors are not reporting data. Check sensor connections.',
      color: 'yellow',
      badge: 'Sensor Issue'
    };
  }
  
  return {
    status: 'ok',
    message: 'Device and sensors are working properly.',
    color: 'green',
    badge: 'Connected'
  };
}

// Paddies Tab Component
function PaddiesTab({ paddies, deviceReadings, fieldId, onAddDevice, onViewLocation }: { paddies: any[]; deviceReadings?: any[]; fieldId: string; onAddDevice: () => void; onViewLocation: (paddy: any, e: React.MouseEvent) => void }) {
  const router = useRouter();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Connected Paddies</h2>
      </div>
      {paddies.length === 0 ? (
        <div className="bg-white rounded-xl shadow-md p-12 text-center">
          <p className="text-gray-500">No paddies connected yet</p>
        </div>
      ) : (
        <div className="space-y-4">
          {paddies.map((paddy) => {
            const deviceStatus = getDeviceStatus(paddy, deviceReadings || []);
            const deviceReading = deviceReadings?.find(r => r.deviceId === paddy.deviceId);
            const npk = deviceReading?.npk;
            
            return (
              <div 
                key={paddy.id} 
                onClick={() => router.push(`/device/${paddy.deviceId}`)}
                className="bg-white rounded-xl shadow-md border border-gray-200 p-6 hover:border-green-500 hover:shadow-lg transition-all cursor-pointer">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900">{paddy.paddyName}</h3>
                    <p className="text-sm text-gray-600">Device: {paddy.deviceId}</p>
                    {paddy.description && (
                      <p className="text-sm text-gray-500 mt-2">{paddy.description}</p>
                    )}
                    
                    {/* NPK Values */}
                    {npk && (npk.n !== undefined || npk.p !== undefined || npk.k !== undefined) && (
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        {npk.n !== undefined && (
                          <div className="bg-blue-50 rounded-lg p-2">
                            <p className="text-xs text-blue-600 font-medium">N</p>
                            <p className="text-sm font-bold text-blue-900">{Math.round(npk.n)}</p>
                            <p className="text-xs text-blue-500">mg/kg</p>
                          </div>
                        )}
                        {npk.p !== undefined && (
                          <div className="bg-purple-50 rounded-lg p-2">
                            <p className="text-xs text-purple-600 font-medium">P</p>
                            <p className="text-sm font-bold text-purple-900">{Math.round(npk.p)}</p>
                            <p className="text-xs text-purple-500">mg/kg</p>
                          </div>
                        )}
                        {npk.k !== undefined && (
                          <div className="bg-orange-50 rounded-lg p-2">
                            <p className="text-xs text-orange-600 font-medium">K</p>
                            <p className="text-sm font-bold text-orange-900">{Math.round(npk.k)}</p>
                            <p className="text-xs text-orange-500">mg/kg</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => onViewLocation(paddy, e)}
                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                      title="View location on map"
                    >
                      <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </button>
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                      deviceStatus.color === 'green' ? 'bg-green-100 text-green-800' :
                      deviceStatus.color === 'yellow' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {deviceStatus.badge}
                    </span>
                  </div>
                </div>
                <div className={`mt-3 p-3 rounded-lg text-sm ${
                  deviceStatus.color === 'green' ? 'bg-green-50 text-green-800' :
                  deviceStatus.color === 'yellow' ? 'bg-yellow-50 text-yellow-800' :
                  'bg-red-50 text-red-800'
                }`}>
                  {deviceStatus.message}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Floating Action Button - Add Paddy */}
      <button 
        onClick={onAddDevice}
        className="fixed bottom-8 right-8 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-full shadow-2xl hover:shadow-3xl hover:from-green-700 hover:to-emerald-700 active:scale-95 transition-all flex items-center justify-center w-14 h-14 z-40"
        title="Add New Paddy"
      >
        <span className="text-3xl font-light">+</span>
      </button>
    </div>
  );
}

// Statistics Tab Component
function StatisticsTab({ paddies, deviceReadings, fieldId }: { paddies: any[]; deviceReadings: any[]; fieldId: string }) {
  const { user } = useAuth();
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | 'all'>('7d');
  const [historicalLogs, setHistoricalLogs] = useState<any[]>([]);
  const [realtimeLogs, setRealtimeLogs] = useState<any[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(true); // Start with true to show loading
  const [isLogging, setIsLogging] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [fieldStats, setFieldStats] = useState<{
    nitrogen: { current: number | null; average: number | null; min: number | null; max: number | null };
    phosphorus: { current: number | null; average: number | null; min: number | null; max: number | null };
    potassium: { current: number | null; average: number | null; min: number | null; max: number | null };
  } | null>(null);
  const [hasInitialized, setHasInitialized] = useState(false);
  
  // Calculate field-level statistics from current device readings AND historical logs
  useEffect(() => {
    console.log('[Statistics] Device readings:', deviceReadings);
    console.log('[Statistics] Historical logs:', historicalLogs.length);
    
    // Get current NPK values from RTDB
    const npkValues = deviceReadings
      .filter(r => r && r.npk)
      .map(r => r.npk);

    console.log('[Statistics] NPK values from devices:', npkValues);

    // Get historical values from logs
    const historicalNitrogen = historicalLogs
      .filter(log => log && log.nitrogen !== undefined && log.nitrogen !== null)
      .map(log => log.nitrogen as number);
    
    const historicalPhosphorus = historicalLogs
      .filter(log => log && log.phosphorus !== undefined && log.phosphorus !== null)
      .map(log => log.phosphorus as number);
    
    const historicalPotassium = historicalLogs
      .filter(log => log && log.potassium !== undefined && log.potassium !== null)
      .map(log => log.potassium as number);

    // Current values from RTDB - get all values and use the first one as "current"
    const allNitrogenFromDevices = npkValues.map(n => n?.n).filter(n => n !== undefined && n !== null) as number[];
    const allPhosphorusFromDevices = npkValues.map(n => n?.p).filter(n => n !== undefined && n !== null) as number[];
    const allPotassiumFromDevices = npkValues.map(n => n?.k).filter(n => n !== undefined && n !== null) as number[];
    
    const currentNitrogen = allNitrogenFromDevices.length > 0 ? allNitrogenFromDevices[0] : undefined;
    const currentPhosphorus = allPhosphorusFromDevices.length > 0 ? allPhosphorusFromDevices[0] : undefined;
    const currentPotassium = allPotassiumFromDevices.length > 0 ? allPotassiumFromDevices[0] : undefined;

    // Combine current and historical for comprehensive stats
    // Include all device values, not just the first one
    const allNitrogen = [...allNitrogenFromDevices, ...historicalNitrogen];
    const allPhosphorus = [...allPhosphorusFromDevices, ...historicalPhosphorus];
    const allPotassium = [...allPotassiumFromDevices, ...historicalPotassium];

    console.log('[Statistics] Combined data - N:', allNitrogen, 'P:', allPhosphorus, 'K:', allPotassium);

    const calculateStats = (current: number | undefined, allValues: number[]) => {
      if (allValues.length === 0 && current === undefined) {
        return { current: null, average: null, min: null, max: null };
      }
      
      if (allValues.length === 0) {
        return {
          current: current || null,
          average: current || null,
          min: current || null,
          max: current || null,
        };
      }

      return {
        current: current !== undefined ? current : (allValues.length > 0 ? allValues[allValues.length - 1] : null),
        average: allValues.reduce((a, b) => a + b, 0) / allValues.length,
        min: Math.min(...allValues),
        max: Math.max(...allValues),
      };
    };

    const stats = {
      nitrogen: calculateStats(currentNitrogen, allNitrogen),
      phosphorus: calculateStats(currentPhosphorus, allPhosphorus),
      potassium: calculateStats(currentPotassium, allPotassium),
    };

    console.log('[Statistics] Calculated stats:', stats);
    setFieldStats(stats);
  }, [deviceReadings, historicalLogs]);

  // Manual log function - logs current readings immediately
  const handleManualLog = async () => {
    if (!user) return;
    
    setIsLogging(true);
    try {
      const { logSensorReadings } = await import('@/lib/utils/sensorLogging');
      let loggedCount = 0;
      
      for (const reading of deviceReadings) {
        if (reading.npk && (reading.npk.n !== undefined || reading.npk.p !== undefined || reading.npk.k !== undefined)) {
          const paddy = paddies.find(p => p.deviceId === reading.deviceId);
          if (paddy) {
            console.log(`[Manual Log] Logging ${reading.deviceId}:`, reading.npk);
            await logSensorReadings(user.uid, fieldId, paddy.id, reading.npk);
            loggedCount++;
          }
        }
      }
      
      if (loggedCount > 0) {
        alert(`Successfully logged ${loggedCount} reading(s) to history!`);
        // Refresh historical logs by re-triggering the fetch
        const currentRange = timeRange;
        setTimeRange('7d');
        setTimeout(() => setTimeRange(currentRange), 100);
      } else {
        alert('No NPK data available to log. Make sure devices are connected and sending data.');
      }
    } catch (error) {
      console.error('Error manually logging:', error);
      alert('Failed to log readings. Please try again.');
    } finally {
      setIsLogging(false);
    }
  };
  
  // Reset to page 1 when time range changes
  useEffect(() => {
    setCurrentPage(1);
  }, [timeRange]);

  // Real-time RTDB listeners for all devices
  useEffect(() => {
    if (!paddies.length) return;

    const unsubscribers: (() => void)[] = [];

    paddies.forEach((paddy) => {
      if (!paddy.deviceId) return;

      const npkRef = ref(database, `devices/${paddy.deviceId}/npk`);
      const unsubscribe = onValue(npkRef, (snapshot) => {
        if (!snapshot.exists()) return;
        
        const data = snapshot.val();
        const timestamp = data.timestamp && data.timestamp > 1700000000000 
          ? new Date(data.timestamp) 
          : new Date();
        
        if (data.n !== undefined || data.p !== undefined || data.k !== undefined) {
          const newLog = {
            id: `rtdb-${paddy.deviceId}-${Date.now()}`,
            timestamp,
            nitrogen: data.n,
            phosphorus: data.p,
            potassium: data.k,
            paddyId: paddy.id,
            paddyName: paddy.paddyName,
            deviceId: paddy.deviceId,
            _src: 'rtdb'
          };
          
          setRealtimeLogs(prev => {
            // Remove old logs from same device and add new one
            const filtered = prev.filter(log => log.deviceId !== paddy.deviceId || log._src !== 'rtdb');
            return [...filtered, newLog].slice(-20); // Keep last 20 real-time entries
          });
        }
      });

      unsubscribers.push(unsubscribe);
    });

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [paddies]);

  // Initial data fetch when component mounts or paddies become available
  useEffect(() => {
    if (!user || paddies.length === 0) {
      setIsLoadingLogs(false);
      return;
    }
    
    // Mark as initialized once we have the required data
    if (!hasInitialized && paddies.length > 0) {
      setHasInitialized(true);
    }
  }, [user, paddies, hasInitialized]);

  // Real-time Firestore listeners for historical logs
  useEffect(() => {
    if (!user || paddies.length === 0) {
      setIsLoadingLogs(false);
      return;
    }
    
    setIsLoadingLogs(true);

    const now = new Date();
    let startDate = new Date();
    switch (timeRange) {
      case '7d': startDate.setDate(now.getDate() - 7); break;
      case '30d': startDate.setDate(now.getDate() - 30); break;
      case '90d': startDate.setDate(now.getDate() - 90); break;
      case 'all': startDate = new Date(0); break;
    }

    const unsubscribers: (() => void)[] = [];
    let latestLogs: any[] = [];
    let initializedCount = 0;
    const totalPaddies = paddies.length;

    const mergeAndSet = (isInitial = false) => {
      if (isInitial) {
        initializedCount++;
      }
      const sorted = latestLogs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      setHistoricalLogs(sorted);
      // Only set loading to false after all paddies have initialized
      if (initializedCount >= totalPaddies || !isInitial) {
        setIsLoadingLogs(false);
      }
    };

    paddies.forEach((paddy) => {
      const logsRef = collection(db, `users/${user.uid}/fields/${fieldId}/paddies/${paddy.id}/logs`);
      const q = timeRange === 'all' ? logsRef : query(logsRef, where('timestamp', '>=', startDate));
      
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const arr: any[] = [];
        snapshot.forEach((doc) => {
          const data: any = doc.data();
          const logDate = data.timestamp?.toDate?.() || new Date(data.timestamp);
          if (logDate >= startDate) {
            arr.push({ 
              ...data, 
              id: doc.id, 
              paddyId: paddy.id, 
              paddyName: paddy.paddyName,
              timestamp: logDate,
              _src: 'paddy'
            });
          }
        });
        
        // Update logs for this paddy
        latestLogs = latestLogs.filter(log => log.paddyId !== paddy.id || log._src !== 'paddy');
        latestLogs = [...latestLogs, ...arr];
        
        // Check if this is the first snapshot (initial load)
        const isInitial = initializedCount < totalPaddies;
        mergeAndSet(isInitial);
      }, (err) => {
        console.error(`Paddy logs listener error for ${paddy.id}:`, err);
        initializedCount++;
        if (initializedCount >= totalPaddies) {
          setIsLoadingLogs(false);
        }
      });

      unsubscribers.push(unsubscribe);
    });

    return () => {
      unsubscribers.forEach(unsub => {
        try { unsub(); } catch {}
      });
    };
  }, [user, fieldId, paddies, timeRange]);
  
  return (
    <div className="space-y-4">
      {/* Debug Info - Show current device readings */}
      {deviceReadings.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
          <div className="flex items-start gap-2">
            <svg className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-blue-900 mb-1">Current Device Status</h3>
              <p className="text-xs text-blue-700 mb-2">
                Found {deviceReadings.length} device(s) connected. 
                {deviceReadings.filter(r => r.npk && (r.npk.n !== undefined || r.npk.p !== undefined || r.npk.k !== undefined)).length > 0
                  ? ` ${deviceReadings.filter(r => r.npk && (r.npk.n !== undefined || r.npk.p !== undefined || r.npk.k !== undefined)).length} device(s) have NPK data.`
                  : ' No devices have NPK data yet.'}
              </p>
              <details className="text-xs">
                <summary className="cursor-pointer text-blue-600 hover:text-blue-800">View device data (debug)</summary>
                <pre className="mt-2 p-2 bg-white rounded text-xs overflow-auto max-h-40">
                  {JSON.stringify(deviceReadings.map(r => ({
                    deviceId: r.deviceId,
                    status: r.status,
                    npk: r.npk,
                    connectedAt: r.connectedAt
                  })), null, 2)}
                </pre>
              </details>
            </div>
          </div>
        </div>
      )}

      {/* Average Statistics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Nitrogen Card */}
        <div className="bg-white rounded-lg shadow-md p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-gray-700">Nitrogen (N)</h3>
            <span className="text-xl">🧪</span>
          </div>
          <p className="text-xl font-bold text-gray-900">
            {fieldStats && fieldStats.nitrogen.current !== null && fieldStats.nitrogen.current !== undefined
              ? Math.round(fieldStats.nitrogen.current)
              : '--'}
          </p>
          <p className="text-xs text-gray-500 mt-1">mg/kg</p>
          {fieldStats && fieldStats.nitrogen.average !== null && (
            <p className="text-xs text-gray-400 mt-1">Avg: {Math.round(fieldStats.nitrogen.average)}</p>
          )}
        </div>

        {/* Phosphorus Card */}
        <div className="bg-white rounded-lg shadow-md p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-gray-700">Phosphorus (P)</h3>
            <span className="text-xl">⚗️</span>
          </div>
          <p className="text-xl font-bold text-gray-900">
            {fieldStats && fieldStats.phosphorus.current !== null && fieldStats.phosphorus.current !== undefined
              ? Math.round(fieldStats.phosphorus.current)
              : '--'}
          </p>
          <p className="text-xs text-gray-500 mt-1">mg/kg</p>
          {fieldStats && fieldStats.phosphorus.average !== null && (
            <p className="text-xs text-gray-400 mt-1">Avg: {Math.round(fieldStats.phosphorus.average)}</p>
          )}
        </div>

        {/* Potassium Card */}
        <div className="bg-white rounded-lg shadow-md p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-gray-700">Potassium (K)</h3>
            <span className="text-xl">🔬</span>
          </div>
          <p className="text-xl font-bold text-gray-900">
            {fieldStats && fieldStats.potassium.current !== null && fieldStats.potassium.current !== undefined
              ? Math.round(fieldStats.potassium.current)
              : '--'}
          </p>
          <p className="text-xs text-gray-500 mt-1">mg/kg</p>
          {fieldStats && fieldStats.potassium.average !== null && (
            <p className="text-xs text-gray-400 mt-1">Avg: {Math.round(fieldStats.potassium.average)}</p>
          )}
        </div>

        {/* Temperature Card - Coming Soon */}
        <div className="bg-gray-50 rounded-lg shadow-md p-4 opacity-60">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-gray-600">Temperature</h3>
            <span className="text-xl">🌡️</span>
          </div>
          <p className="text-xl font-bold text-gray-600">--</p>
          <p className="text-xs text-gray-400 mt-1">Coming soon</p>
        </div>

        {/* Humidity Card - Coming Soon */}
        <div className="bg-gray-50 rounded-lg shadow-md p-4 opacity-60">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-gray-600">Humidity</h3>
            <span className="text-xl">💧</span>
          </div>
          <p className="text-xl font-bold text-gray-600">--</p>
          <p className="text-xs text-gray-400 mt-1">Coming soon</p>
        </div>

        {/* Water Level Card - Coming Soon */}
        <div className="bg-gray-50 rounded-lg shadow-md p-4 opacity-60">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-gray-600">Water Level</h3>
            <span className="text-xl">🌊</span>
          </div>
          <p className="text-xl font-bold text-gray-600">--</p>
          <p className="text-xs text-gray-400 mt-1">Coming soon</p>
        </div>
      </div>

      {/* Data Trends */}
      <div className="bg-white rounded-xl shadow-md p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Data Trends</h2>
            <p className="text-xs text-gray-500 mt-1">Historical NPK readings stored in Firestore</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleManualLog}
              disabled={isLogging || deviceReadings.length === 0}
              className="px-3 py-1.5 text-xs sm:text-sm rounded-lg transition-colors bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              title="Manually log current NPK readings to history"
            >
              {isLogging ? (
                <>
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span className="hidden sm:inline">Logging...</span>
                </>
              ) : (
                <>
                  <span>📝</span>
                  <span className="hidden sm:inline">Log Now</span>
                  <span className="sm:hidden">Log</span>
                </>
              )}
            </button>
            <button
              onClick={() => setTimeRange('7d')}
              className={`px-3 py-1.5 text-xs sm:text-sm rounded-lg transition-colors ${
                timeRange === '7d' 
                  ? 'bg-green-600 text-white' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              7 Days
            </button>
            <button
              onClick={() => setTimeRange('30d')}
              className={`px-3 py-1.5 text-xs sm:text-sm rounded-lg transition-colors ${
                timeRange === '30d' 
                  ? 'bg-green-600 text-white' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              30 Days
            </button>
            <button
              onClick={() => setTimeRange('90d')}
              className={`px-3 py-1.5 text-xs sm:text-sm rounded-lg transition-colors ${
                timeRange === '90d' 
                  ? 'bg-green-600 text-white' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              90 Days
            </button>
            <button
              onClick={() => setTimeRange('all')}
              className={`px-3 py-1.5 text-xs sm:text-sm rounded-lg transition-colors ${
                timeRange === 'all' 
                  ? 'bg-green-600 text-white' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              All Time
            </button>
          </div>
        </div>
        <div>
          {isLoadingLogs ? (
            <div className="flex flex-col items-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mb-3"></div>
              <p className="text-gray-500">Loading historical data...</p>
            </div>
          ) : (() => {
            // Merge historical and real-time logs, dedupe, sort
            const allLogs = [...historicalLogs, ...realtimeLogs];
            const seen = new Set<string>();
            const deduped = allLogs.filter(log => {
              const key = `${Math.floor(log.timestamp.getTime() / 1000)}-${log.paddyId || log.deviceId}`;
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            });
            const sortedLogs = deduped
              .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()); // Newest first
            const chartLogs = sortedLogs
              .slice()
              .reverse()
              .slice(-10); // Last 10 for chart (oldest to newest)

            // Pagination logic
            const totalPages = Math.ceil(sortedLogs.length / itemsPerPage);
            const startIndex = (currentPage - 1) * itemsPerPage;
            const endIndex = startIndex + itemsPerPage;
            const paginatedLogs = sortedLogs.slice(startIndex, endIndex);

            return sortedLogs.length > 0 ? (
              <div className="space-y-6">
                {/* Info Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <p className="text-sm text-gray-600">
                      Showing <span className="font-semibold text-gray-900">{sortedLogs.length}</span> reading{sortedLogs.length !== 1 ? 's' : ''} 
                      {timeRange !== 'all' && (
                        <span> over the last {
                          timeRange === '7d' ? '7 days' :
                          timeRange === '30d' ? '30 days' :
                          timeRange === '90d' ? '90 days' :
                          'recording period'
                        }</span>
                      )}
                    </p>
                    <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                      <span className="inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                      Live updates enabled
                    </p>
                  </div>
                </div>

                {/* Chart */}
                <div className="bg-gray-50 rounded-xl p-4">
                  <TrendsChart 
                    logs={chartLogs} 
                    key={`${historicalLogs.length}-${realtimeLogs.length}-${realtimeLogs[realtimeLogs.length - 1]?.timestamp?.getTime() || 0}`} 
                  />
                </div>

                {/* Data Table */}
                <div className="overflow-hidden">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
                    <h4 className="text-md font-semibold text-gray-900">Reading History</h4>
                    {totalPages > 1 && (
                      <p className="text-xs sm:text-sm text-gray-600">
                        Page <span className="font-semibold">{currentPage}</span> of <span className="font-semibold">{totalPages}</span>
                        {' '}({startIndex + 1}-{Math.min(endIndex, sortedLogs.length)} of {sortedLogs.length})
                      </p>
                    )}
                  </div>
                  
                  {/* Desktop Table */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-gray-50 border-b-2 border-gray-200">
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Timestamp</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Paddy</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Nitrogen (N)</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Phosphorus (P)</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Potassium (K)</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Source</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {paginatedLogs.map((log, index) => {
                          const globalIndex = startIndex + index;
                          return (
                            <tr 
                              key={log.id || `log-${globalIndex}`} 
                              className={`hover:bg-gray-50 transition-colors ${
                                globalIndex === 0 && realtimeLogs.some(rt => rt.id === log.id) ? 'bg-green-50' : ''
                              }`}
                            >
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                {log.timestamp.toLocaleString('en-US', {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  second: '2-digit'
                                })}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                                {log.paddyName || 'Unknown'}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-blue-700">
                                {log.nitrogen !== undefined && log.nitrogen !== null ? `${Math.round(log.nitrogen)} mg/kg` : '--'}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-purple-700">
                                {log.phosphorus !== undefined && log.phosphorus !== null ? `${Math.round(log.phosphorus)} mg/kg` : '--'}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-orange-700">
                                {log.potassium !== undefined && log.potassium !== null ? `${Math.round(log.potassium)} mg/kg` : '--'}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-xs">
                                <span className={`px-2 py-1 rounded-full ${
                                  log._src === 'rtdb' ? 'bg-green-100 text-green-800' :
                                  log._src === 'paddy' ? 'bg-blue-100 text-blue-800' :
                                  'bg-gray-100 text-gray-800'
                                }`}>
                                  {log._src === 'rtdb' ? 'Live' : log._src === 'paddy' ? 'Paddy Log' : 'Device Log'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Cards */}
                  <div className="md:hidden space-y-3">
                    {paginatedLogs.map((log, index) => {
                      const globalIndex = startIndex + index;
                      return (
                        <div 
                          key={log.id || `log-${globalIndex}`}
                          className={`bg-white border rounded-lg p-4 shadow-sm ${
                            globalIndex === 0 && realtimeLogs.some(rt => rt.id === log.id) ? 'border-green-300 bg-green-50' : 'border-gray-200'
                          }`}
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1">
                              <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Paddy</p>
                              <p className="text-sm font-medium text-gray-900">{log.paddyName || 'Unknown'}</p>
                              <p className="text-xs font-semibold text-gray-500 uppercase mb-1 mt-2">Timestamp</p>
                              <p className="text-sm text-gray-900">
                                {log.timestamp.toLocaleString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  second: '2-digit'
                                })}
                              </p>
                              <p className="text-xs text-gray-500 mt-1">
                                {log.timestamp.toLocaleDateString('en-US', { year: 'numeric' })}
                              </p>
                            </div>
                            <span className={`px-2 py-1 rounded-full text-xs ${
                              log._src === 'rtdb' ? 'bg-green-100 text-green-800' :
                              log._src === 'paddy' ? 'bg-blue-100 text-blue-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {log._src === 'rtdb' ? 'Live' : log._src === 'paddy' ? 'Paddy' : 'Device'}
                            </span>
                          </div>
                          <div className="grid grid-cols-3 gap-3">
                            <div>
                              <p className="text-xs font-semibold text-blue-600 mb-1">Nitrogen (N)</p>
                              <p className="text-lg font-bold text-blue-700">
                                {log.nitrogen !== undefined && log.nitrogen !== null ? Math.round(log.nitrogen) : '--'}
                              </p>
                              <p className="text-xs text-gray-500">mg/kg</p>
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-purple-600 mb-1">Phosphorus (P)</p>
                              <p className="text-lg font-bold text-purple-700">
                                {log.phosphorus !== undefined && log.phosphorus !== null ? Math.round(log.phosphorus) : '--'}
                              </p>
                              <p className="text-xs text-gray-500">mg/kg</p>
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-orange-600 mb-1">Potassium (K)</p>
                              <p className="text-lg font-bold text-orange-700">
                                {log.potassium !== undefined && log.potassium !== null ? Math.round(log.potassium) : '--'}
                              </p>
                              <p className="text-xs text-gray-500">mg/kg</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Pagination Controls */}
                  {totalPages > 1 && (
                    <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                      <div className="text-xs sm:text-sm text-gray-600 text-center sm:text-left">
                        Showing {startIndex + 1} to {Math.min(endIndex, sortedLogs.length)} of {sortedLogs.length} readings
                      </div>
                      <div className="flex items-center gap-1 sm:gap-2">
                        <button
                          onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                          disabled={currentPage === 1}
                          className={`px-2 sm:px-3 py-2 text-xs sm:text-sm rounded-lg transition-colors ${
                            currentPage === 1
                              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                          }`}
                        >
                          <span className="hidden sm:inline">Previous</span>
                          <span className="sm:hidden">Prev</span>
                        </button>
                        
                        {/* Page Numbers */}
                        <div className="flex items-center gap-1">
                          {(() => {
                            const maxPages = 5;
                            const pagesToShow = Math.min(maxPages, totalPages);
                            
                            let startPage = 1;
                            if (totalPages > maxPages) {
                              if (currentPage <= 3) {
                                startPage = 1;
                              } else if (currentPage >= totalPages - 2) {
                                startPage = totalPages - maxPages + 1;
                              } else {
                                startPage = currentPage - 2;
                              }
                            }
                            
                            return Array.from({ length: pagesToShow }, (_, i) => {
                              const pageNum = startPage + i;
                              return (
                                <button
                                  key={pageNum}
                                  onClick={() => setCurrentPage(pageNum)}
                                  className={`px-2 sm:px-3 py-2 text-xs sm:text-sm rounded-lg transition-colors ${
                                    currentPage === pageNum
                                      ? 'bg-green-600 text-white'
                                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                  }`}
                                >
                                  {pageNum}
                                </button>
                              );
                            });
                          })()}
                        </div>
                        
                        <button
                          onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                          disabled={currentPage === totalPages}
                          className={`px-2 sm:px-3 py-2 text-xs sm:text-sm rounded-lg transition-colors ${
                            currentPage === totalPages
                              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                          }`}
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="text-5xl mb-3">📊</div>
                <p className="text-gray-500 font-medium">No historical data found</p>
                <p className="text-sm text-gray-400 mt-2">
                  {deviceReadings.length > 0 
                    ? 'NPK readings will be automatically logged to Firestore. Check back later!'
                    : 'Connect devices to start logging NPK readings.'}
                </p>
                {deviceReadings.length > 0 && (
                  <p className="text-xs text-gray-400 mt-1">
                    Current devices: {deviceReadings.filter(r => r.npk).length} with NPK data
                  </p>
                )}
              </div>
            );
          })()}
        </div>
      </div>

      {/* Current Device Readings */}
      {deviceReadings.length > 0 && (
        <div className="bg-white rounded-xl shadow-md p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Current Device Readings</h2>
          <div className="space-y-3">
            {deviceReadings.map((reading) => {
              const paddy = paddies.find(p => p.deviceId === reading.deviceId);
              const npk = reading.npk;
              
              if (!npk || (npk.n === undefined && npk.p === undefined && npk.k === undefined)) {
                return (
                  <div key={reading.deviceId} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-gray-900">{paddy?.paddyName || reading.deviceId}</p>
                        <p className="text-xs text-gray-500">Device: {reading.deviceId}</p>
                      </div>
                      <span className="text-xs text-gray-400">No NPK data</span>
                    </div>
                  </div>
                );
              }
              
              return (
                <div key={reading.deviceId} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="font-semibold text-gray-900">{paddy?.paddyName || reading.deviceId}</p>
                      <p className="text-xs text-gray-500">Device: {reading.deviceId}</p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded ${
                      reading.status === 'connected' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {reading.status || 'unknown'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {npk.n !== undefined && (
                      <div className="bg-blue-50 rounded-lg p-3">
                        <p className="text-xs text-blue-600 font-medium mb-1">Nitrogen (N)</p>
                        <p className="text-lg font-bold text-blue-900">{Math.round(npk.n)}</p>
                        <p className="text-xs text-blue-500">mg/kg</p>
                      </div>
                    )}
                    {npk.p !== undefined && (
                      <div className="bg-purple-50 rounded-lg p-3">
                        <p className="text-xs text-purple-600 font-medium mb-1">Phosphorus (P)</p>
                        <p className="text-lg font-bold text-purple-900">{Math.round(npk.p)}</p>
                        <p className="text-xs text-purple-500">mg/kg</p>
                      </div>
                    )}
                    {npk.k !== undefined && (
                      <div className="bg-orange-50 rounded-lg p-3">
                        <p className="text-xs text-orange-600 font-medium mb-1">Potassium (K)</p>
                        <p className="text-lg font-bold text-orange-900">{Math.round(npk.k)}</p>
                        <p className="text-xs text-orange-500">mg/kg</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Field Summary */}
      <div className="bg-white rounded-xl shadow-md p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-3">Field Summary</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-600">Total Paddies</p>
            <p className="text-xl font-bold text-gray-900">{paddies.length}</p>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-600">Active Devices</p>
            <p className="text-xl font-bold text-gray-900">{paddies.filter(p => getDeviceStatus(p, deviceReadings).status !== 'offline').length}</p>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-600">Devices with NPK</p>
            <p className="text-xl font-bold text-gray-900">
              {deviceReadings.filter(r => r.npk && (r.npk.n !== undefined || r.npk.p !== undefined || r.npk.k !== undefined)).length}
            </p>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-600">Historical Logs</p>
            <p className="text-xl font-bold text-gray-900">{historicalLogs.length}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Information Tab Component
function InformationTab({ field, onFieldUpdate }: { field: any; onFieldUpdate: () => void }) {
  const { user } = useAuth();
  const [isConcluding, setIsConcluding] = useState(false);
  const [isEditingFieldName, setIsEditingFieldName] = useState(false);
  const [fieldNameValue, setFieldNameValue] = useState('');
  const [isSavingFieldName, setIsSavingFieldName] = useState(false);
  
  if (!field) return null;

  const variety = getVarietyByName(field.riceVariety);
  const daysSincePlanting = getDaysSincePlanting(field.startDay);
  const expectedHarvest = variety ? getExpectedHarvestDate(field.startDay, variety) : null;
  const isCompleted = daysSincePlanting >= (variety?.maturityDays?.max || 130);
  const fieldStatus = field.status || 'active'; // 'active', 'concluded', 'harvested'

  const handleConcludeField = async () => {
    if (!user || !field.id) return;

    const action = isCompleted ? 'harvest' : 'conclude';
    const confirmMessage = isCompleted
      ? 'Mark this field as harvested? This indicates the season has been completed successfully.'
      : 'End this field season early? You can mark it as concluded if you need to stop tracking before maturity.';

    if (!confirm(confirmMessage)) return;

    setIsConcluding(true);
    try {
      const fieldRef = doc(db, `users/${user.uid}/fields/${field.id}`);
      await updateDoc(fieldRef, {
        status: isCompleted ? 'harvested' : 'concluded',
        concludedAt: new Date().toISOString(),
        concludedDay: daysSincePlanting,
      });

      alert(isCompleted ? '🌾 Field marked as harvested!' : '✓ Field season concluded');
      onFieldUpdate(); // Refresh field data
    } catch (error) {
      console.error('Error concluding field:', error);
      alert('Failed to update field status');
    } finally {
      setIsConcluding(false);
    }
  };

  const handleReopenField = async () => {
    if (!user || !field.id) return;
    if (!confirm('Reopen this field? This will mark it as active again.')) return;

    setIsConcluding(true);
    try {
      const fieldRef = doc(db, `users/${user.uid}/fields/${field.id}`);
      await updateDoc(fieldRef, {
        status: 'active',
        reopenedAt: new Date().toISOString(),
      });

      alert('✓ Field reopened successfully');
      onFieldUpdate();
    } catch (error) {
      console.error('Error reopening field:', error);
      alert('Failed to reopen field');
    } finally {
      setIsConcluding(false);
    }
  };

  const handleStartEditFieldName = () => {
    setFieldNameValue(field.fieldName || '');
    setIsEditingFieldName(true);
  };

  const handleCancelEditFieldName = () => {
    setIsEditingFieldName(false);
    setFieldNameValue('');
  };

  const handleSaveFieldName = async () => {
    if (!user || !field.id) return;
    
    const trimmedName = fieldNameValue.trim();
    if (!trimmedName) {
      alert('Field name cannot be empty');
      return;
    }

    if (trimmedName === field.fieldName) {
      setIsEditingFieldName(false);
      return;
    }

    setIsSavingFieldName(true);
    try {
      const fieldRef = doc(db, `users/${user.uid}/fields/${field.id}`);
      await updateDoc(fieldRef, {
        fieldName: trimmedName,
      });

      setIsEditingFieldName(false);
      onFieldUpdate(); // Refresh field data
    } catch (error) {
      console.error('Error updating field name:', error);
      alert('Failed to update field name');
    } finally {
      setIsSavingFieldName(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-md p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900">Field Information</h2>
          {fieldStatus !== 'active' && (
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              fieldStatus === 'harvested' 
                ? 'bg-green-100 text-green-800' 
                : 'bg-gray-100 text-gray-800'
            }`}>
              {fieldStatus === 'harvested' ? '🌾 Harvested' : '🔚 Season Ended'}
            </span>
          )}
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm text-gray-600">Field Name</p>
              {!isEditingFieldName && (
                <button
                  onClick={handleStartEditFieldName}
                  className="text-green-600 hover:text-green-700 text-sm font-medium"
                  title="Edit field name"
                >
                  ✏️ Edit
                </button>
              )}
            </div>
            {isEditingFieldName ? (
              <div className="space-y-2">
                <Input
                  type="text"
                  value={fieldNameValue}
                  onChange={(e) => setFieldNameValue(e.target.value)}
                  className="text-lg font-medium"
                  placeholder="Enter field name"
                  disabled={isSavingFieldName}
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button
                    onClick={handleSaveFieldName}
                    disabled={isSavingFieldName || !fieldNameValue.trim()}
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    {isSavingFieldName ? 'Saving...' : 'Save'}
                  </Button>
                  <Button
                    onClick={handleCancelEditFieldName}
                    disabled={isSavingFieldName}
                    size="sm"
                    variant="outline"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-lg font-medium text-gray-900">{field.fieldName}</p>
            )}
          </div>
          <div>
            <p className="text-sm text-gray-600 mb-1">Rice Variety</p>
            <p className="text-lg font-medium text-gray-900">{field.riceVariety}</p>
          </div>
          {variety?.plantingMethod && (
            <div>
              <p className="text-sm text-gray-600 mb-1">Planting Method</p>
              <p className="text-lg font-medium text-gray-900 capitalize">
                {variety.plantingMethod.map(m => m.replace('-', ' ')).join(' / ')}
              </p>
            </div>
          )}
          <div>
            <p className="text-sm text-gray-600 mb-1">Start Date (Day 0)</p>
            <p className="text-lg font-medium text-gray-900">
              {new Date(field.startDay).toLocaleDateString()}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600 mb-1">Current Day</p>
            <p className="text-lg font-medium text-gray-900">
              Day {daysSincePlanting}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600 mb-1">Expected Harvest</p>
            <p className="text-lg font-medium text-gray-900">
              {expectedHarvest ? new Date(expectedHarvest).toLocaleDateString() : 'N/A'}
            </p>
          </div>
          {field.concludedAt && (
            <div>
              <p className="text-sm text-gray-600 mb-1">
                {fieldStatus === 'harvested' ? 'Harvested On' : 'Concluded On'}
              </p>
              <p className="text-lg font-medium text-gray-900">
                {new Date(field.concludedAt).toLocaleDateString()} (Day {field.concludedDay})
              </p>
            </div>
          )}
          <div>
            <p className="text-sm text-gray-600 mb-1">Created</p>
            <p className="text-lg font-medium text-gray-900">
              {field.createdAt?.toDate ? new Date(field.createdAt.toDate()).toLocaleDateString() : 'N/A'}
            </p>
          </div>
          {field.description && (
            <div className="md:col-span-2">
              <p className="text-sm text-gray-600 mb-1">Description</p>
              <p className="text-gray-900">{field.description}</p>
            </div>
          )}
        </div>
      </div>

      {/* Field Actions */}
      {fieldStatus === 'active' && (
        <div className="bg-gradient-to-r from-yellow-50 to-orange-50 border border-orange-200 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {isCompleted ? '🌾 Ready for Harvest' : '⏸️ End Season Early'}
          </h3>
          <p className="text-sm text-gray-700 mb-4">
            {isCompleted
              ? 'Your rice has reached maturity. Mark this field as harvested to complete the season.'
              : `This field is currently on Day ${daysSincePlanting}. You can conclude this season early if needed.`}
          </p>
          <button
            onClick={handleConcludeField}
            disabled={isConcluding}
            className={`px-6 py-3 rounded-lg font-medium transition-all ${
              isCompleted
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : 'bg-orange-600 hover:bg-orange-700 text-white'
            } disabled:bg-gray-400 disabled:cursor-not-allowed`}
          >
            {isConcluding ? 'Processing...' : isCompleted ? '🌾 Mark as Harvested' : '🔚 Conclude Field'}
          </button>
        </div>
      )}

      {fieldStatus !== 'active' && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Field is {fieldStatus === 'harvested' ? 'Harvested' : 'Concluded'}
          </h3>
          <p className="text-sm text-gray-700 mb-4">
            This field season has ended. You can reopen it if you need to continue tracking.
          </p>
          <button
            onClick={handleReopenField}
            disabled={isConcluding}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-all disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {isConcluding ? 'Processing...' : '↻ Reopen Field'}
          </button>
        </div>
      )}
    </div>
  );
}

// Trends Chart Component
function TrendsChart({ logs }: { logs: Array<{ timestamp: Date; nitrogen?: number; phosphorus?: number; potassium?: number }> }) {
  
  const data = useMemo(() => {
    // Ensure chronological order (oldest → newest)
    const ordered = [...logs].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    const labels = ordered.map((l) => l.timestamp.toLocaleString(undefined, { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }));

    return {
    labels,
    datasets: [
      {
        label: 'Nitrogen (mg/kg)',
        data: ordered.map((l) => l.nitrogen ?? null),
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37, 99, 235, 0.2)',
        tension: 0.3,
        spanGaps: true,
      },
      {
        label: 'Phosphorus (mg/kg)',
        data: ordered.map((l) => l.phosphorus ?? null),
        borderColor: '#7c3aed',
        backgroundColor: 'rgba(124, 58, 237, 0.2)',
        tension: 0.3,
        spanGaps: true,
      },
      {
        label: 'Potassium (mg/kg)',
        data: ordered.map((l) => l.potassium ?? null),
        borderColor: '#f59e0b',
        backgroundColor: 'rgba(245, 158, 11, 0.2)',
        tension: 0.3,
        spanGaps: true,
      },
    ],
    };
  }, [logs]);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 750,
    },
    plugins: {
      legend: { position: 'top' as const },
      tooltip: { mode: 'index' as const, intersect: false },
    },
    scales: {
      y: { beginAtZero: true, title: { display: true, text: 'mg/kg' } },
      x: {
        ticks: {
          maxRotation: 45,
          minRotation: 45
        }
      }
    },
  };

  return (
    <div style={{ height: 320 }}>
      <Line data={data} options={options} />
    </div>
  );
}
