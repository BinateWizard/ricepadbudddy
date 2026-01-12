# PadBuddy IoT Architecture - Deployment Checklist

## ✅ Pre-Deployment Verification

### 1. Check File Structure
```
✅ functions/src/heartbeatMonitor.ts
✅ functions/src/scheduledCommands.ts
✅ functions/src/commandLogger.ts
✅ functions/src/index.ts (updated)
✅ lib/utils/deviceCommands.ts (updated)
✅ app/device/[id]/page.tsx (updated)
✅ app/device/[id]/components/ControlPanel.tsx (updated)
```

### 2. Verify No TypeScript Errors
```powershell
# From project root
cd functions
npm run build
```

Expected output: No errors, compilation successful.

---

## 🚀 Step-by-Step Deployment

### Step 1: Build Functions
```powershell
cd functions
npm install  # If not already done
npm run build
```

### Step 2: Test Functions Locally (Optional)
```powershell
# Start Firebase emulators
firebase emulators:start --only functions

# In another terminal, test functions
# Check logs for:
# - [Heartbeat Monitor] Starting heartbeat check...
# - [Scheduled Commands] Checking for scheduled commands...
```

### Step 3: Deploy to Firebase
```powershell
# Deploy all functions
firebase deploy --only functions

# OR deploy specific functions
firebase deploy --only functions:monitorDeviceHeartbeats
firebase deploy --only functions:executeScheduledCommands
firebase deploy --only functions:onDeviceHeartbeat
firebase deploy --only functions:onLegacyDeviceHeartbeat
```

**Expected Output:**
```
✔  Deploy complete!

Functions:
  - monitorDeviceHeartbeats(us-central1)
  - executeScheduledCommands(us-central1)
  - onDeviceHeartbeat(us-central1)
  - onLegacyDeviceHeartbeat(us-central1)
  - scheduledSensorLogger(us-central1)
  - realtimeAlertProcessor(us-central1)
```

### Step 4: Verify Deployment
```powershell
# Check function logs
firebase functions:log --limit 50

# Look for:
# - Function deployment messages
# - Scheduled function executions
# - No errors
```

### Step 5: Deploy Web App (Vercel)
```powershell
# From project root
git add .
git commit -m "Implement final layered IoT architecture with heartbeat monitoring, scheduled commands, and centralized logging"
git push origin main
```

Vercel will automatically detect and deploy the changes.

### Step 6: Verify Web App
1. Open PadBuddy web app
2. Navigate to a device page
3. Try toggling a relay:
   - Should show "Waiting..." spinner
   - Should show success/timeout message
4. Check Firebase Console → Firestore → `commandLogs`
   - Should see new log entry

---

## 🔍 Post-Deployment Verification

### Check Firebase Functions Console
1. Go to: https://console.firebase.google.com
2. Select your project
3. Go to Functions
4. Verify all 6 functions are deployed:
   - ✅ monitorDeviceHeartbeats
   - ✅ executeScheduledCommands
   - ✅ onDeviceHeartbeat
   - ✅ onLegacyDeviceHeartbeat
   - ✅ scheduledSensorLogger
   - ✅ realtimeAlertProcessor

### Check Scheduled Functions are Running
```powershell
# Wait 2-3 minutes, then check logs
firebase functions:log --only monitorDeviceHeartbeats

# Should see:
# [Heartbeat Monitor] Starting heartbeat check...
# [Heartbeat Monitor] Check complete. Online: X, Offline: Y
```

### Check Firestore Collections
1. Go to Firebase Console → Firestore
2. Verify collections exist:
   - ✅ commandLogs (may be empty initially)
   - ✅ errors (may have offline device entries)
   - ✅ system_logs (may be empty initially)

### Test Live Command
1. Open device page in web app
2. Click "Turn ON Relay 1"
3. Check:
   - Button shows spinner
   - Firestore `commandLogs` gets new entry
   - Entry has fields: `deviceId`, `status`, `requestedAt`, `sentAt`

---

## 🧪 Testing Scenarios

### Test 1: Live Command (Device Online)
```
Prerequisites: ESP32 is online and sending heartbeats

Steps:
1. Open device page
2. Click "Turn ON Relay 1"
3. Wait for response

Expected Results:
✅ Button shows "Waiting..." spinner
✅ Within 2-5 seconds, button updates to "Turn OFF"
✅ Firestore commandLogs has entry with status="completed"
✅ No errors in console
```

