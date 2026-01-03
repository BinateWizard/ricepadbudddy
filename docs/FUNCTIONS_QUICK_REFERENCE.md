# PadBuddy Cloud Functions - Quick Reference

## 🎯 Function Categories

### 1️⃣ Heartbeat & Monitoring
```typescript
// Real-time device status
monitorHeartbeat          // RTDB trigger: /devices/{id}/heartbeat
checkAllDevicesHeartbeat  // Cron: Every 5 minutes
```

### 2️⃣ Live Commands
```typescript
// Command verification
verifyLiveCommand     // RTDB trigger: /devices/{id}/commands/{cmdId}
checkCommandTimeouts  // Cron: Every 1 minute
```

### 3️⃣ Scheduled Commands
```typescript
// Scheduled execution
executeScheduledCommand  // Firestore trigger: devices/{id}/schedules/{sid}
checkPendingSchedules    // Cron: Every 1 minute
```

### 4️⃣ Sensor Data
```typescript
// NPK logging
logSensorData            // RTDB trigger: /devices/{id}/npk
scheduledSensorLogger    // Cron: Every 5 minutes
```

### 5️⃣ Device Management
```typescript
// Device lifecycle
registerDevice            // Firestore trigger: devices/{id} onCreate
updateDeviceAssignment    // Firestore trigger: devices/{id} onUpdate
```

### 6️⃣ Field Calculations
```typescript
// Area & NPK recommendations
calculateFieldArea       // Firestore trigger: fields/{id} onWrite
calculateDevicePlotArea  // Firestore trigger: devices/{id} onWrite
```

### 7️⃣ System Audit
```typescript
// Maintenance & monitoring
cleanupSystemLogs        // Cron: Daily 2 AM
cleanupDeviceLogs        // Cron: Daily 3 AM
generateHealthReport     // Cron: Daily 8 AM
```

---

## 📁 File Structure

```
functions/src/
├── index.ts                    # Main exports
├── heartbeatMonitor.ts         # Legacy + new heartbeat functions
├── liveCommands.ts             # Live command verification
├── scheduledExecutor.ts        # Scheduled command execution
├── sensorLogger.ts             # NPK sensor logging
├── deviceRegistration.ts       # Device onboarding
├── fieldCalculations.ts        # Area & NPK calculations
├── systemLogger.ts             # Audit & system logs
├── scheduledCommands.ts        # Legacy scheduled commands
└── commandLogger.ts            # Legacy command logging
```

---

## 🔄 Data Flow Examples

### Device Goes Offline
```
ESP32 stops sending heartbeat
       ↓
RTDB: /devices/{id}/heartbeat (no update for 5 min)
       ↓
monitorHeartbeat detects offline
       ↓
Firestore: devices/{id}.connected = false
       ↓
User notification added
       ↓
Log created: devices/{id}/logs/{logId}
```

### Live Command Execution
```
User clicks "Relay 2 ON"
       ↓
Frontend writes to RTDB: /devices/{id}/commands/{cmdId}
       ↓
ESP32 receives command, executes, updates status
       ↓
verifyLiveCommand detects status change
       ↓
Logs result to Firestore: devices/{id}/logs/{logId}
       ↓
Notifies user if failed
```

### Scheduled Command
```
User creates schedule: devices/{id}/schedules/{sid}
       ↓
checkPendingSchedules (cron) finds due schedule
       ↓
executeScheduledCommand triggered
       ↓
Checks device online status
       ↓
Sends command to RTDB: /devices/{id}/commands/{cmdId}
       ↓
Waits for ACK (30s timeout)
       ↓
Updates schedule status (executed/failed)
       ↓
Logs result to Firestore
```

### NPK Sensor Reading
```
ESP32 updates RTDB: /devices/{id}/npk
       ↓
logSensorData triggered
       ↓
Validates data (freshness, non-null)
       ↓
Checks for duplicates
       ↓
Logs to Firestore: devices/{id}/logs/{logId}
       ↓
Aggregates field average NPK
       ↓
Triggers NPK recommendation if needed
```

---

## 🚀 Deployment Commands

### Deploy All
```bash
cd functions
npm run build
firebase deploy --only functions
```

### Deploy Individual
```bash
firebase deploy --only functions:monitorHeartbeat
firebase deploy --only functions:verifyLiveCommand
firebase deploy --only functions:logSensorData
```

### View Logs
```bash
firebase functions:log
firebase functions:log --only monitorHeartbeat --lines 100
```

### Test Locally
```bash
firebase emulators:start --only functions,firestore,database
```

---

## 🔍 Debugging

### Check Function Status
```bash
firebase functions:list
```

### View Recent Errors
```bash
firebase functions:log --only functions/errors
```

### Monitor in Real-time
```bash
firebase functions:log --follow
```

### Query System Logs (Firestore Console)
```javascript
// Find recent errors
db.collection('systemLogs')
  .where('level', '==', 'error')
  .orderBy('timestamp', 'desc')
  .limit(50)
```

---

## 📊 Key Metrics

### Execution Frequency
- **Real-time:** Instant (< 1 second)
- **Scheduled (1 min):** 1,440 executions/day
- **Scheduled (5 min):** 288 executions/day
- **Daily:** 1 execution/day

### Estimated Monthly Invocations (100 devices)
| Function | Invocations/Month |
|----------|------------------|
| monitorHeartbeat | ~8,640 |
| checkAllDevicesHeartbeat | ~8,640 |
| verifyLiveCommand | ~50,000 |
| logSensorData | ~43,200 |
| scheduledSensorLogger | ~8,640 |
| **Total** | **~119,000** |

### Free Tier Limits
- **Invocations:** 2,000,000/month
- **Compute Time:** 400,000 GB-seconds/month
- **Network:** 5 GB/month

---

## ⚠️ Common Issues

### Function Not Triggering
1. Check deployment: `firebase functions:list`
2. Verify trigger path matches exactly
3. Check Firestore/RTDB rules allow access
4. Review logs for errors

### Command Timeout
1. Verify device is online (check heartbeat)
2. Check RTDB connection
3. Increase timeout if needed (currently 30s)
4. Review ESP32 logs

### Duplicate Logs
1. Deduplication logic in place
2. Based on timestamp + values
3. 5-minute window for near-duplicates

### High Costs
1. Enable log cleanup functions
2. Review scheduled function frequency
3. Optimize database queries
4. Use Firestore batch operations

---

## 🛠️ Maintenance Tasks

### Weekly
- [ ] Review system logs for errors
- [ ] Check device offline rate
- [ ] Monitor function execution times

### Monthly
- [ ] Review health reports
- [ ] Analyze function costs
- [ ] Update timeout thresholds if needed
- [ ] Archive old logs manually if needed

### Quarterly
- [ ] Review and optimize functions
- [ ] Update dependencies
- [ ] Performance testing
- [ ] Security audit

---

## 📞 Support

### Documentation
- [Complete Architecture](./FIRESTORE_RTDB_ARCHITECTURE.md)
- [Cloud Functions Guide](./CLOUD_FUNCTIONS_COMPLETE.md)
- [Migration Guide](./MIGRATION_GUIDE.md)

### Logs & Monitoring
- Firebase Console: Functions > Logs
- Firestore: `/systemLogs` collection
- Health Reports: `/healthReports` collection

---

**Last Updated:** January 3, 2026
