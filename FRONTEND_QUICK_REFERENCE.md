# Frontend Architecture Quick Reference

## How Data Flows Now

### ✅ Correct Pattern (After Alignment)

```
┌──────────────┐
│   ESP32      │ Writes sensor data to RTDB /devices/{id}/npk
└──────┬───────┘
       │
       ↓
┌──────────────┐
│     RTDB     │ Real-time Database
└──────┬───────┘
       │
       ↓
┌──────────────┐
│ Cloud        │ logSensorData function (RTDB trigger)
│ Functions    │ Automatically logs to Firestore
└──────┬───────┘
       │
       ↓
┌──────────────┐
│  Firestore   │ Permanent storage in /devices/{docId}/logs
└──────┬───────┘
       │
       ↓
┌──────────────┐
│  Frontend    │ Reads logs from Firestore (read-only)
│  (Next.js)   │ Displays in charts and tables
└──────────────┘
```

## Frontend File Guide

### ✅ Files You SHOULD Use

| File | Purpose | When to Use |
|------|---------|-------------|
| `lib/utils/deviceCommands.ts` | Send commands to devices | User clicks "Scan", "Open Valve", etc. |
| `lib/utils/deviceStatus.ts` | Read device status | Display current NPK, GPS, heartbeat |
| `lib/utils/rtdbHelper.ts` | Access RTDB data | Real-time listeners for UI updates |
| `lib/hooks/usePaddyLiveData.ts` | Subscribe to live data | Real-time NPK chart updates |
| `context/AuthContext.tsx` | User authentication | Check if user is logged in |
| `context/NotificationContext.tsx` | Show notifications | Display alerts to user |

### ❌ Files You Should NOT Use (Removed)

| File | Reason Removed | Replaced By |
|------|----------------|-------------|
| `lib/utils/sensorLogging.ts` | Duplicate logging | Cloud Function `sensorLogger.ts` |
| `lib/hooks/useDeviceMonitoring.ts` | Duplicate monitoring | Cloud Function `heartbeatMonitor.ts` |
| `lib/utils/deviceActions.ts` | Old command system | `deviceCommands.ts` + Cloud Function `liveCommands.ts` |

## Common Frontend Tasks

### 1. Send a Command to Device
```tsx
import { sendDeviceCommand } from '@/lib/utils/deviceCommands';

// Send scan command
await sendDeviceCommand(deviceId, 'scan', {});

// Send valve command
await sendDeviceCommand(deviceId, 'valve', { 
  valve: 'A', 
  action: 'open' 
});

// Cloud Function verifies command and handles timeout
```

### 2. Read Current Device Status
```tsx
import { getDeviceData } from '@/lib/utils/deviceStatus';

// Get NPK data
const npk = await getDeviceData(deviceId, 'npk');
// Returns: { n: 45, p: 23, k: 38, timestamp: 1234567890 }

// Get GPS data
const gps = await getDeviceData(deviceId, 'gps');
// Returns: { lat: 14.123, lng: 121.456, timestamp: 1234567890 }

// Get heartbeat
const heartbeat = await getDeviceData(deviceId, 'heartbeat');
// Returns: { timestamp: 1234567890 }
```

### 3. Subscribe to Real-Time Updates
```tsx
import { usePaddyLiveData } from '@/lib/hooks/usePaddyLiveData';

function MyComponent() {
  const { data: liveData, loading, error } = usePaddyLiveData(deviceId);
  
  return (
    <div>
      <p>Nitrogen: {liveData?.nitrogen}</p>
      <p>Phosphorus: {liveData?.phosphorus}</p>
      <p>Potassium: {liveData?.potassium}</p>
    </div>
  );
}
```

### 4. Read Historical Logs
```tsx
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// Get logs from Firestore (Cloud Functions wrote these)
const logsRef = collection(db, `devices/${deviceDocId}/logs`);
const logsQuery = query(logsRef, orderBy('timestamp', 'desc'), limit(100));
const snapshot = await getDocs(logsQuery);

const logs = snapshot.docs.map(doc => ({
  id: doc.id,
  ...doc.data()
}));
```

## What Cloud Functions Handle Automatically

### ✅ Sensor Logging
**Cloud Function:** `functions/src/sensorLogger.ts`  
**Trigger:** RTDB write to `/devices/{deviceId}/npk`  
**What it does:**
- Validates data freshness (< 1 hour old)
- Deduplicates logs (same values within 5 minutes)
- Writes to Firestore `/devices/{deviceDocId}/logs/{logId}`
- No frontend action needed!