### Test 2: Live Command (Device Offline)
```
Prerequisites: ESP32 is powered off

Steps:
1. Open device page
2. Click "Turn ON Relay 1"
3. Wait 30 seconds

Expected Results:
✅ Button shows "Waiting..." for 30 seconds
✅ Timeout message appears
✅ Firestore commandLogs has entry with status="timeout"
✅ After 5 minutes, push notification: "Device offline"
```

### Test 3: Heartbeat Monitoring
```
Prerequisites: Device was online

Steps:
1. Turn off ESP32
2. Wait 5-7 minutes
3. Check phone/browser for notification

Expected Results:
✅ Push notification received: "⚠️ Device {deviceId} is offline"
✅ Firestore errors collection has entry:
   - type: "device_offline"
   - severity: "critical"
✅ RTDB devices/{deviceId}/status/online = false
```

### Test 4: Scheduled Command (Future Feature)
```
Note: Requires UI for creating schedules (not yet implemented)

When implemented:
1. Create daily schedule: Relay 1 ON at 6:00 AM
2. Wait for execution time
3. Check commandExecutions collection

Expected Results:
✅ Command executed at scheduled time
✅ commandExecutions has entry
✅ Device relay turned ON
```

---

## 🐛 Troubleshooting

### Problem: Functions not deploying
```powershell
# Check for TypeScript errors
cd functions
npm run build

# If errors, fix them and redeploy
firebase deploy --only functions
```

### Problem: "Waiting..." never completes
```
Possible causes:
1. ESP32 not listening to RTDB commands
2. Command path mismatch
3. ESP32 not acknowledging

Check:
- Firebase Console → Realtime Database → devices/{deviceId}/commands/
- ESP32 Serial Monitor for command reception logs
- Verify ESP32 firmware implements acknowledgment
```

### Problem: No offline notifications
```
Possible causes:
1. Heartbeat monitor function not running
2. No FCM tokens for user
3. Notification permissions denied

Check:
- firebase functions:log --only monitorDeviceHeartbeats
- Firestore users/{userId}/fcmTokens array exists
- Browser notification permissions granted
```

### Problem: Scheduled commands not executing
```
Possible causes:
1. Function not deployed
2. Schedule nextExecution time not set
3. Schedule enabled=false

Check:
- firebase functions:log --only executeScheduledCommands
- Firestore scheduledCommands collection
- Verify nextExecution is in past (timestamp in ms)
```

---

## 📊 Monitoring & Maintenance

### Daily Checks
```powershell
# Check for errors in last 24 hours
firebase functions:log --since 1d | Select-String "error"

# Check Firestore errors collection
# Firebase Console → Firestore → errors (filter: resolved=false)
```

### Weekly Checks
```powershell
# Review command statistics
# Firestore → commandLogs
# Group by status, count success/failure rates

# Check function invocation counts
# Firebase Console → Functions → Usage
```

### Monthly Cleanup (Optional)
```powershell
# Clean up old logs (>90 days)
# Run cleanupOldLogs function manually or via scheduled task
# See: functions/src/commandLogger.ts::cleanupOldLogs
```

---

## 📚 Additional Resources

- **Architecture Documentation:** `docs/IOT_ARCHITECTURE.md`
- **ESP32 Integration:** `docs/ESP32_INTEGRATION_GUIDE.md`
- **Implementation Summary:** `docs/IMPLEMENTATION_SUMMARY.md`
- **RTDB Structure:** `docs/RTDB_STRUCTURE.md`

---

## ✅ Deployment Complete Checklist

After deployment, verify:

- [ ] All 6 Firebase Functions deployed successfully
- [ ] Heartbeat monitor running every 2 minutes
- [ ] Scheduled command checker running every minute
- [ ] Web app deployed to Vercel with no errors
- [ ] Device page relay controls show waiting states
- [ ] Live commands create Firestore logs
- [ ] Offline devices trigger notifications (after 5 min)
- [ ] No TypeScript compilation errors
- [ ] Firebase Console shows green status for all functions

---

**Deployment Status:** Ready to deploy  
**Estimated Time:** 10-15 minutes  
**Risk Level:** Low (backward compatible with existing features)

---

**Happy Deploying! 🚀**
