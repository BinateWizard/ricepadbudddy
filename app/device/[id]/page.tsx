
'use client';
import DeviceSchedules from "./components/DeviceSchedules";

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
import { GetLocationModal } from '@/components/GetLocationModal';

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

// Import logging functions
import { logUserAction } from '@/lib/utils/userActions';
import { logDeviceAction } from '@/lib/utils/deviceLogs';


// ...all state, hooks, and logic should be above the return...

export default function Page() {
  // ...existing code...

  useEffect(() => {
    if (!deviceId || !user) return;
    const unsubscribes: Array<() => void> = [];
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
          // Clear processing state when we receive confirmation from RTDB
          setRelayProcessing(prev => {
            const newProcessing = [...prev];
            newProcessing[i - 1] = false;
            return newProcessing;
          });
        }
      });
      unsubscribes.push(unsubscribe);
    }
    return () => unsubscribes.forEach(unsub => unsub());
  }, [deviceId, user]);

  // Fallback: derive relay states from latest commands if /relays is missing
  // This keeps the UI in sync even before verifyLiveCommand populates relays
  // Also clears processing state on command completion/error
  useEffect(() => {
    if (!deviceId || !user) return;

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

      // Clear processing state when command is completed or errored
      setRelayProcessing((prev) => {
        const next = [...prev];
        for (let i = 1; i <= 4; i++) {
          const cmd = commands[`relay${i}`];
          if (!cmd) continue;
          
          const status = cmd.status?.toLowerCase();
          if (status === 'completed' || status === 'executed' || status === 'error' || status === 'failed') {
            next[i - 1] = false;
          }
        }
        return next;
      });
    });

    return () => unsubscribe();
  }, [deviceId, user]);

  // Listen to ESP32B (motor/GPS) command status from RTDB
  useEffect(() => {
    if (!deviceId || !user) return;

    const commandsRef = ref(database, `devices/${deviceId}/commands/ESP32B`);
    const unsubscribe = onValue(commandsRef, (snapshot) => {
      const commands = snapshot.val();
      if (!commands) return;

      // Check motor command status
      const motorCmd = commands.motor;
      if (motorCmd) {
        const status = motorCmd.status?.toLowerCase();
        if (status === 'completed' || status === 'executed') {
          // Motor command completed - update state based on actualState
          const actualState = motorCmd.actualState?.toLowerCase();
          if (actualState === 'motor_down') {
            setMotorExtended(true);
          } else if (actualState === 'motor_up') {
            setMotorExtended(false);
          }
          setMotorProcessing(false);
        } else if (status === 'error' || status === 'failed') {
          // Motor command failed - just clear processing
          setMotorProcessing(false);
        }
      }

      // Check GPS command status (just clear processing on complete/error)
      const gpsCmd = commands.gps;
      if (gpsCmd) {
        const status = gpsCmd.status?.toLowerCase();
        if (status === 'completed' || status === 'executed' || status === 'error' || status === 'failed') {
          // GPS done - any UI updates happen via the GetLocationModal
        }
      }
    });

    return () => unsubscribe();
  }, [deviceId, user]);

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
    if (!deviceId || !user) return;

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

  // Handle location view - now using GetLocationModal
  const handleViewLocation = async () => {
    if (!user || gpsProcessing) return;

    setGpsProcessing(true);
    
    try {
      // Send GPS read command to ESP32B FIRST
      const { sendDeviceCommand } = await import('@/lib/utils/deviceCommands');
      const { logUserAction } = await import('@/lib/utils/userActions');
      
      console.log('[GPS] Sending command to ESP32B...');
      
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
        
        // NOW open the modal after command is confirmed sent
        setShowGetLocationModal(true);
        
        // Log successful action
        await logUserAction({
          deviceId,
          action: 'GPS Read',
          details: {
            result: 'success',
            source: 'device_page'
          }
        });
      } else {
        console.error('[GPS] Command failed:', result.message);
        alert('Failed to send GPS command: ' + result.message);
        setGpsProcessing(false);
      }
    } catch (error) {
      console.error('[GPS] Error sending GPS read command:', error);
      alert('Failed to send GPS command. Please try again.');
      setGpsProcessing(false);
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
      
      console.log(`[Relay ${relayNum}] Sending command: ${newState ? 'ON' : 'OFF'}`);
      
      const result = await sendDeviceCommand(
        deviceId,
        'ESP32A', // Relay controller node
        'relay',
        newState ? 'on' : 'off',
        { relay: relayNum },
        user.uid
      );
      
      console.log(`[Relay ${relayNum}] Command result:`, result);
      
      // Command sent successfully (pending execution by ESP32)
      if (result.success) {
        // DO NOT update state optimistically - let RTDB listener handle it
        // when ESP32 confirms and Cloud Function writes to /relays/{n}
        // The UI will update automatically via the onValue listener
        
        // Show success feedback
        console.log(`✓ Relay ${relayNum} command sent - waiting for ESP32 confirmation`);
        
        // Log to both user actions (for Control Panel History) and device actions (for Field logs)
        // Logging is optional - don't block on failure
        Promise.all([
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
          }).catch(err => console.warn('Failed to log user action:', err)),
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
          }).catch(err => console.warn('Failed to log device action:', err))
        ]).catch(() => {
          // Silently ignore logging errors
        });
      } else {
        // Command failed to send
        console.error('Failed to send relay command:', result.message);
        alert(`Failed to send Relay ${relayNum} command: ${result.message}`);
        
        // Log error (optional - don't await)
        Promise.all([
          logUserAction({
            deviceId,
            fieldId: fieldInfo?.id,
            action: `Relay ${relayNum} ${newState ? 'ON' : 'OFF'}`,
            details: {
              relayNumber: relayNum,
              state: newState ? 'ON' : 'OFF',
              result: 'failed',
              message: result.message,
              source: 'device_page'
            }
          }).catch(() => {}),
          logDeviceAction({
            deviceId,
            userId: user.uid,
            fieldId: fieldInfo?.id || '',
            nodeId: 'ESP32A',
            action: `Relay ${relayNum} ${newState ? 'ON' : 'OFF'}`,
            actionType: 'relay',
            params: { relay: relayNum, state: newState ? 'ON' : 'OFF' },
            result: 'failed',
            details: { source: 'device_page', message: result.message }
          }).catch(() => {})
        ]).catch(() => {});
      }
    } catch (error) {
      console.error('Error toggling relay:', error);
      alert(`Failed to toggle Relay ${relayNum}. ${error instanceof Error ? error.message : 'Please try again.'}`);
      
      // Log error to both locations (optional - don't await)
      Promise.all([
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
        }).catch(() => {}),
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
        }).catch(() => {})
      ]).catch(() => {});
      
      // On error, immediately clear processing state
      setRelayProcessing(prev => {
        const newProcessing = [...prev];
        newProcessing[relayIndex] = false;
        return newProcessing;
      });
    }
    // Note: On success, processing state is cleared by the RTDB listener
    // when ESP32 confirms and Cloud Function writes to /relays/{n}
    // Add a timeout fallback in case ESP32 never responds
    setTimeout(() => {
      setRelayProcessing(prev => {
        if (prev[relayIndex]) {
          console.log(`[Relay ${relayNum}] Timeout - clearing loading state`);
          const newProcessing = [...prev];
          newProcessing[relayIndex] = false;
          return newProcessing;
        }
        return prev;
      });
    }, 30000); // 30 second timeout
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
      const { logDeviceAction } = await import('@/lib/utils/deviceLogs');
      
      const result = await sendDeviceCommand(
        deviceId,
        'ESP32B',
        'motor',
        motorAction,
        {},
        user.uid
      );

      // Command sent successfully - now wait for ESP32 to confirm via RTDB
      // Don't update state optimistically - let RTDB listener handle it
      if (result.success) {
        console.log(`[Motor] Command ${motorAction} sent - waiting for ESP32 confirmation`);
        
        // Log action (don't block on this)
        Promise.all([
          logUserAction({
            deviceId,
            fieldId: fieldInfo?.id,
            action: `Motor ${motorAction}`,
            details: {
              motorAction,
              result: 'sent',
              source: 'device_page'
            }
          }).catch(() => {}),
          logDeviceAction({
            deviceId,
            userId: user.uid,
            fieldId: fieldInfo?.id || '',
            nodeId: 'ESP32B',
            action: `Motor ${motorAction}`,
            actionType: 'motor',
            params: { action: motorAction },
            result: 'pending',
            details: { source: 'device_page' }
          }).catch(() => {})
        ]).catch(() => {});
        
        // Keep processing state true - RTDB listener or timeout will clear it
        // Set a timeout to clear processing state if ESP32 doesn't respond
        setTimeout(() => {
          setMotorProcessing(prev => {
            if (prev) {
              console.log(`[Motor] Timeout - clearing processing state`);
              return false;
            }
            return prev;
          });
        }, 35000); // 35 second timeout (motor runs 5s + buffer)
        
        return; // Don't set motorProcessing to false yet
      } else {
        // Command failed to send
        console.error('Failed to send motor command:', result.message);
        alert(`Failed to send motor command: ${result.message}`);
        setMotorProcessing(false);
      }
    } catch (error) {
      console.error('Error toggling motor:', error);
      alert(`Failed to ${motorAction} motor. ${error instanceof Error ? error.message : 'Please try again.'}`);
      setMotorProcessing(false);
    }
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        {/* ...existing JSX... */}
      </div>
    </ProtectedRoute>
  );
}
