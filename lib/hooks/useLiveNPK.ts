import { useEffect, useState } from 'react';
import { ref, onValue } from 'firebase/database';
import { database } from '@/lib/firebase';
import { onDeviceValue } from '@/lib/utils/rtdbHelper';

export interface LiveNPKData {
  n?: number;
  p?: number;
  k?: number;
  timestamp?: number;
  status?: string;
}

export interface LiveNPKState {
  data: LiveNPKData | null;
  online: boolean;
  loading: boolean;
  error: string | null;
}

const ONLINE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Live subscription to device NPK data from RTDB
 * Determines online status based on timestamp age
 */
export function useLiveNPK(deviceId: string | null): LiveNPKState {
  const [state, setState] = useState<LiveNPKState>({
    data: null,
    online: false,
    loading: true,
    error: null
  });

  useEffect(() => {
    if (!deviceId) {
      console.log('[useLiveNPK] No deviceId provided');
      setState({ data: null, online: false, loading: false, error: 'No device ID' });
      return;
    }

    console.log('[useLiveNPK] Subscribing to device:', deviceId);
    
    // Subscribe to entire device node to check status and connectedAt (with fallback to new RTDB structure)
    const unsubscribe = onDeviceValue(
      deviceId,
      '',
      (deviceData) => {
        console.log('[useLiveNPK] Received device data:', deviceData ? 'exists' : 'null');
        
        if (!deviceData) {
          console.log('[useLiveNPK] Device not found in RTDB');
          setState({ data: null, online: false, loading: false, error: null });
          return;
        }
        
        console.log('[useLiveNPK] Device data:', deviceData);
        
        const rawNpk = deviceData.npk || {};
        console.log('[useLiveNPK] Raw NPK:', rawNpk);
        
        // Normalize the NPK data structure
        const npkData: LiveNPKData = {
          n: rawNpk.n ?? rawNpk.nitrogen ?? undefined,
          p: rawNpk.p ?? rawNpk.phosphorus ?? undefined,
          k: rawNpk.k ?? rawNpk.potassium ?? undefined,
          timestamp: rawNpk.timestamp ?? rawNpk.lastUpdate ?? undefined,
          status: deviceData.status ?? 'unknown',
        };
        
        console.log('[useLiveNPK] Normalized NPK:', npkData);

        // Determine online status with multiple strategies:
        let isOnline = false;
        
        // Strategy 1: Check device-level status field
        if (deviceData.status === 'connected') {
          isOnline = true;
        }
        
        // Strategy 2: Check connectedAt timestamp
        if (!isOnline && deviceData.connectedAt) {
          try {
            const connectedTime = new Date(deviceData.connectedAt).getTime();
            const now = Date.now();
            const age = now - connectedTime;
            isOnline = age < ONLINE_THRESHOLD_MS;
          } catch (e) {
            // Invalid connectedAt format
          }
        }
        
        // Strategy 3: If NPK data exists and timestamp is small (relative counter), 
        // treat device as online since it's actively sending data
        if (!isOnline && npkData.timestamp !== undefined && npkData.timestamp < 10000) {
          // Small timestamp = relative counter from ESP32, data is fresh
          isOnline = true;
        }
        
        // Strategy 4: Check NPK timestamp if it's a proper Unix timestamp
        if (!isOnline && npkData.timestamp && npkData.timestamp > 1e9) {
          const now = Date.now();
          const timestamp = npkData.timestamp < 1e11 
            ? npkData.timestamp * 1000 
            : npkData.timestamp;
          const age = now - timestamp;
          isOnline = age < ONLINE_THRESHOLD_MS;
        }

        console.log('[useLiveNPK] Final state - online:', isOnline, 'data:', npkData);

        setState({
          data: npkData,
          online: isOnline,
          loading: false,
          error: null,
        });
      },
      (error) => {
        console.error('[useLiveNPK] Error:', error);
        setState({
          data: null,
          online: false,
          loading: false,
          error: error.message,
        });
      }
    );

    return () => {
      console.log('[useLiveNPK] Unsubscribing from device:', deviceId);
      unsubscribe();
    };
  }, [deviceId]);

  return state;
}
