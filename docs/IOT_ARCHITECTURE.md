# Final Layered IoT Architecture for PadBuddy

## 🎯 Overview

This document describes the **comprehensive, production-ready IoT architecture** for PadBuddy, implementing:
- ✅ Live WebSocket/RTDB control (foreground only)
- ✅ Heartbeat monitoring (background, always-on)
- ✅ Scheduled commands via Firebase Functions
- ✅ Reliable logging and notifications
- ✅ Proper offline detection

---

## 📐 Architecture Layers

### **Layer 1 – Live Control (Foreground Only)**

```
Client (Web App) ⇄ RTDB (WebSocket Streaming) ⇄ ESP32
```

**Purpose:** Immediate, real-time control while user has app open.

**Communication Method:** Firebase RTDB's built-in WebSocket streaming (no custom WebSocket server needed)

**How it works:**
1. Client writes command to RTDB node
2. RTDB's WebSocket notifies ESP32 instantly (different networks, works globally)
3. ESP32 executes command
4. ESP32 writes ACK/state back to RTDB
5. Client listens to RTDB changes in real-time
6. UI updates automatically

**Responsibilities:**
- Send live relay control commands
- Display immediate feedback (waiting state)
- Show success/failure based on ESP32 ACK
- Handle command timeouts

**Key Principle:**
> Client is *temporary source of truth for commands*, but **NOT** for liveness detection.
> 
> **No direct Client ↔ ESP32 connection needed** - RTDB WebSocket streaming handles everything across different networks.

**Implementation:**
- File: `lib/utils/deviceCommands.ts`
- Function: `sendDeviceCommand()`
- **Communication:** Client writes to RTDB node → RTDB WebSocket streams to ESP32 (works across different networks globally)
- RTDB Path: `devices/{deviceId}/commands/{nodeId}`
- Client uses `onValue()` listener to detect ESP32 response in real-time
- Waits up to 30 seconds for ESP32 ACK via RTDB streaming
- Shows "Waiting..." state in UI
- Logs all commands to Firestore `commandLogs` collection

**Why RTDB Streaming (not direct WebSocket)?**
- Client and ESP32 are on **different networks** (home WiFi, mobile data, etc.)
- Firebase RTDB provides global WebSocket infrastructure
- No need for custom WebSocket server or NAT traversal
- Automatic reconnection and message queueing
- Works anywhere with internet connection

**UI Behavior:**
```
User clicks "Turn ON Relay 1"
  ↓
Button shows: [🔄 Waiting...]
  ↓
ESP32 responds → Success: [✓ Turn OFF] or Timeout: [⏱️ Timeout]
```

---

### **Layer 2 – Heartbeat Monitoring (Background / Always-On)**

```
ESP32 → Heartbeat → RTDB
       ↓
Firebase Function → monitors heartbeat → notifications
```

**Purpose:** Detect device offline status reliably, 24/7.

**Responsibilities:**
- ESP32 sends heartbeat every 10-60 seconds to RTDB
- Function checks: `now - lastSeen > 5 minutes` → offline
- Function triggers push/email notifications
- Updates device status in RTDB
- Logs errors to Firestore

**Key Principle:**
> **Functions handle official "device offline" detection, NOT the client.**
> Client only shows "waiting" or "timeout" for individual commands.

**Implementation:**
- File: `functions/src/heartbeatMonitor.ts`
- Function: `monitorDeviceHeartbeats` (runs every 2 minutes)
- Triggers: `onDeviceHeartbeat`, `onLegacyDeviceHeartbeat`
- RTDB Path: `devices/{deviceId}/status/heartbeat` or `owners/{ownerId}/fields/{fieldId}/devices/{deviceId}/status/heartbeat`

**Heartbeat Logic:**
```typescript
const HEARTBEAT_TIMEOUT = 5 * 60 * 1000; // 5 minutes
const timeSinceHeartbeat = now - lastHeartbeat;

if (timeSinceHeartbeat > HEARTBEAT_TIMEOUT) {
  // Device is offline
  await sendOfflineNotification(deviceId, ownerId);
  await logToFirestore({ type: 'device_offline' });
}
```

---

