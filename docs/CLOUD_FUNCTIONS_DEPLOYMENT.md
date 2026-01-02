# Cloud Functions Deployment Guide

## What's Included

Your Cloud Functions now have 5 production-grade functions:

### 1. **scheduledSensorLogger** ✅ (Already implemented)
- **Trigger**: Every 5 minutes
- **Purpose**: Read sensor data from RTDB, write to Firestore for history
- **Status**: Deployed and working

### 2. **realtimeAlertProcessor** 🆕 (NEW)
- **Trigger**: When new sensor log is created in Firestore
- **Purpose**: Check readings against thresholds, create alerts
- **Creates**: Alert documents in `alerts/{fieldId}/alerts`
- **Sends**: FCM push notifications to users

### 3. **deviceHealthMonitor** 🆕 (NEW)
- **Trigger**: Every 2 minutes
- **Purpose**: Check device heartbeats, detect offline devices
- **Creates**: Offline alerts automatically
- **Updates**: Device status in Firestore

### 4. **commandAuditLogger** 🆕 (NEW)
- **Trigger**: When commands are written to RTDB
- **Purpose**: Log all device commands for audit trail
- **Creates**: Audit entries in `command_audit` collection

### 5. **alertCleanupScheduler** 🆕 (NEW)
- **Trigger**: Daily at 2 AM
- **Purpose**: Delete alerts older than 90 days
- **Keeps**: System lean and within quota

---

## Pre-Deployment Checklist

### 1. Initialize Firestore Settings
You must create the `settings/system` document before deploying. Run this once:

```bash
# From your project root
node -e "
const admin = require('firebase-admin');
const serviceAccount = require('./path-to-your-service-account.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const firestore = admin.firestore();

firestore.collection('settings').doc('system').set({
  alertThresholds: {
    nitrogen_min: 20,
    nitrogen_max: 50,
    phosphorus_min: 10,
    phosphorus_max: 40,
    potassium_min: 150,
    potassium_max: 250,
    deviceOfflineThreshold: 600000
  },
  logRetention: 2592000000,
  alertRetention: 7776000000,
  commandRetention: 5184000000,
  features: {
    offlineAlerting: true,
    predictiveAnalysis: false,
    anomalyDetection: false,
    pushNotifications: true,
    emailNotifications: false
  },
  createdAt: admin.firestore.FieldValue.serverTimestamp(),
  updatedAt: admin.firestore.FieldValue.serverTimestamp()
}).then(() => {
  console.log('✅ Settings initialized');
  process.exit(0);
}).catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
"
```

Or use Firebase Console:
1. Go to **Firestore Database**
2. Click **Start Collection** → name it `settings`
3. Add document with ID `system`
4. Copy the JSON above into the document

### 2. Apply Firestore Security Rules

In Firebase Console > Firestore > Rules:

```
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    
    // Settings - read-only for users
    match /settings/{document=**} {
      allow read: if request.auth != null;
      allow write: if false;
    }
    
    // Fields and nested collections
    match /fields/{fieldId} {
      allow read: if request.auth.uid == resource.data.owner;
      allow create: if request.auth.uid == request.resource.data.owner;
      allow update: if request.auth.uid == resource.data.owner;
      allow delete: if request.auth.uid == resource.data.owner;
      
      match /{document=**} {
        allow read: if request.auth.uid == get(/databases/$(database)/documents/fields/$(fieldId)).data.owner;
        allow write: if request.auth.uid == get(/databases/$(database)/documents/fields/$(fieldId)).data.owner;
      }
    }
    
    // Alerts
    match /alerts/{fieldId} {
      allow read: if request.auth.uid == get(/databases/$(database)/documents/fields/$(fieldId)).data.owner;
      
      match /alerts/{alertId} {
        allow read: if request.auth.uid == get(/databases/$(database)/documents/fields/$(fieldId)).data.owner;
        allow update: if request.auth.uid == get(/databases/$(database)/documents/fields/$(fieldId)).data.owner &&
                        (request.resource.data.read == true || request.resource.data.acknowledged == true);
        allow write: if false;
      }
    }
    
    // Device status
    match /devices/{deviceId} {
      allow read: if request.auth != null;
      allow write: if false;
    }
    
    // Command audit
    match /command_audit/{commandId} {
      allow read: if request.auth != null;
      allow write: if false;
    }
    
    // User activity
    match /user_activity/{userId} {
      allow read: if request.auth.uid == userId;
      allow write: if false;
    }
  }
}
```

