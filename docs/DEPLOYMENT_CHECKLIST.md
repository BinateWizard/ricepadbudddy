# Cloud Functions & Backend Deployment Checklist

## Pre-Deployment (Read First)

- [ ] Read `SOLUTION_SUMMARY.md` - understand what you're getting
- [ ] Read `BACKEND_ARCHITECTURE.md` - understand the design
- [ ] Read `ARCHITECTURE_DIAGRAMS.md` - visualize the flows
- [ ] Read `QUICK_REFERENCE.md` - remember the commands

---

## Phase 1: Preparation

### Firebase Project Setup
- [ ] Project ID confirmed (currently: `rice-padbuddy`)
- [ ] Billing enabled on Firebase project
- [ ] Database region: `asia-southeast1` ✓
- [ ] Cloud Functions region configured

### Local Development
- [ ] Node.js 20 installed: `node --version`
- [ ] npm installed: `npm --version`
- [ ] Firebase CLI installed: `firebase --version`
- [ ] Authenticated with Firebase: `firebase login`
- [ ] Functions built: `cd functions && npm run build`

---

## Phase 2: Deploy Cloud Functions

### Build & Deploy
- [ ] Clean build: `cd functions && npm run build`
  - Expected: No errors, `lib/index.js` created
- [ ] Check dependencies: `npm list` in functions folder
  - firebase-admin: ^12.0.0 ✓
  - firebase-functions: ^5.0.0 ✓
- [ ] Deploy: `npm run deploy`
  - Expected: All 5 functions deployed with green checkmarks
  - scheduledSensorLogger ✓
  - realtimeAlertProcessor ✓
  - deviceHealthMonitor ✓
  - commandAuditLogger ✓
  - alertCleanupScheduler ✓
  - helloWorld ✓

### Verify Deployment
- [ ] Firebase Console > Cloud Functions
  - [ ] All functions show green status
  - [ ] Memory allocated: 256MB each
  - [ ] Timeout: 60 seconds
  - [ ] Runtime: Node.js 20
- [ ] Test endpoint: `npm run logs`
  - Expected: See recent function logs

---

## Phase 3: Initialize Firestore

### Create Settings Document
**Method 1: Firebase Console**
1. [ ] Open Firestore Database
2. [ ] Create collection → ID: `settings`
3. [ ] Add document → ID: `system`
4. [ ] Paste this exact structure:

```json
{
  "alertThresholds": {
    "nitrogen_min": 20,
    "nitrogen_max": 50,
    "phosphorus_min": 10,
    "phosphorus_max": 40,
    "potassium_min": 150,
    "potassium_max": 250,
    "deviceOfflineThreshold": 600000
  },
  "logRetention": 2592000000,
  "alertRetention": 7776000000,
  "commandRetention": 5184000000,
  "features": {
    "offlineAlerting": true,
    "predictiveAnalysis": false,
    "anomalyDetection": false,
    "pushNotifications": true,
    "emailNotifications": false
  },
  "createdAt": "2025-01-02T00:00:00Z",
  "updatedAt": "2025-01-02T00:00:00Z"
}
```

5. [ ] Click Save
6. [ ] Verify document appears in Firestore

**Method 2: Node.js Script** (Alternative)
```bash
cd functions
node -e "
const admin = require('firebase-admin');
const serviceAccount = require('../path/to/serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
admin.firestore().collection('settings').doc('system').set({
  alertThresholds: { nitrogen_min: 20, nitrogen_max: 50, phosphorus_min: 10, phosphorus_max: 40, potassium_min: 150, potassium_max: 250, deviceOfflineThreshold: 600000 },
  logRetention: 2592000000, alertRetention: 7776000000, commandRetention: 5184000000,
  features: { offlineAlerting: true, predictiveAnalysis: false, anomalyDetection: false, pushNotifications: true, emailNotifications: false },
  createdAt: new Date(), updatedAt: new Date()
}).then(() => { console.log('✅ Done'); process.exit(0); });
"
```

### Verify Settings
- [ ] Firestore has `settings/system` document
- [ ] All fields present (thresholds, features, retention)
- [ ] No errors in Firebase Console

---

## Phase 4: Apply Security Rules

### Update Firestore Rules
1. [ ] Firebase Console > Firestore > Rules
2. [ ] Clear existing rules
3. [ ] Paste entire ruleset from `CLOUD_FUNCTIONS_IMPLEMENTATION.md`
4. [ ] Click "Publish"
5. [ ] Verify rules are active (green checkmark)

### Test Rules
- [ ] Can read fields owned by user: ✓
- [ ] Cannot read fields owned by others: ✓
- [ ] Can read settings document: ✓
- [ ] Cannot write alerts (Cloud Functions only): ✓

---

## Phase 5: Create Firestore Indexes

