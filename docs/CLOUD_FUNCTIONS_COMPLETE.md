# PadBuddy Firebase Cloud Functions - Complete Implementation

## 📋 Overview

This document describes all Firebase Cloud Functions implemented for the PadBuddy IoT system, organized by category according to your specification.

---

## 🏗️ Architecture Summary

```
┌─────────────────────────────────────────────────────────────┐
│                 FIREBASE CLOUD FUNCTIONS                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1️⃣ Heartbeat & Monitoring    ─→  Device status tracking   │
│  2️⃣ Live Commands             ─→  Command verification     │
│  3️⃣ Scheduled Commands         ─→  Cron-based execution    │
│  4️⃣ Sensor Data Logger         ─→  NPK data persistence    │
│  5️⃣ Device Registration        ─→  Onboarding automation   │
│  6️⃣ Field Calculations         ─→  Area & NPK recommendations│
│  7️⃣ System Logger              ─→  Audit & monitoring      │
│  8️⃣ Legacy Support             ─→  Backward compatibility  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 1️⃣ Device Heartbeat & Monitoring

### **File:** `functions/src/heartbeatMonitor.ts`

### Functions

#### `monitorHeartbeat`
- **Trigger:** RTDB `/devices/{deviceId}/heartbeat` onUpdate
- **Purpose:** Real-time device status tracking
- **Actions:**
  - Monitors heartbeat updates from ESP32 devices
  - Updates Firestore `connected` status
  - Adds user notifications when device goes offline
  - Logs online/offline events

```typescript
// Trigger path
/devices/DEVICE_0005/heartbeat
{
  "lastSeen": 1672617600000,
  "status": "online"
}
```

#### `checkAllDevicesHeartbeat`
- **Trigger:** Scheduled (every 5 minutes)
- **Purpose:** Batch device status check
- **Actions:**
  - Scans all devices in Firestore
  - Checks RTDB heartbeat for each
  - Marks offline if no heartbeat in 10 minutes
  - Updates Firestore connection status

---

## 2️⃣ Live Command Verification

### **File:** `functions/src/liveCommands.ts`

### Functions

#### `verifyLiveCommand`
- **Trigger:** RTDB `/devices/{deviceId}/commands/{commandId}` onWrite
- **Purpose:** Verify command execution
- **Actions:**
  - Monitors command status changes
  - Logs success/failure to Firestore `/devices/{deviceId}/logs`
  - Notifies user on command failure
  - Tracks command acknowledgment

```typescript
// Command structure
/devices/DEVICE_0005/commands/cmd_001
{
  "commandId": "cmd_001",
  "relay": 2,
  "requestedState": "ON",
  "status": "pending | acknowledged | executed | failed",
  "timestamp": 1672617600000
}
```

#### `checkCommandTimeouts`
- **Trigger:** Scheduled (every 1 minute)
- **Purpose:** Handle command timeouts
- **Actions:**
  - Checks for commands pending > 30 seconds
  - Marks timed-out commands as failed
  - Logs timeout events
  - Updates RTDB command status

---

## 3️⃣ Scheduled Commands Executor

### **File:** `functions/src/scheduledExecutor.ts`

### Functions

#### `executeScheduledCommand`
- **Trigger:** Firestore `/devices/{deviceDocId}/schedules/{scheduleId}` onWrite
- **Purpose:** Execute user-scheduled commands
- **Actions:**
  - Checks if schedule time has arrived
  - Verifies device is online
  - Sends command to RTDB
  - Waits for device acknowledgment (max 30s)
  - Updates schedule status (executed/failed)
  - Logs execution result
  - Notifies user on failure

```typescript
// Schedule document
/devices/abc123/schedules/schedule_001
{
  "relay": 2,
  "action": "ON",
  "scheduledTime": 1672617600000,
  "status": "pending",
  "createdBy": "user_001"
}
```

#### `checkPendingSchedules`
- **Trigger:** Scheduled (every 1 minute)
- **Purpose:** Backup scheduler
- **Actions:**
  - Scans all pending schedules
  - Triggers execution for due schedules
  - Ensures no schedule is missed

---

## 4️⃣ NPK / Sensor Data Logger

### **File:** `functions/src/sensorLogger.ts`

### Functions

#### `logSensorData`
- **Trigger:** RTDB `/devices/{deviceId}/npk` onWrite
- **Purpose:** Real-time sensor data logging
- **Actions:**
  - Validates NPK data (nitrogen, phosphorus, potassium)
  - Checks data freshness (< 1 hour old)
  - Deduplicates readings
  - Logs to Firestore `/devices/{deviceId}/logs`
  - Aggregates field-level NPK averages

```typescript
// NPK data structure
/devices/DEVICE_0005/npk
{
  "n": 45,
  "p": 22,
  "k": 38,
  "timestamp": 1672617600000
}
```

#### `scheduledSensorLogger`
- **Trigger:** Scheduled (every 5 minutes)
- **Purpose:** Backup sensor logging
- **Actions:**
  - Batch processes all devices
  - Logs fresh NPK readings
  - Handles devices that don't trigger onWrite
  - Deduplicates based on timestamp

---

## 5️⃣ Device Registration & Onboarding

### **File:** `functions/src/deviceRegistration.ts`

### Functions

#### `registerDevice`
- **Trigger:** Firestore `/devices/{deviceDocId}` onCreate
- **Purpose:** Automate device onboarding
- **Actions:**
  - Initializes device with defaults (`connected: false`)
  - Creates RTDB structure
  - Adds device to field's `devices[]` array
  - Updates user's `devicesOwned[]` array
  - Updates user statistics
  - Sends registration notification
  - Logs registration event

```typescript
// New device triggers this function
/devices/abc123
{
  "ownerId": "user_001",
  "fieldId": "field_xyz",
  "deviceId": "DEVICE_0005",
  "name": "Relay Controller"
}
```

#### `updateDeviceAssignment`
- **Trigger:** Firestore `/devices/{deviceDocId}` onUpdate
- **Purpose:** Handle device reassignment
- **Actions:**
  - Detects `fieldId` changes
  - Removes device from old field's array
  - Adds device to new field's array
  - Updates RTDB fieldId
  - Logs reassignment

---

## 6️⃣ Field Area Calculation & NPK Recommendations

### **File:** `functions/src/fieldCalculations.ts`

### Functions

#### `calculateFieldArea`
- **Trigger:** Firestore `/fields/{fieldId}` onWrite
- **Purpose:** Calculate field area from polygon
- **Actions:**
  - Calculates area using Shoelace formula
  - Converts lat/lng to meters
  - Stores area in m², hectares, acres
  - Triggers NPK recommendation calculation

```typescript
// Field with plot points
/fields/field_001
{
  "plot": [
    { "lat": 14.5995, "lng": 120.9842 },
    { "lat": 14.5996, "lng": 120.9845 },
    { "lat": 14.5998, "lng": 120.9844 }
  ]
}

