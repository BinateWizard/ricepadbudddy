'use client';

import ProtectedRoute from "@/components/ProtectedRoute";
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
import { DeviceStatus, SensorReadings, ControlPanel, DeviceInformation, DataTrends, DeviceStatistics, BoundaryMappingModal, LocationModal, TrendsChart } from './components';
import { useWeatherData, useGPSData } from './hooks/useDeviceData';
import { getVarietyByName } from '@/lib/utils/varietyHelpers';
import { calculatePolygonArea, formatTimestamp, validateCoordinates, getDeviceStatusDisplay } from './utils/deviceHelpers';

// Register Chart.js components
ChartJS.register(LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend);
import { useParams, useRouter, usePathname } from "next/navigation";
import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { db, database } from '@/lib/firebase';
import { doc, getDoc, collection, getDocs, updateDoc, query, where, onSnapshot, doc as firestoreDoc } from 'firebase/firestore';
import { ref, get, onValue, set } from 'firebase/database';
import { getDeviceData, onDeviceValue } from '@/lib/utils/rtdbHelper';
import NotificationBell from "@/components/NotificationBell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Menu, Home as HomeIcon, BookOpen, HelpCircle, Info, LogOut, Shield } from "lucide-react";
import { usePageVisibility } from "@/lib/hooks/usePageVisibility";
import { usePaddyLiveData } from "@/lib/hooks/usePaddyLiveData";
import { getDeviceLogs } from '@/lib/utils/deviceLogs';