### **Layer 3 – Scheduled Commands**

```
Client → Firestore (schedule definition)
       ↓
Firebase Function → triggers at scheduled time
       ↓
Function → sends command to ESP32 via RTDB
       ↓
ESP32 → executes → sends ACK
       ↓
Function → verifies success/failure → logs → notifies
```

**Purpose:** Execute commands even when client app is closed.

**Responsibilities:**
- Client creates/edits schedules (one-time, daily, weekly, monthly)
- Function triggers at scheduled time
- Function checks device online status first
- Function sends command to RTDB
- Function waits for ESP32 ACK
- Function logs execution result
- Function sends notification if failed/offline

**Key Principle:**
> Client is **only the scheduler UI**. Functions execute, verify, and notify.

**Implementation:**
- File: `functions/src/scheduledCommands.ts`
- Function: `executeScheduledCommands` (runs every minute)
- Firestore Collection: `scheduledCommands` (collectionGroup query)
- Firestore Collection: `commandExecutions` (execution logs)

**Schedule Types:**
- **once**: Execute at specific datetime, then disable
- **daily**: Execute every day at specified time
- **weekly**: Execute on specific day of week
- **monthly**: Execute on specific day of month

**Example Schedule Document:**
```typescript
{
  id: "sched_123",
  deviceId: "DEVICE_0001",
  ownerId: "user_abc",
  fieldId: "field_xyz",
  type: "relay",
  action: "on",
  params: { relay: 1 },
  schedule: {
    type: "daily",
    time: "06:00", // 6:00 AM
    timezone: "Asia/Manila"
  },
  enabled: true,
  nextExecution: 1704153600000,
  createdBy: "user_abc"
}
```

---

### **Layer 4 – Logs / Audit Trail**

```
All layers → Firestore Collections:
  - commandLogs
  - errors
  - system_logs
  - commandExecutions
```

**Purpose:** Centralized audit trail for all commands and errors.

**Responsibilities:**
- Log all commands (live or scheduled)
- Include status: `pending` → `sent` → `acknowledged` → `completed` / `failed` / `timeout`
- Track timestamps: `requestedAt`, `sentAt`, `acknowledgedAt`, `completedAt`
- Log errors with severity levels
- Provide statistics and analytics

**Implementation:**
- File: `functions/src/commandLogger.ts`
- Functions: `logCommand()`, `updateCommandLog()`, `logDeviceError()`

**Command Log Schema:**
```typescript
{
  deviceId: "DEVICE_0001",
  commandType: "relay",
  action: "on",
  source: "live" | "scheduled" | "system",
  status: "completed",
  requestedBy: "user_abc",
  requestedAt: 1704153600000,
  sentAt: 1704153600100,
  acknowledgedAt: 1704153600300,
  completedAt: 1704153600500,
  params: { relay: 1 },
  result: { success: true },
  timestamp: Firestore.serverTimestamp()
}
```

---

## 🔄 Flow Diagrams

### **Flow 1: Live Command with Successful Execution**

```
1. User clicks "Turn ON Relay 1" in web app
   ↓
2. Client calls sendDeviceCommand()
   ↓
3. Client writes to RTDB: devices/DEVICE_0001/commands/ESP32A
   {
     nodeId: "ESP32A",
     role: "relay",
     action: "on",
     relay: 1,
     status: "pending",
     requestedAt: 1704153600000,
     source: "live"
   }
   ↓
4. Client logs to Firestore: commandLogs collection (status: "sent")
   ↓
5. UI shows: [🔄 Waiting...] (relay button disabled)
   ↓
6. ESP32 receives command via RTDB listener
   ↓
7. ESP32 executes relay command (turns ON relay 1)
   ↓
8. ESP32 updates RTDB:
   {
     status: "completed",
     executedAt: 1704153600500,
     acknowledgedAt: 1704153600300,
     result: { success: true }
   }
   ↓
9. Client detects completion (waitForCommandComplete)
   ↓
10. Client updates Firestore log (status: "completed")
    ↓
11. UI shows: [✓ Turn OFF] (relay button enabled, state updated)
```

### **Flow 2: Live Command with Timeout (Device Offline)**