### 3. Create Firestore Indexes

In Firebase Console > Firestore > Indexes, create these composite indexes:

**Index 1: Logs by Timestamp**
- Collection: `fields/{fieldId}/paddies/{paddyId}/logs`
- Fields: `timestamp` (Descending), `deviceId` (Ascending)

**Index 2: Alerts by Severity**
- Collection: `alerts` (collection group)
- Fields: `createdAt` (Descending), `severity` (Ascending)

**Index 3: Commands by Device**
- Collection: `command_audit` (collection group)
- Fields: `deviceId` (Ascending), `requestedAt` (Descending)

**Index 4: Paddies by Device**
- Collection: `paddies` (collection group)
- Fields: `deviceId` (Ascending), `createdAt` (Descending)

---

## Deployment Steps

### Step 1: Build Cloud Functions

```bash
cd functions
npm run build
```

Expected output:
```
✅ Compiling TypeScript...
✅ Generated lib/index.js
```

### Step 2: Test Locally (Optional)

```bash
npm run serve
```

This starts the Firebase emulator with your functions running locally.

### Step 3: Deploy to Firebase

```bash
npm run deploy
```

You'll see output like:
```
✔️  functions[scheduledSensorLogger]: successful creation
✔️  functions[realtimeAlertProcessor]: successful creation
✔️  functions[deviceHealthMonitor]: successful creation
✔️  functions[commandAuditLogger]: successful creation
✔️  functions[alertCleanupScheduler]: successful creation
```

### Step 4: Verify Deployment

In Firebase Console > Cloud Functions, you should see all 5 functions with green checkmarks.

---

## Testing the Functions

### Test 1: Sensor Logger
1. Go to your RTDB and manually add sensor data
2. Wait 5 minutes
3. Check Firestore `fields/{fieldId}/paddies/{paddyId}/logs` for new entry

### Test 2: Alert Processor
1. Manually add a log with nitrogen < 20 mg/kg
2. Check Firestore `alerts/{fieldId}/alerts` for new alert
3. Check device logs for FCM notification attempt

### Test 3: Device Health Monitor
1. Stop heartbeat from a device (don't update `devices/{deviceId}/heartbeat`)
2. Wait 10 minutes
3. Check Firestore `devices/{deviceId}.status` → should be "offline"
4. Check Firestore `alerts/{fieldId}/alerts` for offline alert

### Test 4: Alert Cleanup
1. Create old test alerts manually in Firestore
2. Update their `createdAt` to 91+ days ago
3. Wait for 2 AM (or manually trigger the function)
4. Verify old alerts are deleted

---

## Monitoring & Troubleshooting

### View Logs

```bash
npm run logs
```

Or in Firebase Console > Cloud Functions > Click each function > Logs tab

### Common Issues

**Issue**: "Settings document not found" in alert processor
- **Solution**: Run the initialization script above (Step 1 of pre-deployment)

**Issue**: Alerts not being created
- **Solution**: 
  1. Check RTDB has `devices/{deviceId}/heartbeat` (device heartbeat)
  2. Verify Firestore has `fields/{fieldId}/paddies/{paddyId}`
  3. Confirm settings/system document exists with thresholds

**Issue**: FCM notifications not sending
- **Solution**:
  1. Check user document has `fcmToken` field
  2. Verify user is authenticated
  3. Check Firebase project has Messaging enabled

**Issue**: Function timeouts
- **Solution**: Increase timeout in `firebase.json`:
```json
{
  "functions": {
    "timeoutSeconds": 540,
    "memory": "512MB"
  }
}
```

---

## Function Memory & Costs

Default configuration (256MB, 60s timeout) is sufficient for most use cases.

**Costs (as of Jan 2025):**
- First 2M invocations/month: FREE
- Beyond: ~$0.40 per 1M invocations
- Compute time: ~$0.0000005 per GB-second

**Example**: With 288 invocations/day (sensor logger every 5 min), you'll hit ~8,640 calls/month = well within free tier.

---

## Next Steps

1. ✅ Deploy these Cloud Functions
2. ✅ Initialize Firestore settings
3. ✅ Apply security rules
4. ✅ Create Firestore indexes
5. Create AlertContext in your web app to listen to alerts
6. Add alert UI notifications to your dashboard
7. Implement `markAlertAsRead()` function in your app

See `BACKEND_ARCHITECTURE.md` for full system design.