export default function DeviceDetail() {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const { visibility } = usePageVisibility();
  const deviceId = params.id as string;
  
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | 'all'>('7d');
  const [historicalLogs, setHistoricalLogs] = useState<any[]>([]);
  const [realtimeLogs, setRealtimeLogs] = useState<any[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [deviceInfo, setDeviceInfo] = useState<any>(null);
  const [paddyInfo, setPaddyInfo] = useState<any>(null);
  const [fieldInfo, setFieldInfo] = useState<any>(null);
  const [deviceReadings, setDeviceReadings] = useState<any[]>([]);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const gpsData = useGPSData(deviceId);
  const [loadingGps, setLoadingGps] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const weatherData = useWeatherData(deviceId);
  
  // Control Panel states
  const [isScanning, setIsScanning] = useState(false);
  const [lastScanTime, setLastScanTime] = useState<Date | null>(null);
  const [scanSuccess, setScanSuccess] = useState(false);
  
  // Boundary mapping states
  const [showBoundaryModal, setShowBoundaryModal] = useState(false);
  const [polygonCoords, setPolygonCoords] = useState<{lat: number; lng: number}[]>([]);
  const [mapCenter, setMapCenter] = useState({ lat: 14.5995, lng: 120.9842 }); // Default Philippines, will be updated
  const [isSavingBoundary, setIsSavingBoundary] = useState(false);
  const [inputLat, setInputLat] = useState('');
  const [inputLng, setInputLng] = useState('');
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [pointAddedNotification, setPointAddedNotification] = useState(false);
  const [hasSavedBoundary, setHasSavedBoundary] = useState(false);
  const [relayStates, setRelayStates] = useState<boolean[]>([false, false, false, false]);
  const [relayProcessing, setRelayProcessing] = useState<boolean[]>([false, false, false, false]);
  const [motorExtended, setMotorExtended] = useState(false);
  const [motorProcessing, setMotorProcessing] = useState(false);
  const [mapMode, setMapMode] = useState<'view' | 'edit'>('view');
  const [deviceOnlineStatus, setDeviceOnlineStatus] = useState<{online: boolean; lastChecked: number} | null>(null);

  // Device logs state
  const [showDeviceLogs, setShowDeviceLogs] = useState(false);
  const [deviceLogs, setDeviceLogs] = useState<any[]>([]);
  const [loadingDeviceLogs, setLoadingDeviceLogs] = useState(false);
  const [logsLimit, setLogsLimit] = useState(10);

  // Per-paddy NPK goal (total fertilizer target), derived from field variety and paddy area
  const [npkGoal, setNpkGoal] = useState<{ n: string; p: string; k: string } | null>(null);

  // Live NPK data from Firestore logs (populated by Cloud Functions)
  const paddyLiveData = usePaddyLiveData(user?.uid ?? null, fieldInfo?.id ?? null, paddyInfo?.id ?? null);

  // Listen to RTDB status (set by Cloud Function based on heartbeat)
  useEffect(() => {
    if (!deviceId) return;

    const statusRef = ref(database, `devices/${deviceId}/status`);
    const unsubscribe = onValue(statusRef, (snapshot) => {
      if (snapshot.exists()) {
        const status = snapshot.val();
        setDeviceOnlineStatus({
          online: status.online === true,
          lastChecked: status.lastChecked || Date.now()
        });
      } else {
        setDeviceOnlineStatus(null);
      }
    });

    return () => unsubscribe();
  }, [deviceId]);

  // Listen to relay states from RTDB (stored by Cloud Function)
  // Listens to individual relays so it updates even if not all relays are stored yet
  useEffect(() => {
    if (!deviceId) return;

    const unsubscribes: (() => void)[] = [];
    
    // Listen to each relay individually
    for (let i = 1; i <= 4; i++) {
      const relayRef = ref(database, `devices/${deviceId}/relays/${i}`);
      const unsubscribe = onValue(relayRef, (snapshot) => {
        if (snapshot.exists()) {
          const relayData = snapshot.val();
          const state = relayData.state === 'ON' || relayData.state === 'on' || relayData.state === true;
          setRelayStates(prev => {
            const newStates = [...prev];
            newStates[i - 1] = state;
            return newStates;
          });
        }
      });
      unsubscribes.push(unsubscribe);
    }

    return () => unsubscribes.forEach(unsub => unsub());
  }, [deviceId]);

  // Fallback: derive relay states from latest commands if /relays is missing
  // This keeps the UI in sync even before verifyLiveCommand populates relays
  useEffect(() => {
    if (!deviceId) return;

    const commandsRef = ref(database, `devices/${deviceId}/commands/ESP32A`);
    const unsubscribe = onValue(commandsRef, (snapshot) => {
      const commands = snapshot.val();
      if (!commands) return;

      setRelayStates((prev) => {
        const next = [...prev];

        for (let i = 1; i <= 4; i++) {
          const cmd = commands[`relay${i}`];
          if (!cmd) continue;

          const rawState = (cmd.actualState || cmd.action || '').toString().toUpperCase();
          const isOn = rawState === 'ON' || rawState === '1' || rawState === 'TRUE';
          next[i - 1] = isOn;
        }

        return next;
      });
    });

    return () => unsubscribe();
  }, [deviceId]);

  // Load existing boundary coordinates from Firestore
  useEffect(() => {
    const loadBoundary = async () => {
      if (!user || !fieldInfo || !paddyInfo) return;
      
      try {
        const paddyRef = firestoreDoc(db, `users/${user.uid}/fields/${fieldInfo.id}/paddies/${paddyInfo.id}`);
        const paddySnap = await getDoc(paddyRef);
        
        if (paddySnap.exists()) {
          const data = paddySnap.data();
          if (data.boundary && data.boundary.coordinates) {
            setPolygonCoords(data.boundary.coordinates);
            setHasSavedBoundary(true);
            
            // Set map center to first coordinate if available
            if (data.boundary.coordinates.length > 0) {
              setMapCenter({
                lat: data.boundary.coordinates[0].lat,
                lng: data.boundary.coordinates[0].lng
              });
            }
          } else {
            setHasSavedBoundary(false);
          }
        }
      } catch (error) {
        console.error('Error loading boundary:', error);
        setHasSavedBoundary(false);
      }
    };
    
    loadBoundary();
  }, [user, fieldInfo, paddyInfo]);

  // Weather data handled via useWeatherData hook

  // Sync live data from Firestore to state
  useEffect(() => {
    if (!paddyLiveData.data || !user || !paddyInfo || !fieldInfo) return;

    setDeviceInfo((prev: any) => ({
      ...prev,
      npk: {
        n: paddyLiveData.data!.nitrogen,
        p: paddyLiveData.data!.phosphorus,
        k: paddyLiveData.data!.potassium,
        timestamp: paddyLiveData.data!.timestamp?.getTime(),
      },
      status: 'connected',
      connectedAt: new Date().toISOString(),
    }));
    setDeviceReadings([{ deviceId, npk: paddyLiveData.data, status: 'connected' }]);
    
    // Cloud Functions automatically log sensor data from RTDB to Firestore
  }, [paddyLiveData.data, user, paddyInfo, fieldInfo, deviceId]);

  // Real-time RTDB listener for live chart updates
  useEffect(() => {
    if (!deviceId) return;

    const unsubscribe = onDeviceValue(deviceId, 'npk', (data) => {
      if (!data) return;
      
      // Use ESP32 timestamp if valid (in milliseconds), otherwise use current time
      const timestamp = data.timestamp && data.timestamp > 1700000000000 
        ? new Date(data.timestamp) 
        : new Date();
      
      // Only add if we have actual NPK values
      if (data.n !== undefined || data.p !== undefined || data.k !== undefined) {
        const newLog = {
          id: `rtdb-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp,
          nitrogen: data.n,
          phosphorus: data.p,
          potassium: data.k,
          _src: 'rtdb'
        };
        
        setRealtimeLogs(prev => {
          // Dedupe by NPK values (same n, p, k = same reading)
          const lastLog = prev[prev.length - 1];
          const isDuplicate = lastLog && 
            lastLog.nitrogen === data.n && 
            lastLog.phosphorus === data.p && 
            lastLog.potassium === data.k;
          
          if (isDuplicate) return prev;
          
          // Keep only last 10 real-time entries
          const updated = [...prev, newLog].slice(-10);
          return updated;
        });
      }
    });

    return () => unsubscribe();
  }, [user, paddyInfo, fieldInfo, deviceId]);

  // Real-time Firestore listener for paddy logs (historical + real-time)
  useEffect(() => {
    if (!user || !paddyInfo || !fieldInfo) return;
    setIsLoadingLogs(true);

    const now = new Date();
    let startDate = new Date();
    switch (timeRange) {
      case '7d': startDate.setDate(now.getDate() - 7); break;
      case '30d': startDate.setDate(now.getDate() - 30); break;
      case '90d': startDate.setDate(now.getDate() - 90); break;
      case 'all': startDate = new Date(0); break;
    }

    // Listen to paddy logs from Firestore (single source of truth)
    const paddyRef = collection(db, `users/${user.uid}/fields/${fieldInfo.id}/paddies/${paddyInfo.id}/logs`);
    const pq = timeRange === 'all' ? paddyRef : query(paddyRef, where('timestamp', '>=', startDate));
    const unsubPaddy = onSnapshot(pq, (snapshot) => {
      const arr: any[] = [];
      snapshot.forEach((doc) => {
        const data: any = doc.data();
        const logDate = data.timestamp?.toDate?.() || new Date(data.timestamp);
        if (logDate >= startDate) {
          arr.push({ ...data, id: doc.id, timestamp: logDate, _src: 'firestore' });
        }
      });
      const sorted = arr.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      setHistoricalLogs(sorted);
      setIsLoadingLogs(false);
    }, (err) => {
      console.error('Paddy logs listener error:', err);
      setIsLoadingLogs(false);
    });

    return () => {
      try { unsubPaddy(); } catch {}
    };
  }, [user, paddyInfo, fieldInfo, timeRange]);

  // Reset to page 1 when time range changes
  useEffect(() => {
    setCurrentPage(1);
  }, [timeRange]);
    
  // Get device status - use Cloud Function's online status determination
  const deviceStatus = getDeviceStatusDisplay(deviceOnlineStatus, paddyLiveData);
  
  // Fetch device and paddy information
  useEffect(() => {
    const fetchDeviceInfo = async () => {
      if (!user) return;
      
      try {
        // Find which paddy this device belongs to
        const fieldsRef = collection(db, `users/${user.uid}/fields`);
        const fieldsSnapshot = await getDocs(fieldsRef);
        
        for (const fieldDoc of fieldsSnapshot.docs) {
          const paddiesRef = collection(db, `users/${user.uid}/fields/${fieldDoc.id}/paddies`);
          const paddiesSnapshot = await getDocs(paddiesRef);
          
          for (const paddyDoc of paddiesSnapshot.docs) {
            const paddyData = paddyDoc.data();
            if (paddyData.deviceId === deviceId) {
              setPaddyInfo({ id: paddyDoc.id, ...paddyData });
              setFieldInfo({ id: fieldDoc.id, ...fieldDoc.data() });
              return;
            }
          }
        }
      } catch (error) {
        console.error('Error fetching device info:', error);
      }
    };
    
    fetchDeviceInfo();
  }, [user, deviceId]);

  // Derive NPK goal for this paddy based on field variety and mapped area
  useEffect(() => {
    try {
      if (!fieldInfo || !paddyInfo) {
        setNpkGoal(null);
        return;
      }

      const fieldData: any = fieldInfo;
      const paddyData: any = paddyInfo;

      const varietyName = fieldData.riceVariety || fieldData.varietyName;
      const variety = varietyName ? getVarietyByName(varietyName) : null;

      let areaHa: number | null = null;
      if (typeof paddyData?.boundary?.area === 'number') {
        areaHa = paddyData.boundary.area / 10000;
      } else if (typeof paddyData?.areaHectares === 'number') {
        areaHa = paddyData.areaHectares;
      } else if (typeof paddyData?.areaM2 === 'number') {
        areaHa = paddyData.areaM2 / 10000;
      }

      if (!variety || !areaHa || areaHa <= 0) {
        setNpkGoal(null);
        return;
      }

      const { N, P2O5, K2O } = variety.npkPerHa;
      const area = areaHa;

      const nMid = ((N.min + N.max) / 2) * area;
      const pMid = ((P2O5.min + P2O5.max) / 2) * area;
      const kMid = ((K2O.min + K2O.max) / 2) * area;

      setNpkGoal({
        n: nMid.toFixed(1),
        p: pMid.toFixed(1),
        k: kMid.toFixed(1),
      });
    } catch (error) {
      console.error('Error deriving NPK goal for paddy:', error);
      setNpkGoal(null);
    }
  }, [fieldInfo, paddyInfo]);

  // Load existing boundary coordinates from Firestore
  useEffect(() => {
    const loadBoundary = async () => {
      if (!user || !fieldInfo || !paddyInfo) return;
      
      try {
        const paddyRef = doc(db, `users/${user.uid}/fields/${fieldInfo.id}/paddies/${paddyInfo.id}`);
        const paddySnap = await getDoc(paddyRef);
        
        if (paddySnap.exists()) {
          const data = paddySnap.data();
          if (data.boundary && data.boundary.coordinates) {
            setPolygonCoords(data.boundary.coordinates);
            
            // Set map center to first coordinate if available
            if (data.boundary.coordinates.length > 0) {
              setMapCenter({
                lat: data.boundary.coordinates[0].lat,
                lng: data.boundary.coordinates[0].lng
              });
            }
          }
        }
      } catch (error) {
        console.error('Error loading boundary:', error);
      }
    };
    
    loadBoundary();
  }, [user, fieldInfo, paddyInfo]);
  
  // GPS data handled via useGPSData hook
  
  // Historical logs are now handled via real-time snapshot listeners above
  
  // Disconnect device handler
  const handleDisconnect = async () => {
    if (!user || !paddyInfo || !fieldInfo) return;
    
    const confirmed = confirm('Are you sure you want to disconnect this device? This action cannot be undone.');
    if (!confirmed) return;
    
    try {
      // Delete the paddy document
      await updateDoc(doc(db, `users/${user.uid}/fields/${fieldInfo.id}/paddies/${paddyInfo.id}`), {
        deviceId: null,
        disconnectedAt: new Date().toISOString()
      });
      
      alert('Device disconnected successfully');
      router.push(`/field/${fieldInfo.id}`);
    } catch (error) {
      console.error('Error disconnecting device:', error);
      alert('Failed to disconnect device');
    }
  };

  // Handle location view
  const handleViewLocation = async () => {
    if (!user) return;

    setShowLocationModal(true);
    setLoadingGps(true);
    
    try {
      // Send GPS read command to ESP32B
      const { sendDeviceCommand } = await import('@/lib/utils/deviceCommands');
      const { logUserAction } = await import('@/lib/utils/userActions');
      
      const result = await sendDeviceCommand(
        deviceId,
        'ESP32B',
        'gps',
        'read',
        {},
        user.uid
      );
      
      if (result.success) {
        console.log('✓ GPS read command sent successfully');
        
        // Log successful action
        await logUserAction({
          deviceId,
          action: 'GPS Read',
          details: {
            result: 'success',
            source: 'device_page'
          }
        });
        
        // GPS data will be updated via real-time listener
      } else {
        console.warn('GPS read command failed:', result.message);
      }
    } catch (error) {
      console.error('Error sending GPS read command:', error);
    } finally {
      setLoadingGps(false);
    }
  };



  // Control Panel Functions
  const handleScanNow = async () => {
    if (!user || !fieldInfo || !paddyInfo) return;
    
    setIsScanning(true);
    setScanSuccess(false);
    
    try {
      // Send scan command to device via RTDB
      const { sendDeviceCommand } = await import('@/lib/utils/deviceCommands');
      const { logUserAction } = await import('@/lib/utils/userActions');
      
      // Assuming ESP32C handles NPK scanning
      const result = await sendDeviceCommand(deviceId, 'ESP32C', 'npk', 'scan', {}, user.uid);
      
      if (result.success) {
        setLastScanTime(new Date());
        setScanSuccess(true);
        
        // Log successful action
        await logUserAction({
          deviceId,
          action: 'NPK Scan',
          details: {
            result: 'success',
            source: 'device_page'
          }
        });
        
        // Auto-hide success message after 3 seconds
        setTimeout(() => setScanSuccess(false), 3000);
      } else {
        throw new Error(result.message || 'Scan command failed');
      }
    } catch (error) {
      console.error('Error scanning device:', error);
      alert('Failed to send scan command to device');
      
      // Log error
      const { logUserAction } = await import('@/lib/utils/userActions');
      await logUserAction({
        deviceId,
        action: 'NPK Scan',
        details: {
          result: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
          source: 'device_page'
        }
      });
    } finally {
      setIsScanning(false);
    }
  };
  
  // Boundary mapping functions
  const handleOpenBoundaryMap = () => {
    // Priority 1: Use device GPS location if available
    if (gpsData && gpsData.lat && gpsData.lng) {
      setMapCenter({
        lat: gpsData.lat,
        lng: gpsData.lng
      });
      setShowBoundaryModal(true);
    } 
    // Priority 2: Try to get user's browser geolocation
    else if (navigator.geolocation) {
      setShowBoundaryModal(true); // Show modal immediately
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setMapCenter({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (error) => {
          console.log('Geolocation error:', error);
          // Keep default location if geolocation fails
          alert('Location access denied. Using default map location. Please enable location permissions or enter coordinates manually.');
        },
        {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 0
        }
      );
    } else {
      // No geolocation support
      alert('Geolocation is not supported by your browser. Using default map location. Please enter coordinates manually.');
      setShowBoundaryModal(true);
    }
  };
  
  // Add point at crosshair (map center)
  const handleAddPointAtCrosshair = () => {
    handleAddPoint(mapCenter.lat, mapCenter.lng);
  };
  
  // Update map center when iframe map is moved
  const handleUpdateMapCenter = () => {
    // The map center is already set, we just add the point at current center
    handleAddPointAtCrosshair();
  };
  
  const handleAddPoint = (lat: number, lng: number) => {
    setPolygonCoords(prev => [...prev, { lat, lng }]);
    
    // Show notification
    setPointAddedNotification(true);
    setTimeout(() => setPointAddedNotification(false), 2000);
  };
  
  const handleAddCoordinateFromInput = () => {
    const validation = validateCoordinates(inputLat, inputLng);
    
    if (!validation.valid) {
      alert(validation.error);
      return;
    }
    
    handleAddPoint(parseFloat(inputLat), parseFloat(inputLng));
    setInputLat('');
    setInputLng('');
  };
  
  const handleRemovePoint = (index: number) => {
    setPolygonCoords(prev => prev.filter((_, i) => i !== index));
  };
  
  const handleRemoveLastPoint = () => {
    setPolygonCoords(prev => prev.slice(0, -1));
  };
  
  const handleClearPolygon = () => {
    setPolygonCoords([]);
  };
  
  const handleSaveBoundary = async () => {
    if (!user || !fieldInfo || !paddyInfo) return;
    
    if (polygonCoords.length < 3) {
      alert('Please add at least 3 points to create a boundary area');
      return;
    }

    setIsSavingBoundary(true);
    try {
      const paddyRef = doc(db, `users/${user.uid}/fields/${fieldInfo.id}/paddies/${paddyInfo.id}`);
      
      const area = calculatePolygonArea(polygonCoords);
      
      // Save boundary with all coordinates to Firestore
      await updateDoc(paddyRef, {
        boundary: {
          coordinates: polygonCoords.map(coord => ({
            lat: parseFloat(coord.lat.toFixed(8)), // Store with 8 decimal precision
            lng: parseFloat(coord.lng.toFixed(8))
          })),
          area: area,
          pointCount: polygonCoords.length,
          updatedAt: new Date().toISOString()
        }
      });

      console.log('✓ Boundary saved successfully:', {
        points: polygonCoords.length,
        area: area,
        areaHectares: (area / 10000).toFixed(2),
        coordinates: polygonCoords
      });

      alert(`✓ Paddy boundary saved!\n\n${polygonCoords.length} Points\n${(area / 10000).toFixed(2)} hectares`);
      setHasSavedBoundary(true); // Mark as saved
      setShowBoundaryModal(false);
      // Keep polygonCoords for display, don't clear it
    } catch (error) {
      console.error('Error saving boundary:', error);
      alert('Failed to save boundary. Please try again.');
    } finally {
      setIsSavingBoundary(false);
    }
  };
  
  const handleRemoveBoundary = async () => {
    if (!user || !fieldInfo || !paddyInfo) return;
    
    const confirmed = confirm('Are you sure you want to remove the boundary mapping? This cannot be undone.');
    if (!confirmed) return;
    
    setIsSavingBoundary(true);
    try {
      const paddyRef = doc(db, `users/${user.uid}/fields/${fieldInfo.id}/paddies/${paddyInfo.id}`);
      
      await updateDoc(paddyRef, {
        boundary: null
      });
      
      setPolygonCoords([]);
      setHasSavedBoundary(false); // Update state
      alert('✓ Boundary removed successfully');
    } catch (error) {
      console.error('Error removing boundary:', error);
      alert('Failed to remove boundary. Please try again.');
    } finally {
      setIsSavingBoundary(false);
    }
  };

  // Relay control handler
  const handleRelayToggle = async (relayIndex: number) => {
    if (!user) return;
    
    const newState = !relayStates[relayIndex];
    const relayNum = relayIndex + 1;
    
    // Set processing state
    const newProcessingStates = [...relayProcessing];
    newProcessingStates[relayIndex] = true;
    setRelayProcessing(newProcessingStates);
    
    try {
      // Import the sendDeviceCommand function
      const { sendDeviceCommand } = await import('@/lib/utils/deviceCommands');
      const { logUserAction } = await import('@/lib/utils/userActions');
      const { logDeviceAction } = await import('@/lib/utils/deviceLogs');
      
      const result = await sendDeviceCommand(
        deviceId,
        'ESP32A', // Relay controller node
        'relay',
        newState ? 'on' : 'off',
        { relay: relayNum },
        user.uid
      );
      
      if (result.success && result.status === 'completed') {
        // Update local state only on success
        const newRelayStates = [...relayStates];
        newRelayStates[relayIndex] = newState;
        setRelayStates(newRelayStates);
        
        // Show success feedback
        const msg = `✓ Relay ${relayNum} turned ${newState ? 'ON' : 'OFF'}`;
        console.log(msg);
        
        // Log to both user actions (for Control Panel History) and device actions (for Field logs)
        await Promise.all([
          logUserAction({
            deviceId,
            fieldId: fieldInfo?.id,
            action: `Relay ${relayNum} ${newState ? 'ON' : 'OFF'}`,
            details: {
              relayNumber: relayNum,
              state: newState ? 'ON' : 'OFF',
              result: 'success',
              source: 'device_page'
            }
          }),
          logDeviceAction({
            deviceId,
            userId: user.uid,
            fieldId: fieldInfo?.id || '',
            nodeId: 'ESP32A',
            action: `Relay ${relayNum} ${newState ? 'ON' : 'OFF'}`,
            actionType: 'relay',
            params: { relay: relayNum, state: newState ? 'ON' : 'OFF' },
            result: 'success',
            details: { source: 'device_page' }
          })
        ]);
        
        // Optional: Show toast notification instead of alert
        // For now, we'll skip the alert to avoid blocking UI
      } else if (result.status === 'timeout') {
        // Timeout - device may be offline
        alert(`⏱️ Relay ${relayNum} command timeout. Device may be offline or busy. Please check device status.`);
        
        // Log timeout to both locations
        const { logUserAction } = await import('@/lib/utils/userActions');
        const { logDeviceAction } = await import('@/lib/utils/deviceLogs');
        await Promise.all([
          logUserAction({
            deviceId,
            fieldId: fieldInfo?.id,
            action: `Relay ${relayNum} ${newState ? 'ON' : 'OFF'}`,
            details: {
              relayNumber: relayNum,
              state: newState ? 'ON' : 'OFF',
              result: 'timeout',
              message: 'Device offline or busy',
              source: 'device_page'
            }
          }),
          logDeviceAction({
            deviceId,
            userId: user.uid,
            fieldId: fieldInfo?.id || '',
            nodeId: 'ESP32A',
            action: `Relay ${relayNum} ${newState ? 'ON' : 'OFF'}`,
            actionType: 'relay',
            params: { relay: relayNum, state: newState ? 'ON' : 'OFF' },
            result: 'timeout',
            details: { source: 'device_page', message: 'Device offline or busy' }
          })
        ]);
      } else {
        // Other error
        throw new Error(result.message || 'Command failed');
      }
    } catch (error) {
      console.error('Error toggling relay:', error);
      alert(`Failed to toggle Relay ${relayNum}. ${error instanceof Error ? error.message : 'Please try again.'}`);
      
      // Log error to both locations
      const { logUserAction } = await import('@/lib/utils/userActions');
      const { logDeviceAction } = await import('@/lib/utils/deviceLogs');
      await Promise.all([
        logUserAction({
          deviceId,
          fieldId: fieldInfo?.id,
          action: `Relay ${relayNum} ${newState ? 'ON' : 'OFF'}`,
          details: {
            relayNumber: relayNum,
            state: newState ? 'ON' : 'OFF',
            result: 'error',
            error: error instanceof Error ? error.message : 'Unknown error',
            source: 'device_page'
          }
        }),
        logDeviceAction({
          deviceId,
          userId: user.uid,
          fieldId: fieldInfo?.id || '',
          nodeId: 'ESP32A',
          action: `Relay ${relayNum} ${newState ? 'ON' : 'OFF'}`,
          actionType: 'relay',
          params: { relay: relayNum, state: newState ? 'ON' : 'OFF' },
          result: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
          details: { source: 'device_page' }
        })
      ]);
    } finally {
      // Clear processing state with a small delay to ensure UI updates
      setTimeout(() => {
        const newProcessingStates = [...relayProcessing];
        newProcessingStates[relayIndex] = false;
        setRelayProcessing(newProcessingStates);
      }, 100);
    }
  };

  // Motor control handler
  const handleMotorToggle = async () => {
    if (!user) return;

    // ESP32B expects "down" or "up" actions
    const motorAction = motorExtended ? 'up' : 'down';
    
    setMotorProcessing(true);
    try {
      const { sendDeviceCommand } = await import('@/lib/utils/deviceCommands');
      const { logUserAction } = await import('@/lib/utils/userActions');
      
      const result = await sendDeviceCommand(
        deviceId,
        'ESP32B',
        'motor',
        motorAction,
        {},
        user.uid
      );

      if (result.success && result.status === 'completed') {
        setMotorExtended(!motorExtended);
        console.log(`✓ Motor moved ${motorAction} successfully`);
        
        // Log successful action to both locations
        const { logUserAction } = await import('@/lib/utils/userActions');
        const { logDeviceAction } = await import('@/lib/utils/deviceLogs');
        await Promise.all([
          logUserAction({
            deviceId,
            fieldId: fieldInfo?.id,
            action: `Motor ${motorAction}`,
            details: {
              motorAction,
              result: 'success',
              source: 'device_page'
            }
          }),
          logDeviceAction({
            deviceId,
            userId: user.uid,
            fieldId: fieldInfo?.id || '',
            nodeId: 'ESP32B',
            action: `Motor ${motorAction}`,
            actionType: 'motor',
            params: { action: motorAction },
            result: 'success',
            details: { source: 'device_page' }
          })
        ]);
      } else if (result.status === 'timeout') {
        alert(`⏱️ Motor command timeout. Device may be offline.`);
        
        // Log timeout to both locations
        const { logUserAction } = await import('@/lib/utils/userActions');
        const { logDeviceAction } = await import('@/lib/utils/deviceLogs');
        await Promise.all([
          logUserAction({
            deviceId,
            fieldId: fieldInfo?.id,
            action: `Motor ${motorAction}`,
            details: {
              motorAction,
              result: 'timeout',
              message: 'Device offline',
              source: 'device_page'
            }
          }),
          logDeviceAction({
            deviceId,
            userId: user.uid,
            fieldId: fieldInfo?.id || '',
            nodeId: 'ESP32B',
            action: `Motor ${motorAction}`,
            actionType: 'motor',
            params: { action: motorAction },
            result: 'timeout',
            details: { source: 'device_page', message: 'Device offline' }
          })
        ]);
      } else {
        throw new Error(result.message || 'Command failed');
      }
    } catch (error) {
      console.error('Error toggling motor:', error);
      alert(`Failed to ${motorAction} motor. ${error instanceof Error ? error.message : 'Please try again.'}`);
      
      // Log error to both locations
      const { logUserAction } = await import('@/lib/utils/userActions');
      const { logDeviceAction } = await import('@/lib/utils/deviceLogs');
      await Promise.all([
        logUserAction({
          deviceId,
          fieldId: fieldInfo?.id,
          action: `Motor ${motorAction}`,
          details: {
            motorAction,
            result: 'error',
            error: error instanceof Error ? error.message : 'Unknown error',
            source: 'device_page'
          }
        }),
        logDeviceAction({
          deviceId,
          userId: user.uid,
          fieldId: fieldInfo?.id || '',
          nodeId: 'ESP32B',
          action: `Motor ${motorAction}`,
          actionType: 'motor',
          params: { action: motorAction },
          result: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
          details: { source: 'device_page' }
        })
      ]);
    } finally {
      setMotorProcessing(false);
    }
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <nav className="bg-gradient-to-r from-green-500 via-emerald-500 to-teal-500 shadow-lg sticky top-0 z-50">
          <div className="w-full px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center gap-2 text-sm">
                {/* Breadcrumb Navigation */}
                <button
                  onClick={() => router.push('/')}
                  className="flex items-center text-white hover:text-white/80 transition-colors"
                  title="Home"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                  </svg>
                </button>
                {fieldInfo && (
                  <>
                    <svg className="w-4 h-4 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    <button
                      onClick={() => router.push(`/field/${fieldInfo.id}`)}
                      className="text-white hover:text-white/80 transition-colors"
                    >
                      {fieldInfo.fieldName}
                    </button>
                  </>
                )}
                <svg className="w-4 h-4 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <span className="font-medium text-white">{paddyInfo?.paddyName || 'Device'}</span>
              </div>
              <div className="flex items-center gap-2">
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

        <main className="w-full px-2 sm:px-4 lg:px-8 py-6">
          {/* Device Status Component */}
          <DeviceStatus
            deviceId={deviceId}
            deviceStatus={deviceStatus}
            gpsData={gpsData}
            onViewLocation={handleViewLocation}
          />

          {/* Sensor Readings Component (Current Readings) */}
          <SensorReadings
            paddyLiveData={paddyLiveData}
            weatherData={weatherData}
            npkGoal={npkGoal}
          />

          {/* NPK Statistics Component (part of data insights) */}
          {user && paddyInfo && fieldInfo && (
            <DeviceStatistics 
              userId={user.uid}
              fieldId={fieldInfo.id}
              paddyId={paddyInfo.id}
              deviceId={deviceId}
              currentNPK={paddyLiveData.data ? { n: paddyLiveData.data.nitrogen, p: paddyLiveData.data.phosphorus, k: paddyLiveData.data.potassium, timestamp: paddyLiveData.data.timestamp?.getTime() } : undefined}
            />
          )}

          {/* Data Trends Component */}
          <DataTrends
            timeRange={timeRange}
            isLoadingLogs={isLoadingLogs}
            historicalLogs={historicalLogs}
            realtimeLogs={realtimeLogs}
            currentPage={currentPage}
            itemsPerPage={itemsPerPage}
            onTimeRangeChange={setTimeRange}
            onPageChange={setCurrentPage}
            onScanDevice={async () => {
              if (!paddyInfo || !fieldInfo || !user) {
                alert('Device not yet loaded');
                return;
              }
              const { sendDeviceCommand } = await import('@/lib/utils/deviceCommands');
              await sendDeviceCommand(deviceId, 'ESP32C', 'npk', 'scan', {}, user.uid);
            }}
          />

          {/* Device Control Component (Control Panel) */}
          <ControlPanel
            isScanning={isScanning}
            lastScanTime={lastScanTime}
            scanSuccess={scanSuccess}
            hasSavedBoundary={hasSavedBoundary}
            gpsData={gpsData}
            relayStates={relayStates}
            relayProcessing={relayProcessing}
            motorExtended={motorExtended}
            motorProcessing={motorProcessing}
            onScanNow={handleScanNow}
            onOpenBoundaryMap={() => router.push(`/device/${deviceId}/boundary-map`)}
            onViewLocation={handleViewLocation}
            onRelayToggle={handleRelayToggle}
            onMotorToggle={handleMotorToggle}
          />

          {/* Device Information */}
          <DeviceInformation
            deviceId={deviceId}
            paddyInfo={paddyInfo}
            fieldInfo={fieldInfo}
            gpsData={gpsData}
            deviceOnlineStatus={deviceOnlineStatus}
            onViewLocation={handleViewLocation}
            onSavePaddyName={async (name: string) => {
              if (!user || !fieldInfo || !paddyInfo) return;
              const paddyRef = doc(db, `users/${user.uid}/fields/${fieldInfo.id}/paddies/${paddyInfo.id}`);
              await updateDoc(paddyRef, { paddyName: name });
              setPaddyInfo({ ...paddyInfo, paddyName: name });
            }}
          />

          {/* Control Actions Log */}
          {user && (
            <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Control Actions Log</h3>
                <button
                  onClick={async () => {
                    setShowDeviceLogs(!showDeviceLogs);
                    if (!showDeviceLogs && deviceLogs.length === 0) {
                      setLoadingDeviceLogs(true);
                      try {
                        const result = await getDeviceLogs(deviceId, logsLimit);
                        if (result.success && result.logs) {
                          setDeviceLogs(result.logs);
                        }
                      } catch (error) {
                        console.error('Error loading device logs:', error);
                      } finally {
                        setLoadingDeviceLogs(false);
                      }
                    }
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  {showDeviceLogs ? 'Hide Logs' : 'View Logs'}
                </button>
              </div>
              
              {showDeviceLogs ? (
                <div className="space-y-4">
                  {loadingDeviceLogs ? (
                    <div className="text-center py-8">
                      <svg className="animate-spin h-8 w-8 text-blue-600 mx-auto" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <p className="text-sm text-gray-600 mt-2">Loading logs...</p>
                    </div>
                  ) : deviceLogs.length > 0 ? (
                    <>
                      <div className="space-y-3">
                        {deviceLogs.map((log, index) => (
                          <div key={log.id || index} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                  <span className={`px-2 py-1 rounded text-xs font-semibold ${
                                    log.actionType === 'relay' ? 'bg-orange-100 text-orange-800' :
                                    log.actionType === 'motor' ? 'bg-blue-100 text-blue-800' :
                                    log.actionType === 'npk' ? 'bg-purple-100 text-purple-800' :
                                    'bg-gray-100 text-gray-800'
                                  }`}>
                                    {log.actionType?.toUpperCase() || 'ACTION'}
                                  </span>
                                  <span className={`px-2 py-1 rounded text-xs font-semibold ${
                                    log.result === 'success' ? 'bg-green-100 text-green-800' :
                                    log.result === 'failed' ? 'bg-red-100 text-red-800' :
                                    log.result === 'timeout' ? 'bg-yellow-100 text-yellow-800' :
                                    'bg-gray-100 text-gray-800'
                                  }`}>
                                    {log.result?.toUpperCase() || 'PENDING'}
                                  </span>
                                </div>
                                <p className="text-sm font-medium text-gray-900">{log.action}</p>
                                <p className="text-xs text-gray-500 mt-1">
                                  {log.nodeId && <span className="font-mono">{log.nodeId}</span>}
                                  {log.nodeId && log.timestamp && ' • '}
                                  {log.timestamp && new Date(log.timestamp).toLocaleString()}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      
                      <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                        <p className="text-sm text-gray-600">Showing {deviceLogs.length} log{deviceLogs.length !== 1 ? 's' : ''}</p>
                        <div className="flex gap-2">
                          {logsLimit === 10 && (
                            <button
                              onClick={async () => {
                                setLogsLimit(50);
                                setLoadingDeviceLogs(true);
                                try {
                                  const result = await getDeviceLogs(deviceId, 50);
                                  if (result.success && result.logs) {
                                    setDeviceLogs(result.logs);
                                  }
                                } catch (error) {
                                  console.error('Error loading more logs:', error);
                                } finally {
                                  setLoadingDeviceLogs(false);
                                }
                              }}
                              className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                            >
                              Load More (50)
                            </button>
                          )}
                          <button
                            onClick={async () => {
                              setLoadingDeviceLogs(true);
                              try {
                                const result = await getDeviceLogs(deviceId, logsLimit);
                                if (result.success && result.logs) {
                                  setDeviceLogs(result.logs);
                                }
                              } catch (error) {
                                console.error('Error refreshing logs:', error);
                              } finally {
                                setLoadingDeviceLogs(false);
                              }
                            }}
                            className="px-3 py-1.5 text-xs bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors flex items-center gap-1"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            Refresh
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-8 bg-gray-50 rounded-lg">
                      <svg className="w-12 h-12 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <p className="text-sm text-gray-600">No logs found for this device</p>
                      <p className="text-xs text-gray-500 mt-1">Control actions will appear here</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600">Click "View Logs" to see device control history</p>
                  <p className="text-xs text-gray-500 mt-2">Track relay commands, motor actions, and sensor scans</p>
                </div>
              )}
            </div>
          )}

          {/* Danger Zone */}
          <div className="bg-white rounded-2xl shadow-lg p-6 border-0">
            <h3 className="text-lg font-semibold text-red-600 mb-2">Danger Zone</h3>
            <p className="text-sm text-gray-600 mb-4">
              Once you disconnect this device, all associated data will be removed and this action cannot be undone.
            </p>
            <button
              onClick={handleDisconnect}
              disabled={!paddyInfo}
              className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              Disconnect Device
            </button>
          </div>
        </main>

        {/* Floating Action Button - Navigate to Add Field */}
        <button 
          onClick={() => router.push('/')}
          className="fixed bottom-8 right-8 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-full shadow-2xl hover:shadow-3xl hover:from-green-700 hover:to-emerald-700 active:scale-95 transition-all flex items-center justify-center w-14 h-14 z-40"
          title="Add New Field"
        >
          <span className="text-3xl font-light">+</span>
        </button>

        {/* Location Modal */}
        {showLocationModal && (
          <>
            {/* Glassmorphism Overlay */}
            <div 
              onClick={() => setShowLocationModal(false)}
              className="fixed inset-0 backdrop-blur-sm bg-black/20 z-40 transition-all"
            />
            
            {/* Location Modal */}
            <div className="fixed inset-x-0 bottom-0 z-50 animate-slide-up">
              <div className="bg-white rounded-t-3xl shadow-2xl max-h-[85vh] flex flex-col border-t-4 border-green-500">
                {/* Handle Bar */}
                <div className="flex justify-center pt-3 pb-4">
                  <div className="w-12 h-1.5 bg-green-300 rounded-full" />
                </div>
                
                {/* Modal Header */}
                <div className="px-6 pb-4 border-b border-gray-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-2xl font-bold text-gray-900">GPS Location</h2>
                      <p className="text-sm text-gray-600 mt-1">Device: {deviceId}</p>
                    </div>
                    <button
                      onClick={() => setShowLocationModal(false)}
                      className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
                
                {/* GPS Content */}
                <div className="flex-1 overflow-y-auto p-6">
                  {loadingGps ? (
                    <div className="flex flex-col items-center justify-center py-12">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mb-4"></div>
                      <p className="text-gray-600">Fetching GPS data...</p>
                    </div>
                  ) : gpsData ? (
                    <div className="space-y-6">
                      {/* Map */}
                      {gpsData.lat && gpsData.lng && (
                        <div className="bg-gray-100 rounded-xl overflow-hidden ui-map-container">
                          <iframe
                            width="100%"
                            height="100%"
                            frameBorder="0"
                            className="ui-iframe-reset"
                            src={`https://www.google.com/maps?q=${gpsData.lat},${gpsData.lng}&output=embed&zoom=15`}
                            allowFullScreen
                          />
                        </div>
                      )}

                      {/* GPS Details */}
                      <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-6 border border-green-200">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                          <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                          </svg>
                          GPS Information
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="bg-white rounded-lg p-4 border border-green-100">
                            <p className="text-xs font-medium text-gray-500 mb-1">Latitude</p>
                            <p className="text-lg font-bold text-gray-900">{gpsData.lat?.toFixed(7) || 'N/A'}</p>
                          </div>
                          <div className="bg-white rounded-lg p-4 border border-green-100">
                            <p className="text-xs font-medium text-gray-500 mb-1">Longitude</p>
                            <p className="text-lg font-bold text-gray-900">{gpsData.lng?.toFixed(7) || 'N/A'}</p>
                          </div>
                          <div className="bg-white rounded-lg p-4 border border-green-100">
                            <p className="text-xs font-medium text-gray-500 mb-1">Altitude</p>
                            <p className="text-lg font-bold text-gray-900">{gpsData.alt ? `${gpsData.alt.toFixed(1)} m` : 'N/A'}</p>
                          </div>
                          <div className="bg-white rounded-lg p-4 border border-green-100">
                            <p className="text-xs font-medium text-gray-500 mb-1">HDOP</p>
                            <p className="text-lg font-bold text-gray-900">{gpsData.hdop?.toFixed(2) || 'N/A'}</p>
                            <p className="text-xs text-gray-500 mt-1">Horizontal Dilution of Precision</p>
                          </div>
                          <div className="bg-white rounded-lg p-4 border border-green-100">
                            <p className="text-xs font-medium text-gray-500 mb-1">Satellites</p>
                            <p className="text-lg font-bold text-gray-900">{gpsData.sats || 'N/A'}</p>
                            <p className="text-xs text-gray-500 mt-1">Satellites in view</p>
                          </div>
                          <div className="bg-white rounded-lg p-4 border border-green-100">
                            <p className="text-xs font-medium text-gray-500 mb-1">Timestamp</p>
                            <p className="text-lg font-bold text-gray-900">{formatTimestamp(gpsData.ts)}</p>
                          </div>
                        </div>

                        {/* Google Maps Link */}
                        {gpsData.lat && gpsData.lng && (
                          <div className="mt-4">
                            <a
                              href={`https://www.google.com/maps?q=${gpsData.lat},${gpsData.lng}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                              </svg>
                              Open in Google Maps
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12">
                      <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mb-4">
                        <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                      </div>
                      <p className="text-lg font-medium text-gray-900 mb-2">No GPS data available</p>
                      <p className="text-sm text-gray-600 text-center max-w-sm">
                        GPS coordinates have not been received from this device yet. The device may need to initialize its GPS module.
                      </p>
                    </div>
                  )}
                </div>
                
                {/* Close Button */}
                <div className="px-6 py-4 border-t border-gray-200">
                  <button
                    onClick={() => setShowLocationModal(false)}
                    className="w-full px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Sidebar Menu */}
        <Sheet open={isMenuOpen} onOpenChange={setIsMenuOpen}>
          <SheetContent side="right" className="w-80 sm:w-96 bg-gradient-to-br from-green-50 via-white to-emerald-50 border-l border-green-200/50 p-0 flex flex-col">
            <SheetHeader className="px-6 pt-6 pb-4 border-b border-green-200/50">
              <SheetTitle className="text-2xl font-bold text-gray-900 ui-heading-mono">
                PadBuddy
              </SheetTitle>
            </SheetHeader>

            <div className="flex-1 flex flex-col min-h-0 px-6 py-4">
              {/* User Profile */}
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-green-200/50">
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
