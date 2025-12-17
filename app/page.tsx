'use client';

import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/context/AuthContext";
import Image from "next/image";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getVarietyNames } from "@/lib/utils/varietyHelpers";
import { db, database } from "@/lib/firebase";
import { doc, getDoc, setDoc, collection, addDoc, updateDoc, serverTimestamp, query, getDocs, orderBy } from "firebase/firestore";
import { ref, get, update } from "firebase/database";
import NotificationBell from "@/components/NotificationBell";

export default function Home() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalStep, setModalStep] = useState(1);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  
  // Step 1 form data
  const [fieldName, setFieldName] = useState("");
  const [fieldDescription, setFieldDescription] = useState("");
  const [riceVariety, setRiceVariety] = useState("");
  const [startDay, setStartDay] = useState("");
  const [errors, setErrors] = useState<{[key: string]: string}>({});
  
  // Step 2 form data
  const [paddyName, setPaddyName] = useState("");
  const [paddyDescription, setPaddyDescription] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  
  // Fields list
  const [fields, setFields] = useState<any[]>([]);
  const [loadingFields, setLoadingFields] = useState(true);
  
  const handleStep1Submit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: {[key: string]: string} = {};
    
    if (!fieldName.trim()) newErrors.fieldName = "Please enter a field name";
    if (!riceVariety) newErrors.riceVariety = "Please select a rice variety";
    if (!startDay) newErrors.startDay = "Please select a start date";
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    
    setErrors({});
    setModalStep(2);
  };
  
  const setTodayDate = () => {
    const today = new Date().toISOString().split('T')[0];
    setStartDay(today);
    setErrors(prev => ({...prev, startDay: ""}));
  };
  
  const fetchFields = async () => {
    if (!user) return;
    
    setLoadingFields(true);
    try {
      const fieldsRef = collection(db, "users", user.uid, "fields");
      const q = query(fieldsRef, orderBy("createdAt", "desc"));
      const querySnapshot = await getDocs(q);
      
      const fieldsData = await Promise.all(querySnapshot.docs.map(async (fieldDoc) => {
        const fieldData = { id: fieldDoc.id, ...fieldDoc.data() };
        
        // Fetch paddies for this field to check device status
        try {
          const paddiesRef = collection(db, "users", user.uid, "fields", fieldDoc.id, "paddies");
          const paddiesSnapshot = await getDocs(paddiesRef);
          
          let totalDevices = 0;
          let offlineDevices = 0;
          let issueDevices = 0;
          
          paddiesSnapshot.forEach(paddyDoc => {
            totalDevices++;
            const paddyData = paddyDoc.data();
            
            // TODO: Check actual heartbeat from Firebase RTDB
            const hasHeartbeat = false; // Placeholder
            const hasReadings = false; // TODO: Check actual sensor readings
            
            if (!hasHeartbeat && !hasReadings) {
              offlineDevices++;
            } else if (hasHeartbeat && !hasReadings) {
              issueDevices++;
            }
          });
          
          return {
            ...fieldData,
            deviceStats: {
              total: totalDevices,
              offline: offlineDevices,
              issues: issueDevices,
              healthy: totalDevices - offlineDevices - issueDevices
            }
          };
        } catch (error) {
          console.error("Error fetching paddies for field:", fieldDoc.id, error);
          return fieldData;
        }
      }));
      
      setFields(fieldsData);
    } catch (error) {
      console.error("Error fetching fields:", error);
    } finally {
      setLoadingFields(false);
    }
  };
  
  useEffect(() => {
    fetchFields();
  }, [user]);
  
  const handleStep2Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: {[key: string]: string} = {};
    
    if (!paddyName.trim()) newErrors.paddyName = "Please enter a paddy name";
    if (!deviceId.trim()) {
      newErrors.deviceId = "Please enter a device ID";
    } else {
      // Validate format: DEVICE_XXXX
      const deviceIdPattern = /^DEVICE_\d{4}$/;
      if (!deviceIdPattern.test(deviceId)) {
        newErrors.deviceId = "Invalid format. Use DEVICE_0001 format";
      }
    }
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    
    // Verify device exists in RTDB
    setIsVerifying(true);
    try {
      const deviceRef = ref(database, `devices/${deviceId}`);
      const deviceSnap = await get(deviceRef);
      
      if (!deviceSnap.exists()) {
        setErrors({ deviceId: "Device not found. Please check the ID" });
        setIsVerifying(false);
        return;
      }
      
      // Check if device is already connected to another user
      const deviceData = deviceSnap.val();
      if (deviceData?.connectedTo && deviceData.connectedTo !== user?.uid) {
        setErrors({ deviceId: "Device is already connected to another user" });
        setIsVerifying(false);
        return;
      }
      
      if (!user) {
        setErrors({ deviceId: "Session error. Please try again" });
        setIsVerifying(false);
        return;
      }
      
      // Now perform ALL Firestore writes
      // 1. Create or update user document
      const userRef = doc(db, "users", user.uid);
      await setDoc(userRef, {
        email: user.email,
        displayName: user.displayName || "",
        photoURL: user.photoURL || "",
        updatedAt: serverTimestamp()
      }, { merge: true });
      
      // 2. Create field document
      const fieldsRef = collection(db, "users", user.uid, "fields");
      const fieldDoc = await addDoc(fieldsRef, {
        fieldName,
        description: fieldDescription,
        riceVariety,
        startDay,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      
      // 3. Create paddy (device connection) under the field
      const paddiesRef = collection(db, "users", user.uid, "fields", fieldDoc.id, "paddies");
      await addDoc(paddiesRef, {
        paddyName,
        description: paddyDescription,
        deviceId,
        connectedAt: serverTimestamp(),
        status: "connected"
      });
      
      // 4. Update device in RTDB to mark it as connected to this user
      await update(deviceRef, {
        connectedTo: user.uid,
        connectedAt: new Date().toISOString(),
        fieldId: fieldDoc.id,
        paddyName,
        status: 'connected'
      });
      
      setErrors({});
      setIsVerifying(false);
      
      // Close modal and refresh fields list
      closeModal();
      fetchFields();
    } catch (error: any) {
      console.error("Error connecting device:", error);
      
      let errorMessage = "Failed to connect device. Please try again";
      
      if (error?.code === 'permission-denied') {
        errorMessage = "Permission denied. Please check your account access";
      } else if (error?.code === 'unavailable') {
        errorMessage = "Network error. Please check your connection";
      } else if (error?.code === 'unauthenticated') {
        errorMessage = "Authentication error. Please sign in again";
      } else if (error?.message) {
        errorMessage = error.message;
      }
      
      setErrors({ deviceId: errorMessage });
      setIsVerifying(false);
    }
  };
  
  const closeModal = () => {
    setIsModalOpen(false);
    setTimeout(() => {
      setModalStep(1);
      setFieldName("");
      setFieldDescription("");
      setRiceVariety("");
      setStartDay("");
      setPaddyName("");
      setPaddyDescription("");
      setDeviceId("");
      setErrors({});
    }, 300); // Reset after animation
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 pb-24">
        <nav className="bg-white/80 backdrop-blur-md shadow-sm sticky top-0 z-30 border-b border-green-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center gap-3">
                <Image src="/icons/rice_logo.png" alt="PadBuddy" width={40} height={40} className="drop-shadow-md" />
                <h1 className="text-2xl font-bold bg-gradient-to-r from-green-600 to-emerald-700 bg-clip-text text-transparent">Padbuddy</h1>
              </div>
              <div className="flex items-center gap-2">
                {/* Hamburger Menu */}
                <button 
                  onClick={() => setIsMenuOpen(true)}
                  className="p-2 hover:bg-green-50 rounded-xl transition-colors"
                >
                  <svg 
                    xmlns="http://www.w3.org/2000/svg" 
                    className="h-6 w-6 text-green-700" 
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke="currentColor"
                  >
                    <path 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                      strokeWidth={2} 
                      d="M4 6h16M4 12h16M4 18h16" 
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </nav>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Fields List */}
          {loadingFields ? (
            <div className="flex justify-center items-center py-20">
              <svg className="animate-spin h-10 w-10 text-green-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
          ) : fields.length === 0 ? (
            <div className="text-center py-20">
              <div className="bg-gradient-to-br from-green-100 to-emerald-100 rounded-full w-24 h-24 flex items-center justify-center mx-auto mb-6 shadow-lg">
                <svg className="h-12 w-12 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">No fields yet</h3>
              <p className="text-gray-600 text-lg">Get started by adding your first field</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {fields.map((field) => (
                <div
                  key={field.id}
                  onClick={() => router.push(`/field/${field.id}`)}
                  className="bg-white rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 cursor-pointer overflow-hidden border border-green-100 hover:border-green-300 hover:-translate-y-1"
                >
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="text-xl font-bold text-gray-900">{field.fieldName}</h3>
                      <div className="flex flex-col items-end gap-1.5">
                        {/* Field Status Badge */}
                        {field.status === 'harvested' && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            🌾 Harvested
                          </span>
                        )}
                        {field.status === 'concluded' && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                            🔚 Season Ended
                          </span>
                        )}
                        {/* Device Status Badge (only for active fields) */}
                        {(!field.status || field.status === 'active') && field.deviceStats && field.deviceStats.total > 0 && (
                          <div>
                            {field.deviceStats.offline > 0 ? (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                ✗ {field.deviceStats.offline} Offline
                              </span>
                            ) : field.deviceStats.issues > 0 ? (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                ⚠ {field.deviceStats.issues} Issue{field.deviceStats.issues > 1 ? 's' : ''}
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                ✓ All OK
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center text-sm text-gray-600">
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                        </svg>
                        {field.riceVariety}
                      </div>
                      <div className="flex items-center text-sm text-gray-600">
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        Started {new Date(field.startDay).toLocaleDateString()}
                      </div>
                      {field.deviceStats && field.deviceStats.total > 0 && (
                        <div className="flex items-center text-sm text-gray-600">
                          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                          </svg>
                          {field.deviceStats.total} {field.deviceStats.total === 1 ? 'Device' : 'Devices'}
                        </div>
                      )}
                      {field.description && (
                        <p className="text-sm text-gray-500 mt-3 line-clamp-2">{field.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="bg-green-50 px-6 py-3 border-t border-green-100">
                    <span className="text-sm text-green-700 font-medium">View Details →</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>

        {/* Floating Action Button */}
        <button 
          onClick={() => setIsModalOpen(true)}
          className="fixed bottom-8 right-8 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-full shadow-2xl hover:shadow-3xl hover:from-green-700 hover:to-emerald-700 active:scale-95 transition-all flex items-center gap-2 px-6 py-4 z-40 text-base font-bold group"
        >
          <span className="text-2xl group-hover:rotate-90 transition-transform duration-300">+</span>
          Add Field
        </button>

        {/* Bottom Sheet Modal */}
        {isModalOpen && (
          <>
            {/* Glassmorphism Overlay */}
            <div 
              onClick={closeModal}
              className="fixed inset-0 backdrop-blur-sm bg-black/20 z-40 transition-all"
            />
            
            {/* Bottom Sheet */}
            <div className="fixed inset-x-0 bottom-0 z-50 animate-slide-up">
              <div className="bg-white rounded-t-3xl shadow-2xl h-[70vh] flex flex-col border-t-4 border-green-500">
                {/* Handle Bar */}
                <div className="flex justify-center pt-3 pb-4">
                  <div className="w-12 h-1.5 bg-green-300 rounded-full" />
                </div>
                
                {/* Modal Content with Slide Transition */}
                <div className="flex-1 overflow-hidden relative">
                  {/* Step 1: Field Information */}
                  <div 
                    className={`absolute inset-0 px-6 pb-6 overflow-y-auto transition-transform duration-300 ${
                      modalStep === 1 ? 'translate-x-0' : '-translate-x-full'
                    }`}
                  >
                    <h2 className="text-2xl font-bold text-gray-900 mb-6">Add New Field</h2>
                    <form onSubmit={handleStep1Submit} className="space-y-5">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Field Name
                        </label>
                        <input
                          type="text"
                          value={fieldName}
                          onChange={(e) => {
                            setFieldName(e.target.value);
                            setErrors(prev => ({...prev, fieldName: ""}));
                          }}
                          className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent ${
                            errors.fieldName ? 'border-red-400 bg-red-50' : 'border-gray-300'
                          }`}
                          placeholder="Enter field name"
                        />
                        {errors.fieldName && (
                          <p className="text-red-500 text-sm mt-1.5 flex items-center gap-1">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                            {errors.fieldName}
                          </p>
                        )}
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Rice Variety
                        </label>
                        <select
                          value={riceVariety}
                          onChange={(e) => {
                            setRiceVariety(e.target.value);
                            setErrors(prev => ({...prev, riceVariety: ""}));
                          }}
                          className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white ${
                            errors.riceVariety ? 'border-red-400 bg-red-50' : 'border-gray-300'
                          }`}
                        >
                          <option value="">Select rice variety</option>
                          {getVarietyNames().map((variety) => (
                            <option key={variety} value={variety}>
                              {variety}
                            </option>
                          ))}
                        </select>
                        {errors.riceVariety && (
                          <p className="text-red-500 text-sm mt-1.5 flex items-center gap-1">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                            {errors.riceVariety}
                          </p>
                        )}
                      </div>
                      
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="block text-sm font-medium text-gray-700">
                            Start Day
                          </label>
                          <button
                            type="button"
                            onClick={setTodayDate}
                            className="text-sm text-green-600 hover:text-green-700 font-medium transition-colors"
                          >
                            Today
                          </button>
                        </div>
                        <input
                          type="date"
                          value={startDay}
                          onChange={(e) => {
                            setStartDay(e.target.value);
                            setErrors(prev => ({...prev, startDay: ""}));
                          }}
                          className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent ${
                            errors.startDay ? 'border-red-400 bg-red-50' : 'border-gray-300'
                          }`}
                        />
                        {errors.startDay && (
                          <p className="text-red-500 text-sm mt-1.5 flex items-center gap-1">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                            {errors.startDay}
                          </p>
                        )}
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Description (optional)
                        </label>
                        <textarea
                          value={fieldDescription}
                          onChange={(e) => setFieldDescription(e.target.value)}
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
                          placeholder="Add notes about this field"
                          rows={3}
                        />
                      </div>
                      
                      <button
                        type="submit"
                        className="w-full bg-gradient-to-r from-green-600 to-emerald-600 text-white py-4 rounded-xl font-bold text-lg hover:from-green-700 hover:to-emerald-700 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 mt-6"
                      >
                        Continue →
                      </button>
                    </form>
                  </div>
                  
                  {/* Step 2: Device Connection */}
                  <div 
                    className={`absolute inset-0 px-6 pb-6 overflow-y-auto transition-transform duration-300 ${
                      modalStep === 2 ? 'translate-x-0' : 'translate-x-full'
                    }`}
                  >
                    <button
                      onClick={() => setModalStep(1)}
                      className="mb-4 text-gray-600 hover:text-gray-900 flex items-center gap-2"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                      Back
                    </button>
                    
                    <h2 className="text-2xl font-bold text-gray-900 mb-6">Connect Device</h2>
                    <form onSubmit={handleStep2Submit} className="space-y-5">
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
                          className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent ${
                            errors.paddyName ? 'border-red-400 bg-red-50' : 'border-gray-300'
                          }`}
                          placeholder="Enter paddy name"
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
                          Device ID
                        </label>
                        <input
                          type="text"
                          value={deviceId}
                          onChange={(e) => {
                            setDeviceId(e.target.value);
                            setErrors(prev => ({...prev, deviceId: ""}));
                          }}
                          className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent ${
                            errors.deviceId ? 'border-red-400 bg-red-50' : 'border-gray-300'
                          }`}
                          placeholder="e.g., DEVICE_0001"
                        />
                        {errors.deviceId && (
                          <p className="text-red-500 text-sm mt-1.5 flex items-center gap-1">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                            {errors.deviceId}
                          </p>
                        )}
                      </div>
                      
                      <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                        <p className="text-sm text-gray-600 flex items-center gap-2">
                          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          Location pin (coming soon)
                        </p>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Description (optional)
                        </label>
                        <textarea
                          value={paddyDescription}
                          onChange={(e) => setPaddyDescription(e.target.value)}
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
                          placeholder="Add notes about this paddy"
                          rows={3}
                        />
                      </div>
                      
                      <button
                        type="submit"
                        disabled={isVerifying}
                        className="w-full bg-gradient-to-r from-green-600 to-emerald-600 text-white py-4 rounded-xl font-bold text-lg hover:from-green-700 hover:to-emerald-700 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 mt-6 disabled:bg-gray-400 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2"
                      >
                        {isVerifying ? (
                          <>
                            <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Connecting...
                          </>
                        ) : (
                          'Connect'
                        )}
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Side Menu */}
        {isMenuOpen && (
          <>
            {/* Overlay */}
            <div 
              onClick={() => setIsMenuOpen(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity"
            />
            
            {/* Menu Panel */}
            <div className="fixed top-0 right-0 bottom-0 w-80 bg-white shadow-2xl z-50 animate-slide-in-right">
              <div className="flex flex-col h-full">
                {/* Menu Header */}
                <div className="p-6 border-b border-gray-200">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold text-gray-900">Menu</h2>
                    <button
                      onClick={() => setIsMenuOpen(false)}
                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  
                  {/* User Info */}
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                      <span className="text-green-700 font-semibold text-lg">
                        {user?.email?.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{user?.email}</p>
                      <p className="text-xs text-gray-500">Rice Farmer</p>
                    </div>
                  </div>
                </div>

                {/* Menu Items */}
                <div className="flex-1 overflow-y-auto py-4">
                  <nav className="space-y-1 px-3">
                    {/* My Fields */}
                    <button
                      onClick={() => {
                        router.push('/');
                        setIsMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors text-left"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v18l7-3 7 3V3H5z" />
                      </svg>
                      <span className="font-medium">My Fields</span>
                    </button>

                    <div className="h-px bg-gray-200 my-3"></div>

                    {/* Rice Varieties */}
                    <button
                      onClick={() => {
                        setIsMenuOpen(false);
                        // TODO: Navigate to rice varieties page
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors text-left"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                      </svg>
                      <span className="font-medium">Rice Varieties</span>
                    </button>

                    <div className="h-px bg-gray-200 my-3"></div>

                    {/* Help & Support */}
                    <button
                      onClick={() => {
                        setIsMenuOpen(false);
                        // TODO: Navigate to help page
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors text-left"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="font-medium">Help & Support</span>
                    </button>

                    {/* About */}
                    <button
                      onClick={() => {
                        setIsMenuOpen(false);
                        // TODO: Navigate to about page
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors text-left"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="font-medium">About PadBuddy</span>
                    </button>
                  </nav>
                </div>

                {/* Sign Out */}
                <div className="p-4 border-t border-gray-200">
                  <button
                    onClick={async () => {
                      if (confirm('Are you sure you want to sign out?')) {
                        await signOut();
                        setIsMenuOpen(false);
                        router.push('/auth');
                      }
                    }}
                    className="w-full flex items-center justify-center gap-3 px-4 py-3 text-red-600 hover:bg-red-50 rounded-lg transition-colors font-medium"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    Sign Out
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