```
1. User clicks "Turn ON Relay 1"
   ↓
2. Client sends command to RTDB
   ↓
3. Client logs to Firestore (status: "sent")
   ↓
4. UI shows: [🔄 Waiting...]
   ↓
5. Client waits... 10s... 20s... 30s...
   ↓
6. ESP32 does NOT respond (offline)
   ↓
7. Client timeout after 30 seconds
   ↓
8. Client updates Firestore log (status: "timeout")
   ↓
9. UI shows: [⏱️ Timeout - device may be offline]
   ↓
10. Heartbeat Monitor Function detects offline (separate process)
    ↓
11. Function sends push notification: "⚠️ Device DEVICE_0001 is offline"
```

**Key Point:** Client reports timeout, but **Functions officially declare device offline**.

### **Flow 3: Scheduled Command Execution**

```
1. User creates schedule via web app
   → Firestore: scheduledCommands/{scheduleId}
   {
     type: "daily",
     time: "06:00",
     action: "relay:on",
     nextExecution: 1704153600000
   }
   ↓
2. Firebase Function executeScheduledCommands runs (every minute)
   ↓
3. Function queries: scheduledCommands where enabled=true AND nextExecution <= now
   ↓
4. Function finds schedule
   ↓
5. Function checks device online status via heartbeat
   ↓
6. IF OFFLINE:
   - Log error to Firestore
   - Send notification: "Scheduled command failed - device offline"
   - Update nextExecution (skip to next schedule)
   ↓
7. IF ONLINE:
   - Send command to RTDB
   - Wait for ESP32 ACK (30 seconds)
   - Log execution to commandExecutions
   - Update nextExecution (calculate next daily time)
   - Send success notification if configured
```

---

## 📊 Summary Table of Responsibilities

| Component | Role |
|-----------|------|
| **Client (Web App)** | Send live commands, show waiting states, create schedules (UI only) |
| **RTDB (Real-time Database)** | Store device data, heartbeats, and command queue |
| **ESP32** | Execute commands, send ACK, send heartbeat every 10-60s, optional local schedule backup |
| **Firebase Functions** | Monitor heartbeat → offline detection → notifications; execute scheduled commands; verify command completion |
| **Firestore** | Store logs, schedules, errors, audit trail (history only, not commands) |
| **FCM/Email** | Notify user if ESP32 offline or scheduled command failed |

---

## ✅ Key Principles to Remember

### 1. **Do NOT trust client for offline detection**
- Client can only show "waiting" / "timeout" state
- Functions + heartbeat are authoritative
- Client timeout ≠ device offline (could be network issue)

### 2. **RTDB = live commands only**
- Works while client is open
- Receives ACK → UI updates
- No persistent command queue

### 3. **Functions handle scheduled commands and offline notifications**
- Works even when client is closed
- Checks device online before executing
- Reliable notification system

### 4. **Logging is centralized in Firestore**
- Firestore only stores **history**, not active commands
- RTDB stores **current command state**
- All sources log to same collections

---

## 📁 File Structure

```
functions/src/
  ├── index.ts                    # Main exports
  ├── heartbeatMonitor.ts         # Layer 2: Heartbeat monitoring
  ├── scheduledCommands.ts        # Layer 3: Scheduled commands
  └── commandLogger.ts            # Layer 4: Centralized logging

lib/utils/
  ├── deviceCommands.ts           # Layer 1: Live commands (client-side)
  └── deviceActions.ts            # Legacy actions (to be migrated)

app/device/[id]/
  ├── page.tsx                    # Device control UI
  └── components/
      └── ControlPanel.tsx        # UI with waiting states

docs/
  └── IOT_ARCHITECTURE.md         # This document
```

---

## 🚀 Deployment Checklist

### Client (Web App)
- [x] Updated `deviceCommands.ts` with logging
- [x] Added waiting states to relay controls
- [x] Proper timeout handling (30s)
- [x] Error messages for timeouts

### Firebase Functions
- [x] Deployed `heartbeatMonitor.ts` functions
- [x] Deployed `scheduledCommands.ts` functions
- [x] Deployed `commandLogger.ts` utilities
- [x] Configured cron schedules:
  - Heartbeat: every 2 minutes
  - Scheduled commands: every 1 minute
  - Sensor logging: every 5 minutes (existing)

