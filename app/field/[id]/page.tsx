'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, getDocs, updateDoc, setDoc, query, where, orderBy } from 'firebase/firestore';
import ProtectedRoute from '@/components/ProtectedRoute';
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

          // Fetch device readings for troubleshooting
          // Note: This would need to be implemented with your actual data structure
          // For now, storing empty array - implement based on your Firebase RTDB structure
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
      const { database } = await import('@/lib/firebase');
      const { ref, get } = await import('firebase/database');
      
      const locationRef = ref(database, `devices/${paddy.deviceId}/location`);
      const snapshot = await get(locationRef);
      
      if (snapshot.exists()) {
        const location = snapshot.val();
        if (location.latitude && location.longitude) {
          setLocationData({ 
            lat: location.latitude, 
            lng: location.longitude,
            timestamp: location.timestamp
          });
        }
      } else {
        // Check if other devices have location
        for (const otherPaddy of paddies) {
          if (otherPaddy.deviceId !== paddy.deviceId) {
            const otherLocationRef = ref(database, `devices/${otherPaddy.deviceId}/location`);
            const otherSnapshot = await get(otherLocationRef);
            if (otherSnapshot.exists() && otherSnapshot.val().latitude) {
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

        {/* Tab Navigation */}
        <div className="bg-white/80 backdrop-blur-md shadow-md border-b border-green-100 sticky top-16 z-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <nav className="flex flex-wrap justify-center sm:justify-start -mb-px">
                <button
                  onClick={() => setActiveTab('overview')}
                  className={`py-3 px-4 sm:py-4 sm:px-6 text-xs sm:text-sm font-bold border-b-3 transition-all whitespace-nowrap ${
                    activeTab === 'overview'
                      ? 'border-green-600 text-green-700 bg-green-50'
                      : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  Overview
                </button>
                <button
                  onClick={() => setActiveTab('paddies')}
                  className={`py-3 px-4 sm:py-4 sm:px-6 text-xs sm:text-sm font-bold border-b-3 transition-all whitespace-nowrap ${
                    activeTab === 'paddies'
                      ? 'border-green-600 text-green-700 bg-green-50'
                      : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  Paddies
                </button>
                {hasDevices && (
                  <button
                    onClick={() => setActiveTab('statistics')}
                    className={`py-3 px-4 sm:py-4 sm:px-6 text-xs sm:text-sm font-bold border-b-3 transition-all whitespace-nowrap ${
                      activeTab === 'statistics'
                        ? 'border-green-600 text-green-700 bg-green-50'
                        : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                  >
                    Statistics
                  </button>
                )}
                <button
                  onClick={() => setActiveTab('information')}
                  className={`py-3 px-4 sm:py-4 sm:px-6 text-xs sm:text-sm font-bold border-b-3 transition-all whitespace-nowrap ${
                    activeTab === 'information'
                      ? 'border-green-600 text-green-700 bg-green-50'
                      : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  Information
                </button>
            </nav>
          </div>
        </div>

        {/* Content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Tab Content */}
          {activeTab === 'overview' && (
            <OverviewTab field={field} paddies={paddies} />
          )}

          {activeTab === 'paddies' && (
            <PaddiesTab 
              paddies={paddies} 
              deviceReadings={deviceReadings} 
              fieldId={fieldId}
              onAddDevice={() => setIsAddDeviceModalOpen(true)}
              onViewLocation={handleViewLocation}
            />
          )}

          {activeTab === 'statistics' && hasDevices && (
            <StatisticsTab paddies={paddies} deviceReadings={deviceReadings} fieldId={fieldId} />
          )}

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
                        className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent ${
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
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
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
                        className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent font-mono ${
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
  // Check if device has recent heartbeat (within last 5 minutes)
  // TODO: Implement actual heartbeat checking from Firebase RTDB
  // For now, check if deviceId exists and has readings
  const hasHeartbeat = false; // Set to false by default - implement real heartbeat check
  const hasReadings = deviceReadings.some(r => r.deviceId === paddy.deviceId);
  
  if (!hasHeartbeat && !hasReadings) {
    return {
      status: 'offline',
      message: 'Device is offline. Check power supply and network connection.',
      color: 'red',
      badge: 'Offline'
    };
  }
  
  if (hasHeartbeat && !hasReadings) {
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
        <button
          onClick={onAddDevice}
          className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
        >
          <span className="text-lg">+</span>
          Add Paddy
        </button>
      </div>
      {paddies.length === 0 ? (
        <div className="bg-white rounded-xl shadow-md p-12 text-center">
          <p className="text-gray-500">No paddies connected yet</p>
        </div>
      ) : (
        <div className="space-y-4">
          {paddies.map((paddy) => {
            const deviceStatus = getDeviceStatus(paddy, deviceReadings || []);
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
    </div>
  );
}

// Statistics Tab Component
function StatisticsTab({ paddies, deviceReadings, fieldId }: { paddies: any[]; deviceReadings: any[]; fieldId: string }) {
  const { user } = useAuth();
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | 'all'>('7d');
  const [historicalLogs, setHistoricalLogs] = useState<any[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  
  // Fetch historical logs based on time range
  useEffect(() => {
    if (!user || paddies.length === 0) return;
    
    const fetchLogs = async () => {
      setIsLoadingLogs(true);
      try {
        const now = new Date();
        let startDate = new Date();
        
        switch(timeRange) {
          case '7d':
            startDate.setDate(now.getDate() - 7);
            break;
          case '30d':
            startDate.setDate(now.getDate() - 30);
            break;
          case '90d':
            startDate.setDate(now.getDate() - 90);
            break;
          case 'all':
            startDate = new Date(0); // Beginning of time
            break;
        }
        
        // Fetch logs for all paddies
        const allLogs: any[] = [];
        for (const paddy of paddies) {
          try {
            const logsRef = collection(db, `users/${user.uid}/fields/${fieldId}/paddies/${paddy.id}/logs`);
            
            // For 'all' time range, fetch all logs without filter to avoid index requirement
            const q = timeRange === 'all' 
              ? logsRef 
              : query(logsRef, where('timestamp', '>=', startDate));
            
            const snapshot = await getDocs(q);
            snapshot.forEach(doc => {
              const data = doc.data();
              // Filter by timestamp in JavaScript if needed
              const logDate = data.timestamp?.toDate?.() || new Date(data.timestamp);
              if (logDate >= startDate) {
                allLogs.push({ 
                  ...data, 
                  id: doc.id, 
                  paddyId: paddy.id, 
                  paddyName: paddy.paddyName,
                  timestamp: logDate 
                });
              }
            });
          } catch (error: any) {
            console.error(`Error fetching logs for paddy ${paddy.id}:`, error);
            console.error('Error code:', error?.code);
            console.error('Error message:', error?.message);
          }
        }
        
        // Sort in JavaScript instead of Firestore query
        allLogs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
        
        setHistoricalLogs(allLogs);
      } catch (error) {
        console.error('Error fetching logs:', error);
      } finally {
        setIsLoadingLogs(false);
      }
    };
    
    fetchLogs();
  }, [user, fieldId, paddies, timeRange]);
  
  // Calculate average statistics across all paddies
  // TODO: Implement actual data averaging from device readings
  
  return (
    <div className="space-y-4">
      {/* Average Statistics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Nitrogen Card */}
        <div className="bg-white rounded-lg shadow-md p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-gray-700">Nitrogen (N)</h3>
            <span className="text-xl">🧪</span>
          </div>
          <p className="text-xl font-bold text-gray-900">--</p>
          <p className="text-xs text-gray-500 mt-1">mg/kg</p>
        </div>

        {/* Phosphorus Card */}
        <div className="bg-white rounded-lg shadow-md p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-gray-700">Phosphorus (P)</h3>
            <span className="text-xl">⚗️</span>
          </div>
          <p className="text-xl font-bold text-gray-900">--</p>
          <p className="text-xs text-gray-500 mt-1">mg/kg</p>
        </div>

        {/* Potassium Card */}
        <div className="bg-white rounded-lg shadow-md p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-gray-700">Potassium (K)</h3>
            <span className="text-xl">🔬</span>
          </div>
          <p className="text-xl font-bold text-gray-900">--</p>
          <p className="text-xs text-gray-500 mt-1">mg/kg</p>
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

      {/* Data Visualization Placeholder */}
      <div className="bg-white rounded-xl shadow-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">Data Trends</h2>
          <div className="flex gap-2">
            <button
              onClick={() => setTimeRange('7d')}
              className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                timeRange === '7d' 
                  ? 'bg-green-600 text-white' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              7 Days
            </button>
            <button
              onClick={() => setTimeRange('30d')}
              className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                timeRange === '30d' 
                  ? 'bg-green-600 text-white' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              30 Days
            </button>
            <button
              onClick={() => setTimeRange('90d')}
              className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                timeRange === '90d' 
                  ? 'bg-green-600 text-white' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              90 Days
            </button>
            <button
              onClick={() => setTimeRange('all')}
              className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                timeRange === 'all' 
                  ? 'bg-green-600 text-white' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              All Time
            </button>
          </div>
        </div>
        <div className="text-center py-8">
          {isLoadingLogs ? (
            <div className="flex flex-col items-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mb-3"></div>
              <p className="text-gray-500">Loading historical data...</p>
            </div>
          ) : historicalLogs.length > 0 ? (
            <div>
              <div className="text-5xl mb-3">📊</div>
              <p className="text-gray-500">Found {historicalLogs.length} readings</p>
              <p className="text-sm text-gray-400 mt-1">NPK levels over the last {
                timeRange === '7d' ? '7 days' :
                timeRange === '30d' ? '30 days' :
                timeRange === '90d' ? '90 days' :
                'planting period'
              }</p>
              <p className="text-xs text-gray-400 mt-2">Chart visualization coming soon</p>
            </div>
          ) : (
            <div>
              <div className="text-5xl mb-3">📊</div>
              <p className="text-gray-500">No historical data found</p>
              <p className="text-sm text-gray-400 mt-1">Sensor readings will be logged automatically</p>
            </div>
          )}
        </div>
      </div>

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
        </div>
      </div>
    </div>
  );
}

// Information Tab Component
function InformationTab({ field, onFieldUpdate }: { field: any; onFieldUpdate: () => void }) {
  const { user } = useAuth();
  const [isConcluding, setIsConcluding] = useState(false);
  
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
            <p className="text-sm text-gray-600 mb-1">Field Name</p>
            <p className="text-lg font-medium text-gray-900">{field.fieldName}</p>
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
