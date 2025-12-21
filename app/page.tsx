'use client';

import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/context/AuthContext";
import Image from "next/image";
import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { getVarietyNames } from "@/lib/utils/varietyHelpers";
import { db, database } from "@/lib/firebase";
import { doc, getDoc, setDoc, collection, addDoc, updateDoc, serverTimestamp, query, getDocs, orderBy } from "firebase/firestore";
import { ref, get, update } from "firebase/database";
import NotificationBell from "@/components/NotificationBell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Menu, Search, HelpCircle, Info, LogOut, Home as HomeIcon, BookOpen, X, TrendingUp, Sprout, Smartphone, AlertTriangle, CheckCircle, Shield } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import Banner from "@/components/Banner";
import { usePageVisibility } from "@/lib/hooks/usePageVisibility";
import { useDeviceMonitoring } from "@/lib/hooks/useDeviceMonitoring";

// Admin email for access control
const ADMIN_EMAIL = 'ricepaddy.contact@gmail.com';

export default function Home() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { visibility } = usePageVisibility();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalStep, setModalStep] = useState(1);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  
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
  
  // Dashboard stats
  const [stats, setStats] = useState({
    totalFields: 0,
    totalDevices: 0,
    healthyDevices: 0,
    issueDevices: 0
  });
  
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
      
      let totalDevices = 0;
      let healthyDevices = 0;
      let issueDevices = 0;
      
      const fieldsData = await Promise.all(querySnapshot.docs.map(async (fieldDoc) => {
        const fieldData = { id: fieldDoc.id, ...fieldDoc.data() };
        
        // Fetch paddies for this field to check device status
        try {
          const paddiesRef = collection(db, "users", user.uid, "fields", fieldDoc.id, "paddies");
          const paddiesSnapshot = await getDocs(paddiesRef);
          
          let fieldTotalDevices = 0;
          let fieldOfflineDevices = 0;
          let fieldIssueDevices = 0;
          const paddies: any[] = [];
          
          // Process each paddy and check device status from RTDB
          for (const paddyDoc of paddiesSnapshot.docs) {
            const paddyData = { id: paddyDoc.id, ...paddyDoc.data() } as any;
            paddies.push(paddyData);
            
            fieldTotalDevices++;
            totalDevices++;
            
            // Check actual device status from Firebase RTDB
            let hasHeartbeat = false;
            let hasReadings = false;
            
            if (paddyData.deviceId) {
              try {
                const deviceRef = ref(database, `devices/${paddyData.deviceId}`);
                const deviceSnap = await get(deviceRef);
                
                if (deviceSnap.exists()) {
                  const deviceData = deviceSnap.val();
                  
                  // Check if device has status = "connected" or recent timestamp
                  hasHeartbeat = deviceData.status === 'connected' || 
                    deviceData.status === 'alive' ||
                    (deviceData.npk?.timestamp && deviceData.npk.timestamp > Date.now() - 10 * 60 * 1000); // Within 10 mins
                  
                  // Check if NPK readings exist
                  hasReadings = deviceData.npk && (
                    deviceData.npk.n !== undefined || 
                    deviceData.npk.p !== undefined || 
                    deviceData.npk.k !== undefined
                  );
                }
              } catch (rtdbError) {
                console.error('Error checking device status:', paddyData.deviceId, rtdbError);
              }
            }
            
            if (!hasHeartbeat) {
              fieldOfflineDevices++;
              issueDevices++;
            } else if (hasHeartbeat && !hasReadings) {
              fieldIssueDevices++;
              issueDevices++;
            } else {
              healthyDevices++;
            }
          }
          
          return {
            ...fieldData,
            paddies, // Include paddies for monitoring
            deviceStats: {
              total: fieldTotalDevices,
              offline: fieldOfflineDevices,
              issues: fieldIssueDevices,
              healthy: fieldTotalDevices - fieldOfflineDevices - fieldIssueDevices
            }
          };
        } catch (error) {
          console.error("Error fetching paddies for field:", fieldDoc.id, error);
          return fieldData;
        }
      }));
      
      setFields(fieldsData);
      setStats({
        totalFields: fieldsData.length,
        totalDevices,
        healthyDevices,
        issueDevices
      });
    } catch (error) {
      console.error("Error fetching fields:", error);
    } finally {
      setLoadingFields(false);
    }
  };
  
  useEffect(() => {
    fetchFields();
  }, [user]);

  // Monitor all devices for offline status
  useDeviceMonitoring(
    fields.flatMap(field => 
      field.paddies?.map((paddy: any) => ({
        userId: user?.uid || '',
        deviceId: paddy.deviceId,
        paddyName: paddy.paddyName,
        fieldId: field.id,
        fieldName: field.fieldName,
        enabled: !!user && !!paddy.deviceId
      })) || []
    )
  );
  
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
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 pb-24">
        {/* Navigation Bar */}
        <nav className="bg-gradient-to-r from-green-500 via-emerald-500 to-teal-500 sticky top-0 z-50 shadow-lg">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Image src="/icons/rice_logo.png" alt="PadBuddy" width={36} height={36} className="rounded-lg shadow-sm" />
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-white rounded-full animate-pulse"></div>
                </div>
                <h1 className="text-xl font-bold text-white" style={{ fontFamily: "'Courier New', Courier, monospace" }}>PadBuddy</h1>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsSearchModalOpen(true)}
                  className="hover:bg-white/20 text-white"
                >
                  <Search className="h-5 w-5" />
                </Button>
                <NotificationBell />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsMenuOpen(true)}
                  className="hover:bg-white/20 text-white"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </div>
        </nav>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* Dashboard Overview Banner */}
          <Banner
            variant="gradient"
            title="Dashboard Overview"
            description="Monitor your rice farming operations at a glance"
            icon={<TrendingUp className="h-6 w-6" />}
          />

          {/* Stats Cards */}
          <div className="grid grid-cols-2 gap-4 mt-6">
            {/* Total Fields */}
            <Card className="border-0 shadow-md bg-white">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">Total Fields</span>
                  <div className="h-10 w-10 rounded-lg bg-green-600 flex items-center justify-center">
                    <Sprout className="h-5 w-5 text-white" />
                  </div>
                </div>
                <p className="text-3xl font-bold text-green-600">{stats.totalFields}</p>
                <p className="text-xs text-gray-500 mt-1">Active fields</p>
              </CardContent>
            </Card>

            {/* Total Devices */}
            <Card className="border-0 shadow-md bg-white">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">Total Devices</span>
                  <div className="h-10 w-10 rounded-lg bg-blue-500 flex items-center justify-center">
                    <Smartphone className="h-5 w-5 text-white" />
                  </div>
                </div>
                <p className="text-3xl font-bold text-blue-500">{stats.totalDevices}</p>
                <p className="text-xs text-gray-500 mt-1">Connected devices</p>
              </CardContent>
            </Card>

            {/* Healthy Devices */}
            <Card className="border-0 shadow-md bg-white">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">Healthy Devices</span>
                  <div className="h-10 w-10 rounded-lg bg-emerald-500 flex items-center justify-center">
                    <CheckCircle className="h-5 w-5 text-white" />
                  </div>
                </div>
                <p className="text-3xl font-bold text-emerald-500">{stats.healthyDevices}</p>
                <p className="text-xs text-gray-500 mt-1">Working properly</p>
              </CardContent>
            </Card>

            {/* Issues */}
            <Card className="border-0 shadow-md bg-white">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">Issues</span>
                  <div className="h-10 w-10 rounded-lg bg-orange-500 flex items-center justify-center">
                    <AlertTriangle className="h-5 w-5 text-white" />
                  </div>
                </div>
                <p className="text-3xl font-bold text-orange-500">{stats.issueDevices}</p>
                <p className="text-xs text-gray-500 mt-1">Need attention</p>
              </CardContent>
            </Card>
          </div>

          {/* Your Fields Section */}
          <div className="mt-8">
            <h2 className="text-2xl font-bold text-gray-900">Your Fields</h2>
            <p className="text-gray-600 mt-1">Manage and monitor your rice fields</p>
          </div>

          {/* Fields List */}
          <div className="mt-4">
            {loadingFields ? (
              <div className="flex justify-center items-center py-20">
                <svg className="animate-spin h-10 w-10 text-green-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
            ) : fields.length === 0 ? (
              <Card className="border-0 shadow-md bg-white">
                <CardContent className="text-center py-12">
                  <div className="bg-gradient-to-br from-green-100 to-emerald-100 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-4 shadow-lg">
                    <Sprout className="h-10 w-10 text-green-600" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">No fields yet</h3>
                  <p className="text-gray-600">Get started by adding your first field</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {fields.map((field) => (
                  <Card
                    key={field.id}
                    onClick={() => router.push(`/field/${field.id}`)}
                    className="border-0 shadow-md bg-white hover:shadow-xl transition-all duration-300 cursor-pointer"
                  >
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between mb-3">
                        <h3 className="text-lg font-bold text-gray-900">{field.fieldName}</h3>
                        <div className="flex flex-col items-end gap-1.5">
                          {/* Field Status Badge */}
                          {field.status === 'harvested' && (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              🌾 Harvested
                            </span>
                          )}
                          {field.status === 'concluded' && (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                              🔚 Season Ended
                            </span>
                          )}
                          {/* Device Status Badge (only for active fields) */}
                          {(!field.status || field.status === 'active') && field.deviceStats && field.deviceStats.total > 0 && (
                            <div>
                              {field.deviceStats.offline > 0 ? (
                                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                                  {field.deviceStats.offline} Offline
                                </span>
                              ) : field.deviceStats.issues > 0 ? (
                                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700">
                                  {field.deviceStats.issues} Issue{field.deviceStats.issues > 1 ? 's' : ''}
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                                  All OK
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center text-sm text-gray-600">
                          <Sprout className="w-4 h-4 mr-2 text-green-600" />
                          {field.riceVariety}
                        </div>
                        <div className="flex items-center text-sm text-gray-600">
                          <TrendingUp className="w-4 h-4 mr-2 text-blue-500" />
                          Started {new Date(field.startDay).toLocaleDateString()}
                        </div>
                        {field.deviceStats && field.deviceStats.total > 0 && (
                          <div className="flex items-center text-sm text-gray-600">
                            <Smartphone className="w-4 h-4 mr-2 text-green-500" />
                            {field.deviceStats.total} {field.deviceStats.total === 1 ? 'Device' : 'Devices'}
                          </div>
                        )}
                        {field.description && (
                          <p className="text-sm text-gray-500 mt-2 line-clamp-2">{field.description}</p>
                        )}
                      </div>
                      <div className="mt-4 pt-3 border-t border-gray-100">
                        <span className="text-sm text-green-600 font-medium flex items-center">
                          View Details
                          <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </main>

        {/* Floating Action Button */}
        <button 
          onClick={() => setIsModalOpen(true)}
          className="fixed bottom-8 right-8 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-full shadow-2xl hover:shadow-3xl hover:from-green-700 hover:to-emerald-700 active:scale-95 transition-all flex items-center justify-center w-14 h-14 z-40"
        >
          <span className="text-3xl font-light">+</span>
        </button>

        {/* Bottom Sheet Modal for Add Field */}
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

        {/* Search Modal */}
        <Sheet open={isSearchModalOpen} onOpenChange={setIsSearchModalOpen}>
          <SheetContent side="bottom" className="h-[80vh] rounded-t-3xl">
            <SheetHeader>
              <SheetTitle>Search Fields</SheetTitle>
            </SheetHeader>
            <div className="mt-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search fields..."
                  className="w-full pl-10 pr-4 py-3 rounded-xl border-0 shadow-md focus:ring-2 focus:ring-green-200 bg-white focus:outline-none"
                />
              </div>
            </div>
          </SheetContent>
        </Sheet>

        {/* Sidebar Menu */}
        <Sheet open={isMenuOpen} onOpenChange={setIsMenuOpen}>
          <SheetContent side="right" className="w-[300px] sm:w-[400px]">
            <SheetHeader className="relative">
              <SheetTitle className="text-xl font-bold">Menu</SheetTitle>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsMenuOpen(false)}
                className="absolute right-0 top-0 h-8 w-8 rounded-full hover:bg-accent transition-colors"
              >
                <X className="h-5 w-5" />
              </Button>
            </SheetHeader>
            <div className="flex flex-col h-[calc(100%-4rem)] mt-6">
              {/* User Info */}
              <div className="flex items-center gap-3 pb-6 border-b border-green-200/50 animate-fade-in">
                {user?.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || user.email || "User"}
                    className="w-12 h-12 rounded-full object-cover ring-2 ring-primary/20 shadow-md"
                  />
                ) : (
                  <div className="w-12 h-12 bg-gradient-to-br from-primary to-primary/80 rounded-full flex items-center justify-center ring-2 ring-primary/20 shadow-md">
                    <span className="text-primary-foreground font-semibold text-lg">
                      {user?.displayName?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate text-gray-800">
                    {user?.displayName || user?.email?.split('@')[0] || 'User'}
                  </p>
                  <p className="text-xs text-gray-600">Rice Farmer</p>
                </div>
              </div>

              {/* Menu Items */}
              <nav className="flex-1 py-4 space-y-2 overflow-y-auto min-h-0">
                <Button
                  variant={pathname === '/' ? "default" : "ghost"}
                  className={`w-full justify-start transition-all duration-200 relative ${
                    pathname === '/' 
                      ? 'bg-gradient-to-r from-green-600 to-emerald-600 text-white shadow-md hover:from-green-700 hover:to-emerald-700' 
                      : 'hover:bg-white/60 hover:text-gray-900 text-gray-700'
                  }`}
                  onClick={() => {
                    router.push('/');
                    setIsMenuOpen(false);
                  }}
                >
                  <div className={`absolute left-0 top-1/2 -translate-y-1/2 h-8 w-1 rounded-r-full transition-all duration-200 ${
                    pathname === '/' ? 'bg-white' : 'bg-transparent'
                  }`} />
                  <HomeIcon className={`mr-3 h-5 w-5 transition-transform duration-200 ${
                    pathname === '/' ? 'scale-110' : 'group-hover:scale-110'
                  }`} />
                  <span className="font-medium">My Fields</span>
                </Button>
                <Button
                  variant={pathname === '/varieties' ? "default" : "ghost"}
                  className={`w-full justify-start transition-all duration-200 relative ${
                    pathname === '/varieties' 
                      ? 'bg-gradient-to-r from-green-600 to-emerald-600 text-white shadow-md hover:from-green-700 hover:to-emerald-700' 
                      : 'hover:bg-white/60 hover:text-gray-900 text-gray-700'
                  }`}
                  onClick={() => {
                    router.push('/varieties');
                    setIsMenuOpen(false);
                  }}
                >
                  <div className={`absolute left-0 top-1/2 -translate-y-1/2 h-8 w-1 rounded-r-full transition-all duration-200 ${
                    pathname === '/varieties' ? 'bg-white' : 'bg-transparent'
                  }`} />
                  <BookOpen className={`mr-3 h-5 w-5 transition-transform duration-200 ${
                    pathname === '/varieties' ? 'scale-110' : 'group-hover:scale-110'
                  }`} />
                  <span className="font-medium">Rice Varieties</span>
                </Button>
                {visibility.helpPageVisible && (
                  <Button
                    variant={pathname === '/help' ? "default" : "ghost"}
                    className={`w-full justify-start transition-all duration-200 relative ${
                      pathname === '/help' 
                        ? 'bg-gradient-to-r from-green-600 to-emerald-600 text-white shadow-md hover:from-green-700 hover:to-emerald-700' 
                        : 'hover:bg-white/60 hover:text-gray-900 text-gray-700'
                    }`}
                    onClick={() => {
                      router.push('/help');
                      setIsMenuOpen(false);
                    }}
                  >
                    <div className={`absolute left-0 top-1/2 -translate-y-1/2 h-8 w-1 rounded-r-full transition-all duration-200 ${
                      pathname === '/help' ? 'bg-white' : 'bg-transparent'
                    }`} />
                    <HelpCircle className={`mr-3 h-5 w-5 transition-transform duration-200 ${
                      pathname === '/help' ? 'scale-110' : 'group-hover:scale-110'
                    }`} />
                    <span className="font-medium">Help & Support</span>
                  </Button>
                )}
                {visibility.aboutPageVisible && (
                  <Button
                    variant={pathname === '/about' ? "default" : "ghost"}
                    className={`w-full justify-start transition-all duration-200 relative ${
                      pathname === '/about' 
                        ? 'bg-gradient-to-r from-green-600 to-emerald-600 text-white shadow-md hover:from-green-700 hover:to-emerald-700' 
                        : 'hover:bg-white/60 hover:text-gray-900 text-gray-700'
                    }`}
                    onClick={() => {
                      router.push('/about');
                      setIsMenuOpen(false);
                    }}
                  >
                    <div className={`absolute left-0 top-1/2 -translate-y-1/2 h-8 w-1 rounded-r-full transition-all duration-200 ${
                      pathname === '/about' ? 'bg-white' : 'bg-transparent'
                    }`} />
                    <Info className={`mr-3 h-5 w-5 transition-transform duration-200 ${
                      pathname === '/about' ? 'scale-110' : 'group-hover:scale-110'
                    }`} />
                    <span className="font-medium">About PadBuddy</span>
                  </Button>
                )}

                {/* Admin Panel - Only visible to admin */}
                {user?.email === ADMIN_EMAIL && (
                  <>
                    <div className="border-t border-gray-200 my-3"></div>
                    <Button
                      variant="ghost"
                      className="w-full justify-start transition-all duration-200 relative bg-purple-50 hover:bg-purple-100 text-purple-700"
                      onClick={() => {
                        router.push('/admin');
                        setIsMenuOpen(false);
                      }}
                    >
                      <Shield className="mr-3 h-5 w-5" />
                      <span className="font-medium">Admin Panel</span>
                    </Button>
                  </>
                )}
              </nav>

              {/* Sign Out */}
              <div className="pt-4 border-t border-green-200/50 flex-shrink-0">
                <Button
                  type="button"
                  variant="destructive"
                  className="w-full bg-gradient-to-b from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-medium py-3 rounded-lg transition-all duration-200 shadow-md hover:shadow-lg active:scale-[0.98]"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsLogoutModalOpen(true);
                  }}
                >
                  <LogOut className="mr-2 h-5 w-5" />
                  Sign Out
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>

        {/* Logout Confirmation Modal */}
        <Dialog open={isLogoutModalOpen} onOpenChange={setIsLogoutModalOpen}>
          <DialogContent className="sm:max-w-md rounded-2xl border-0 shadow-2xl bg-white animate-fade-in">
            <DialogHeader className="text-center pb-4">
              <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-gradient-to-br from-red-100 to-red-200 flex items-center justify-center shadow-md">
                <LogOut className="h-8 w-8 text-red-600" />
              </div>
              <DialogTitle className="text-2xl font-bold text-gray-900">
                Sign Out?
              </DialogTitle>
              <DialogDescription className="text-base text-gray-600 pt-2 px-2">
                Are you sure you want to sign out? You'll need to sign in again to access your fields.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-row gap-3 pt-4 pb-2">
              <Button
                variant="ghost"
                onClick={() => setIsLogoutModalOpen(false)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 font-medium py-3 rounded-xl transition-all active:scale-[0.98] border-0"
                disabled={isLoggingOut}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={async () => {
                  setIsLoggingOut(true);
                  try {
                    setIsMenuOpen(false);
                    setIsLogoutModalOpen(false);
                    await signOut();
                    router.push('/auth');
                  } catch (error) {
                    console.error('Sign out error:', error);
                    setIsLoggingOut(false);
                    setIsLogoutModalOpen(false);
                    alert('Failed to sign out. Please try again.');
                  }
                }}
                disabled={isLoggingOut}
                className="flex-1 bg-gradient-to-b from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-medium py-3 rounded-xl transition-all shadow-md hover:shadow-lg disabled:opacity-50 active:scale-[0.98]"
              >
                {isLoggingOut ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Signing out...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <LogOut className="h-4 w-4" />
                    Sign Out
                  </span>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </ProtectedRoute>
  );
}