### Navigate to Indexes
1. [ ] Firebase Console > Firestore > Indexes
2. [ ] Wait for any existing index builds to complete

### Create Index 1: Logs by Timestamp
- [ ] Collection: `fields/{fieldId}/paddies/{paddyId}/logs`
- [ ] Field 1: `timestamp` (Descending)
- [ ] Field 2: `deviceId` (Ascending)
- [ ] Scope: Collection
- [ ] Status: ✅ Created

### Create Index 2: Alerts by Severity
- [ ] Collection Group: `alerts` (all collections named "alerts")
- [ ] Field 1: `createdAt` (Descending)
- [ ] Field 2: `severity` (Ascending)
- [ ] Scope: Collection Group
- [ ] Status: ✅ Created

### Create Index 3: Commands by Device
- [ ] Collection Group: `command_audit`
- [ ] Field 1: `deviceId` (Ascending)
- [ ] Field 2: `requestedAt` (Descending)
- [ ] Scope: Collection Group
- [ ] Status: ✅ Created

### Create Index 4: Paddies by Device
- [ ] Collection Group: `paddies`
- [ ] Field 1: `deviceId` (Ascending)
- [ ] Field 2: `createdAt` (Descending)
- [ ] Scope: Collection Group
- [ ] Status: ✅ Created

### Verify Indexes
- [ ] All 4 indexes show green status
- [ ] Index build time: typically 2-5 minutes
- [ ] No errors in console

---

## Phase 6: Integrate Frontend

### Update Root Layout
- [ ] File: `app/layout.tsx`
- [ ] Import AlertProvider: `import { AlertProvider } from '@/context/AlertContext'`
- [ ] Wrap children: `<AlertProvider>{children}</AlertProvider>`
- [ ] Build test: `npm run build` (no errors)

### Update Header Component
- [ ] File: Your header/navbar component
- [ ] Import AlertBadge: `import { AlertBadge } from '@/components/AlertNotifications'`
- [ ] Add to header: `<AlertBadge />`
- [ ] Styled correctly (shows in top-right)

### Add Alert Panel to Field Page
- [ ] File: `app/field/[id]/page.tsx`
- [ ] Import: `import { AlertPanel, AlertBanner } from '@/components/AlertNotifications'`
- [ ] Add AlertBanner at top
- [ ] Add AlertPanel in sidebar/modal
- [ ] Test: Click field, see empty alerts panel

### Create Alerts Dashboard (Optional)
- [ ] Create file: `app/alerts/page.tsx`
- [ ] Import and use: AlertStats, AlertPanel, AlertBanner
- [ ] Route visible in navigation

### Verify Integration
- [ ] App builds: `npm run build`
- [ ] No TypeScript errors
- [ ] No runtime errors in browser console

---

## Phase 7: Test Each Component

### Test 1: Sensor Logging (5-minute cycle)

**Setup:**
1. [ ] Device is online and sending sensor data
2. [ ] RTDB shows: `devices/{deviceId}/sensors/{N, P, K, lastUpdate}`

**Steps:**
1. [ ] Wait 5 minutes for scheduler to run
2. [ ] Open Firestore: `fields/{fieldId}/paddies/{paddyId}/logs`
3. [ ] Verify new log document was created
4. [ ] Log contains nitrogen, phosphorus, potassium values

**Success:** ✅ Log created in Firestore

### Test 2: Alert Generation (Out of Range)

**Setup:**
1. [ ] Manually add log to Firestore with extreme values:
   - Nitrogen: 5 (below min of 20) ← CRITICAL
   - Phosphorus: 50 (below max of 40) ← (OK)
   - Potassium: 200 (within range)

**Steps:**
1. [ ] Firestore: `fields/{id}/paddies/{id}/logs/{docId}`
2. [ ] New document with above values
3. [ ] Save document
4. [ ] Check `alerts/{fieldId}/alerts/` immediately
5. [ ] Should see new alert with type: "npk_low", severity: "critical"

**Success:** ✅ Alert created within 1 second

### Test 3: Device Health Monitor (Offline Detection)

**Setup:**
1. [ ] Device currently online (has recent heartbeat)

**Steps:**
1. [ ] Stop device from sending heartbeat (turn off/disconnect)
2. [ ] Wait 10+ minutes
3. [ ] Check Firestore: `devices/{deviceId}`
4. [ ] Should show: `status: "offline"`
5. [ ] Check alerts: `alerts/{fieldId}/alerts`
6. [ ] Should see: `type: "device_offline", severity: "critical"`

**Success:** ✅ Offline alert created

### Test 4: UI Display

**Setup:**
1. [ ] Create 2-3 test alerts in Firestore (mix critical/warning)
2. [ ] App is running locally