### ESP32 Firmware
- [ ] Send heartbeat every 10-60 seconds
- [ ] Listen to RTDB for commands
- [ ] Acknowledge commands immediately
- [ ] Execute and report completion
- [ ] Handle command format:
  ```json
  {
    "nodeId": "ESP32A",
    "role": "relay",
    "action": "on",
    "relay": 1,
    "status": "pending"
  }
  ```
- [ ] Update command status to "completed" with executedAt timestamp

### RTDB Structure
- [ ] Setup paths:
  ```
  devices/
    {deviceId}/
      status/
        heartbeat: 1704153600000
        online: true
      commands/
        ESP32A/
          {command object}
  ```
- [ ] OR new hierarchy:
  ```
  owners/
    {ownerId}/
      fields/
        {fieldId}/
          devices/
            {deviceId}/
              status/
                heartbeat: ...
              commands/
                ESP32A/
                  {command object}
  ```

### Firestore Collections
- [x] `commandLogs` - all command history
- [x] `commandExecutions` - scheduled command executions
- [x] `scheduledCommands` - schedule definitions
- [x] `errors` - device errors and offline events
- [x] `system_logs` - system events

---

## 🧪 Testing Scenarios

### Test 1: Live Command Success
1. Open device page
2. Click "Turn ON Relay 1"
3. Verify button shows "Waiting..."
4. ESP32 responds within 2 seconds
5. Verify button updates to "Turn OFF"
6. Check Firestore `commandLogs` for entry with status="completed"

### Test 2: Live Command Timeout
1. Turn off ESP32
2. Click "Turn ON Relay 1"
3. Verify button shows "Waiting..." for 30 seconds
4. Verify timeout message appears
5. Check Firestore `commandLogs` for entry with status="timeout"
6. Wait 5 minutes
7. Verify push notification: "Device offline"

### Test 3: Scheduled Command
1. Create daily schedule: Relay 1 ON at 6:00 AM
2. Wait until 6:00 AM (or adjust time for testing)
3. Verify function executes command
4. Check `commandExecutions` for entry
5. Verify notification sent
6. Verify `nextExecution` updated to next day

### Test 4: Scheduled Command (Device Offline)
1. Create schedule
2. Turn off ESP32
3. Wait for scheduled time
4. Verify function logs error
5. Verify notification: "Scheduled command failed - device offline"
6. Verify schedule still enabled for next execution

---

## 📞 Support & Maintenance

### Monitoring
- Check Firebase Functions logs for errors
- Monitor `errors` collection for unresolved issues
- Track command success rate via `commandLogs` statistics

### Common Issues
1. **"Device timeout" but device is online**
   - Check network connectivity
   - Verify ESP32 RTDB listener is active
   - Check command format in RTDB

2. **Heartbeat monitor not detecting offline**
   - Verify function is deployed and running
   - Check cron schedule configuration
   - Verify RTDB paths match function queries

3. **Scheduled commands not executing**
   - Verify `nextExecution` timestamp is correct
   - Check function logs for errors
   - Verify schedule document has `enabled: true`

---

## 🎓 Architecture Benefits

✅ **Scalable** - Each layer is independent and can scale separately  
✅ **Reliable** - Background monitoring works 24/7, even if client is offline  
✅ **Resilient** - Proper error handling, logging, and notifications  
✅ **Testable** - Each layer can be tested independently  
✅ **Maintainable** - Clear separation of concerns  
✅ **Industry-Standard** - Follows IoT best practices  

---

## 📝 Version History

- **v1.0.0** (2026-01-03): Initial implementation
  - Layer 1: Live control with waiting states
  - Layer 2: Heartbeat monitoring
  - Layer 3: Scheduled commands
  - Layer 4: Centralized logging

---

## 🤝 Contributing

When modifying this architecture:
1. **Do not mix client and server responsibilities**
2. **Always log commands to Firestore**
3. **Functions handle offline detection, not client**
4. **Test all layers independently**
5. **Update this document with changes**

---

**End of Documentation**