### ✅ Device Monitoring
**Cloud Function:** `functions/src/heartbeatMonitor.ts`  
**Trigger:** 
- RTDB write to `/devices/{deviceId}/heartbeat`
- Cloud Scheduler (every 5 minutes)

**What it does:**
- Marks device offline if no heartbeat for 5+ minutes
- Creates notification in Firestore
- No frontend polling needed!

### ✅ Command Verification
**Cloud Function:** `functions/src/liveCommands.ts`  
**Trigger:** Firestore write to `/commands/{nodeId}`  
**What it does:**
- Verifies command exists in RTDB
- Times out commands after 3 minutes
- Updates command status
- No frontend timeout logic needed!

### ✅ Notifications
**Cloud Function:** `functions/src/notificationDispatcher.ts`  
**Trigger:** Firestore write to `/users/{userId}/notifications`  
**What it does:**
- Sends push notification to user's devices
- Uses FCM (Firebase Cloud Messaging)
- Frontend just displays received notifications!

## Architecture Principles

### 1. Frontend = UI + Read Data
```tsx
// ✅ CORRECT: Read and display
const data = await getDeviceData(deviceId, 'npk');
setNpkData(data);

// ❌ WRONG: Don't write logs manually
await addDoc(logsRef, { n: data.n, p: data.p, k: data.k }); // NO!
```

### 2. Cloud Functions = Business Logic + Write Data
```tsx
// ✅ Cloud Function handles logging (automatic)
export const logSensorData = onValueWritten(
  "/devices/{deviceId}/npk",
  async (event) => {
    // Validate, deduplicate, then write to Firestore
  }
);
```

### 3. Commands Flow: Frontend → RTDB → ESP32
```tsx
// ✅ Frontend sends command
await sendDeviceCommand(deviceId, 'scan', {});

// ESP32 reads from RTDB and executes
// Cloud Function verifies and times out if needed
```

### 4. Sensor Data Flow: ESP32 → RTDB → Cloud Function → Firestore
```tsx
// ESP32 writes to RTDB /devices/{id}/npk
// Cloud Function automatically triggered
// Firestore updated with validated log
// Frontend reads from Firestore (already processed!)
```

## Common Mistakes to Avoid

### ❌ DON'T: Manually Log Sensor Data
```tsx
// WRONG - duplicates Cloud Function work
const { logSensorReadings } = await import('@/lib/utils/sensorLogging');
await logSensorReadings(userId, fieldId, paddyId, npk);
```

**✅ DO:** Let Cloud Functions handle it automatically
```tsx
// Just trigger a scan, Cloud Function logs automatically
await sendDeviceCommand(deviceId, 'scan', {});
```

### ❌ DON'T: Monitor Devices in Frontend
```tsx
// WRONG - duplicates Cloud Function work
useEffect(() => {
  const interval = setInterval(() => {
    checkIfDeviceIsOffline(deviceId);
  }, 60000);
}, []);
```

**✅ DO:** Let Cloud Functions monitor automatically
```tsx
// Just read the status that Cloud Function updates
const status = await getDeviceData(deviceId, 'heartbeat');
const isOnline = status && (Date.now() - status.timestamp) < 300000;
```

### ❌ DON'T: Use Old Action System
```tsx
// WRONG - old system removed
await executeDeviceAction(deviceId, 'scan', 15000);
```

**✅ DO:** Use New Command System
```tsx
// New system with Cloud Function verification
await sendDeviceCommand(deviceId, 'scan', {});
```

## Next Steps

1. **Test the Frontend** - All commands should work with Cloud Functions
2. **Fix ESP32 Firmware** - See `ESP32_ALIGNMENT_REPORT.md` for required changes
3. **Monitor Cloud Functions** - Check Firebase console for function logs
4. **Verify Data Flow** - Ensure ESP32 → RTDB → Cloud Function → Firestore works

## Questions?

- **"How do I log sensor data?"** - You don't! ESP32 writes to RTDB, Cloud Function logs automatically
- **"How do I check if device is offline?"** - Read heartbeat from RTDB, Cloud Function updates status
- **"How do I send a command?"** - Use `sendDeviceCommand()`, Cloud Function verifies it
- **"Can I write directly to Firestore?"** - Only for user preferences, never for device data

---

**Remember:** Frontend is for UI and reading data. Cloud Functions handle all business logic!