**Steps:**
1. [ ] Open app header
2. [ ] Look for AlertBadge: Should show count (red if critical)
3. [ ] Click field page
4. [ ] AlertBanner shows at top (if unacknowledged critical alert)
5. [ ] AlertPanel shows list of all field alerts
6. [ ] Try "Acknowledge" button on critical alert
7. [ ] Check Firestore: `acknowledged: true`
8. [ ] Try "Dismiss" button on warning
9. [ ] Check Firestore: `read: true`

**Success:** ✅ UI updates match Firestore state

### Test 5: Command Audit Logging

**Setup:**
1. [ ] Web app connected to RTDB

**Steps:**
1. [ ] Send a command to device (via ControlPanelTab)
2. [ ] Observe RTDB: `devices/{deviceId}/commands/{nodeId}`
3. [ ] Check Firestore: `command_audit/`
4. [ ] Should have new document with same command data
5. [ ] Contains: deviceId, action, status, timestamps

**Success:** ✅ Command logged to Firestore

### Test 6: Push Notifications (Optional)

**Setup:**
1. [ ] User document has `fcmToken` field
2. [ ] Browser allows notifications
3. [ ] Browser has service worker registered

**Steps:**
1. [ ] Create a critical alert
2. [ ] Device should have `fcmToken`
3. [ ] Should receive push notification
4. [ ] Check browser notification (might be silent on dev)
5. [ ] Check Cloud Functions logs: "Sent FCM notification"

**Success:** ✅ FCM attempted (may not work in dev without proper setup)

---

## Phase 8: Production Verification

### Monitor Cloud Functions
- [ ] Dashboard: `npm run logs` shows recent executions
- [ ] All functions have recent successful runs (green)
- [ ] No error messages (red X)
- [ ] No timeout messages

### Verify Data Integrity
- [ ] Firestore has no data corruption
- [ ] RTDB still has current device state
- [ ] Logs accumulating properly
- [ ] Indexes are being used (green in metrics)

### Performance Check
- [ ] Alert creation < 1 second after log
- [ ] Health check runs every 2 minutes
- [ ] Sensor logging every 5 minutes
- [ ] No function timeouts
- [ ] No out-of-memory errors

### Cost Verification
- [ ] Firebase Console > Billing
- [ ] View estimated costs for month
- [ ] Should be minimal (free tier for most usage)

---

## Phase 9: Team Training

- [ ] Show how to access AlertBadge in header
- [ ] Demo: Acknowledge critical alerts
- [ ] Explain: Different alert types
- [ ] Explain: How offline detection works
- [ ] Document: Custom alert thresholds can be changed
- [ ] Provide: Quick reference guide (`QUICK_REFERENCE.md`)

---

## Phase 10: Documentation & Monitoring

### Documentation
- [ ] README updated with alert system info
- [ ] Team has copy of `QUICK_REFERENCE.md`
- [ ] Team knows where guides are stored
- [ ] Contact info for support documented

### Ongoing Monitoring
- [ ] Check logs weekly: `npm run logs`
- [ ] Monitor costs in Firebase Console > Billing
- [ ] Review alert thresholds monthly (adjust for season)
- [ ] Archive old data quarterly

---

## Rollback Plan (If Issues)

### If Cloud Functions Fail
```bash
firebase functions:delete functionName
# Fix the code
npm run build && npm run deploy
```

### If Firestore Corrupt
- [ ] Restore from backup (Google manages automatically)
- [ ] Contact Google Cloud support

### If Security Rules Block Users
- [ ] Temporarily relax rules
- [ ] Debug in Firebase Console
- [ ] Reapply with fixes

### If Indexes Not Created
- [ ] Wait 5-10 minutes for build
- [ ] Check Firebase Console for errors
- [ ] Recreate if needed

---

## Success Criteria

✅ **Backend Ready When:**
- [ ] All 5 Cloud Functions deployed
- [ ] Settings document initialized
- [ ] Security rules applied
- [ ] All 4 Firestore indexes created
- [ ] AlertProvider integrated in layout
- [ ] Alert components showing in UI
- [ ] Test alerts created and acknowledged
- [ ] No errors in any console
- [ ] All functions have recent successful runs
- [ ] Team trained on system

---

## Sign-Off

| Role | Name | Date | Status |
|------|------|------|--------|
| Developer | _______ | _______ | ☐ |
| DevOps | _______ | _______ | ☐ |
| QA | _______ | _______ | ☐ |
| Product | _______ | _______ | ☐ |

---

## Next Phase

After all checkboxes complete:
- [ ] Phase 3 features: ML predictions
- [ ] Phase 3 features: Anomaly detection
- [ ] Mobile app development
- [ ] Data export/reporting
- [ ] Team mobile push notifications

---

**Questions?** → See `QUICK_REFERENCE.md` or contact your technical lead.

**Ready to deploy?** → Start at Phase 1 and work through each phase systematically!