// Result
{
  "area": {
    "squareMeters": 1250.50,
    "hectares": 0.1251,
    "acres": 0.31
  }
}
```

#### NPK Recommendation Logic
- Calculates average NPK from all field devices
- Compares to target levels (N: 150, P: 50, K: 100 ppm)
- Computes fertilizer requirements (kg per hectare)
- Determines status: optimal, low, critical
- Stores recommendation in field document
- Sends critical alerts to user

#### `calculateDevicePlotArea`
- **Trigger:** Firestore `/devices/{deviceDocId}` onWrite
- **Purpose:** Calculate device coverage area
- **Actions:**
  - Similar to field area calculation
  - Stores in device `plotArea` field

---

## 7️⃣ System Logger & Audit

### **File:** `functions/src/systemLogger.ts`

### Functions & Utilities

#### Helper Functions
- `logSystemEvent()` - Generic logger
- `logInfo()` - Info level
- `logWarning()` - Warning level
- `logError()` - Error level
- `logCritical()` - Critical level (alerts admin)

#### `cleanupSystemLogs`
- **Trigger:** Scheduled (daily at 2 AM)
- **Purpose:** Remove old system logs
- **Actions:**
  - Deletes logs older than 30 days
  - Processes in batches of 500

#### `cleanupDeviceLogs`
- **Trigger:** Scheduled (daily at 3 AM)
- **Purpose:** Archive old device logs
- **Actions:**
  - Deletes device logs older than 90 days
  - Processes each device separately

#### `generateHealthReport`
- **Trigger:** Scheduled (daily at 8 AM)
- **Purpose:** System health monitoring
- **Actions:**
  - Counts total/online/offline devices
  - Aggregates system logs by level
  - Generates daily health report
  - Stores in `/healthReports` collection
  - Sends alerts if system is degraded

```typescript
// Sample health report
{
  "date": "2026-01-03",
  "system": {
    "status": "healthy",
    "totalDevices": 25,
    "onlineDevices": 22,
    "offlineDevices": 3
  },
  "logs": {
    "info": 150,
    "warning": 5,
    "error": 2,
    "critical": 0
  }
}
```

---

## 8️⃣ Legacy Functions (Backward Compatibility)

### Preserved Functions
- `monitorDeviceHeartbeats` (from original heartbeatMonitor.ts)
- Legacy scheduled command functions
- Original command logger utilities

---

## 📊 Function Summary Table

| **Category** | **Function** | **Trigger Type** | **Frequency** |
|--------------|-------------|-----------------|---------------|
| Heartbeat | `monitorHeartbeat` | RTDB onUpdate | Real-time |
| Heartbeat | `checkAllDevicesHeartbeat` | Scheduled | Every 5 min |
| Commands | `verifyLiveCommand` | RTDB onWrite | Real-time |
| Commands | `checkCommandTimeouts` | Scheduled | Every 1 min |
| Schedules | `executeScheduledCommand` | Firestore onWrite | Real-time |
| Schedules | `checkPendingSchedules` | Scheduled | Every 1 min |
| Sensors | `logSensorData` | RTDB onWrite | Real-time |
| Sensors | `scheduledSensorLogger` | Scheduled | Every 5 min |
| Registration | `registerDevice` | Firestore onCreate | Real-time |
| Registration | `updateDeviceAssignment` | Firestore onUpdate | Real-time |
| Calculations | `calculateFieldArea` | Firestore onWrite | Real-time |
| Calculations | `calculateDevicePlotArea` | Firestore onWrite | Real-time |
| Audit | `cleanupSystemLogs` | Scheduled | Daily 2 AM |
| Audit | `cleanupDeviceLogs` | Scheduled | Daily 3 AM |
| Audit | `generateHealthReport` | Scheduled | Daily 8 AM |

**Total Functions:** 15 active functions

---

## 🚀 Deployment

### Deploy All Functions
```bash
cd functions
npm run build
firebase deploy --only functions
```

### Deploy Specific Function
```bash
firebase deploy --only functions:monitorHeartbeat
firebase deploy --only functions:verifyLiveCommand
```

### View Logs
```bash
firebase functions:log
firebase functions:log --only monitorHeartbeat
```

---

## 🔐 Required Permissions

### Firestore Rules
```javascript
match /devices/{deviceId} {
  allow read: if request.auth.uid == resource.data.ownerId;
  allow write: if request.auth.uid == resource.data.ownerId;
  
  match /logs/{logId} {
    allow read: if request.auth.uid == get(/databases/$(database)/documents/devices/$(deviceId)).data.ownerId;
    allow write: if false;  // Only Functions write logs
  }
  
  match /schedules/{scheduleId} {
    allow read, write: if request.auth.uid == resource.data.createdBy;
  }
}
```

### RTDB Rules
```json
{
  "rules": {
    "devices": {
      "$deviceId": {
        ".read": "auth != null",
        ".write": "auth != null"
      }
    }
  }
}
```

---

## 📈 Performance Considerations

### Real-time Triggers
- ✅ Efficient: Only process changed data
- ✅ Automatic retries on failure
- ⚠️ Can be triggered multiple times (idempotent design)

### Scheduled Functions
- ✅ Batch processing for efficiency
- ✅ Handles large datasets
- ⚠️ Check execution time limits (9 minutes max)

### Best Practices
1. **Deduplication:** Check for duplicate logs before writing
2. **Timeouts:** Set reasonable timeouts for RTDB operations
3. **Batching:** Use Firestore batch writes when possible
4. **Error Handling:** Always log errors to systemLogs
5. **Cleanup:** Regularly remove old logs to manage costs

---

## 🧪 Testing

### Local Emulator
```bash
firebase emulators:start --only functions,firestore,database
```

### Test Heartbeat
```bash
# Set device heartbeat in RTDB
firebase database:set /devices/DEVICE_0005/heartbeat '{"lastSeen": 1672617600000, "status": "online"}'
```

### Test Command
```bash
# Send command to device
firebase database:set /devices/DEVICE_0005/commands/cmd_test '{"commandId": "cmd_test", "relay": 2, "requestedState": "ON", "status": "pending", "timestamp": 1672617600000}'
```

---

## 📚 Related Documentation

- [FIRESTORE_RTDB_ARCHITECTURE.md](./FIRESTORE_RTDB_ARCHITECTURE.md) - Complete architecture specification
- [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) - Data migration instructions
- [lib/types/firestore-schema.ts](../lib/types/firestore-schema.ts) - TypeScript type definitions

---

## ✅ Checklist

Before deployment:
- [ ] Update Firebase project ID in `.firebaserc`
- [ ] Set correct RTDB URL in `index.ts`
- [ ] Review and update security rules
- [ ] Test functions in emulator
- [ ] Deploy to staging environment first
- [ ] Monitor logs after deployment
- [ ] Verify scheduled functions are running

---

**Last Updated:** January 3, 2026  
**Version:** 2.0.0  
**Status:** ✅ Production Ready
