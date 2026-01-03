# 🎯 Quick Reference: Layered IoT Architecture

## Architecture at a Glance

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT (Web App)                         │
│  • Send live commands                                            │
│  • Show waiting states                                           │
│  • Create schedules (UI only)                                    │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                     RTDB (Real-time Database)                    │
│  • Store device heartbeat                                        │
│  • Queue commands                                                │
│  • Current device state                                          │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                           ESP32 Devices                          │
│  • Send heartbeat every 30s                                      │
│  • Listen for commands                                           │
│  • Execute & acknowledge                                         │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Firebase Functions                          │
│  • Monitor heartbeats → offline detection                        │
│  • Execute scheduled commands                                    │
│  • Send notifications                                            │
│  • Centralized logging                                           │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Firestore (History/Logs)                      │
│  • commandLogs - all commands                                    │
│  • errors - device errors                                        │
│  • scheduledCommands - schedules                                 │
│  • commandExecutions - execution logs                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔑 Key Principles

| Principle | Description |
|-----------|-------------|
| **Client = UI Only** | Client shows waiting states, does NOT decide if device is offline |
| **Functions = Authority** | Functions officially detect offline status via heartbeat |
| **RTDB = Current State** | Real-time device data, commands, heartbeat |
| **Firestore = History** | Historical logs, schedules, errors |
| **ESP32 = Executor** | Executes commands, sends heartbeat, reports completion |

---

## 📂 File Map

| File | Purpose | Layer |
|------|---------|-------|
| `lib/utils/deviceCommands.ts` | Live command sending | Layer 1 |
| `functions/src/heartbeatMonitor.ts` | Offline detection | Layer 2 |
| `functions/src/scheduledCommands.ts` | Scheduled execution | Layer 3 |
| `functions/src/commandLogger.ts` | Centralized logging | Layer 4 |
| `app/device/[id]/page.tsx` | UI with waiting states | Layer 1 |

---

## ⚡ Command Flow

### Live Command (Device Online)
```
User clicks button
  → Client sends to RTDB
  → UI shows "Waiting..."
  → ESP32 receives & executes
  → ESP32 sends ACK
  → UI updates (success!)
  → Firestore log created
```

### Live Command (Device Offline)
```
User clicks button
  → Client sends to RTDB
  → UI shows "Waiting..."
  → ... 30 seconds ...
  → Timeout (no ACK)
  → UI shows timeout message
  → Firestore log (status: timeout)
  → (Later) Functions detect offline
  → Push notification sent
```

### Scheduled Command
```
Function runs every minute
  → Checks schedules
  → Finds due schedule
  → Checks device online (heartbeat)
  → IF OFFLINE: Log error, notify, skip
  → IF ONLINE: Send command to RTDB
  → Wait for ESP32 ACK
  → Log execution result
  → Update next execution time
```

---

## 📊 Firestore Collections

| Collection | Purpose | Key Fields |
|------------|---------|------------|
| `commandLogs` | All command history | deviceId, status, requestedAt, completedAt |
| `errors` | Device errors/offline | deviceId, type, severity, resolved |
| `scheduledCommands` | Schedule definitions | type, time, action, nextExecution |
| `commandExecutions` | Execution history | scheduledCommandId, status, error |
| `system_logs` | System events | type, message, timestamp |

---

## 🔧 RTDB Paths

```
devices/
  {deviceId}/
    status/
      heartbeat: 1704153600000      # Updated every 30s by ESP32
      online: true                  # Updated by Functions
    
    commands/
      ESP32A/                       # Relay controller
        nodeId: "ESP32A"
        role: "relay"
        action: "on"
        relay: 1
        status: "pending"          # → "completed" when done
        requestedAt: 1704153600000
        acknowledgedAt: 1704153600300
        executedAt: 1704153600500
      
      ESP32B/                       # Motor controller
      ESP32C/                       # NPK sensor controller
    
    sensors/
      nitrogen: 45.2
      phosphorus: 12.8
      potassium: 38.5
      lastUpdate: 1704153600000
```

---

## ⏱️ Timeouts & Intervals

| Action | Timeout/Interval |
|--------|------------------|
| ESP32 heartbeat | Every 30 seconds |
| Heartbeat monitor | Every 2 minutes |
| Scheduled commands | Every 1 minute |
| Device offline threshold | 5 minutes (no heartbeat) |
| Live command timeout | 30 seconds |
| Sensor logging | Every 5 minutes |

---

## 🚨 Status Values

### Command Status Flow
```
pending → sent → acknowledged → completed ✓
                              ↘ failed ✗
                              ↘ timeout ⏱️
```

### Device Online Status
```
online: true   ✓ (heartbeat within 5 min)
online: false  ✗ (no heartbeat for >5 min)
```

---

## 📱 Notifications

| Event | Notification |
|-------|--------------|
| Device goes offline | "⚠️ Device {deviceId} is offline" |
| Device comes online | (Auto-resolve error, silent) |
| Scheduled command fails | "⚠️ Scheduled command failed - device offline" |
| Scheduled command succeeds | (Optional - configurable) |

---

## 🧪 Quick Tests

### Test Live Command
```
1. Open device page
2. Click relay button
3. Verify "Waiting..." shows
4. Check Firestore → commandLogs
```

### Test Offline Detection
```
1. Turn off ESP32
2. Wait 5 minutes
3. Check for push notification
4. Check Firestore → errors
```

### Test Heartbeat
```
1. Check RTDB → devices/{deviceId}/status/heartbeat
2. Verify timestamp updates every 30s
```

---

## 🛠️ Common Commands

```powershell
# Build functions
cd functions && npm run build

# Deploy functions
firebase deploy --only functions

# View logs
firebase functions:log --limit 50

# Deploy web app (Vercel auto-deploys on push)
git push origin main

# Check errors
firebase functions:log | Select-String "error"
```

---

## 📖 Documentation

- **[IOT_ARCHITECTURE.md](./docs/IOT_ARCHITECTURE.md)** - Full architecture
- **[ESP32_INTEGRATION_GUIDE.md](./docs/ESP32_INTEGRATION_GUIDE.md)** - Firmware guide
- **[IMPLEMENTATION_SUMMARY.md](./docs/IMPLEMENTATION_SUMMARY.md)** - What was built
- **[DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md)** - Deploy steps

---

## 💡 Remember

✅ **Client only shows UI state** (waiting, timeout, success)  
✅ **Functions handle official offline detection** (authoritative)  
✅ **ESP32 sends heartbeat every 30s** (critical for monitoring)  
✅ **All commands logged to Firestore** (audit trail)  
✅ **Scheduled commands work even when app closed** (background)  

---

**Need help?** Check the full documentation in `docs/` folder.
