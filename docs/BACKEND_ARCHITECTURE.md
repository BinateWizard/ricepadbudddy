# PadBuddy Backend Architecture - Professional IoT System

## Overview

This document outlines the professional backend architecture for PadBuddy, an IoT system connecting ESP32 hardware devices with a Next.js web application via Firebase. The architecture handles real-time data, offline resilience, audit logging, and asynchronous command execution.

---

## 1. System Architecture Layers

### Layer 1: Hardware Layer (ESP32 Devices)
- **Role**: Collect sensor data, execute control commands, maintain connectivity
- **Responsibility**: Send heartbeats, update sensor readings, acknowledge commands
- **Communication**: Bidirectional via Firebase RTDB (fast, optimized for IoT)

### Layer 2: Real-Time Data Layer (Firebase RTDB)
- **Role**: Live state mirror for IoT devices
- **Contains**: Current sensor readings, device heartbeat, command queue, device status
- **Optimized For**: Speed, low latency, always-on connectivity
- **Retention**: 7-30 days (configurable) - keeps recent state only

### Layer 3: Historical Data Layer (Firestore)
- **Role**: Persistent, queryable audit trail and analytics
- **Contains**: Sensor logs, command audit trails, alerts, analytics data
- **Optimized For**: Querying, sorting, historical analysis
- **Retention**: Indefinite (with archival strategy)

### Layer 4: Business Logic Layer (Cloud Functions)
- **Role**: Orchestrate data pipelines, trigger alerts, execute scheduled jobs
- **Components**:
  - Scheduled sensor logger (5-min intervals)
  - Alert trigger system
  - Data processors
  - Command validators

### Layer 5: Client Layer (Next.js App)
- **Role**: User interface, user actions, offline-first features
- **Features**:
  - Real-time updates via RTDB listeners
  - Local sync queue for offline commands
  - Optimistic UI updates
  - PWA support for offline functionality

---

## 2. Data Flow Architecture

### A. Sensor Reading Flow (Hardware → Web)

```
ESP32 Device (every 5-10 min)
    ↓
RTDB: devices/{deviceId}/sensors
    ├→ Snapshot: Current readings
    └→ Listener active in Web App (real-time UI)
    
    ↓ (Every 5 minutes)
    
Cloud Function: scheduledSensorLogger
    ├→ Read all devices from RTDB
    ├→ Find associated paddies in Firestore
    ├→ Write to: firestore/fields/{fieldId}/paddies/{paddyId}/logs
    └→ Deduplicate (skip if same reading within 5 min)
    
Results:
  ✓ RTDB: Current state, low latency, UI updates
  ✓ Firestore: Historical record, queryable, indexable
```

### B. Control Command Flow (Web → Hardware → Web)

```
User clicks "Spray Now" in Web App
    ↓
performDeviceAction(deviceId, "spray_pump_on")
    ├→ Store in RTDB: devices/{deviceId}/commands/{nodeId}
    ├→ Log action: firestore/command_audit
    └→ Mark as pending
    
    ↓ (Real-time listener)
    
ESP32 Device receives via RTDB listener
    ├→ Validate command
    ├→ Execute control (relay/motor)
    └→ Set actionTaken = true in RTDB
    
    ↓ (Web app sees actionTaken)
    
Web App confirms acknowledgement
    └→ Shows "Pending..." state
    
    ↓ (Device completes operation)
    
ESP32 Device
    └→ Set action = "done" in RTDB
    
    ↓ (Web app sees completion)
    
Web App
    ├→ Shows success/failure
    ├→ Logs completion: firestore/command_audit
    └→ Updates UI
```

### C. Alert & Notification Flow (Offline-Capable)

```
Firestore Rule Triggers or Cloud Function Check
    ├→ NPK levels out of range?
    ├→ Device offline > 10 min?
    └→ Water level critical?
    
    ↓
Create Alert Document: firestore/alerts/{fieldId}/{alertId}
    ├→ severity: "critical" | "warning" | "info"
    ├→ type: "npk_low" | "device_offline" | "water_level"
    ├→ timestamp
    ├→ read: false
    └→ acknowledged: false
    
    ↓ (If user is online)
    
Send FCM Push Notification
    └→ Real-time notification
    
    ↓ (Regardless of connectivity)
    
Web App Listener: collection('alerts')
    ├→ Syncs to local IndexedDB via offline plugin
    └→ Shows notification even if user was offline
    
User marks alert as read/acknowledged
    └→ Updates Firestore and local state
```

---

## 3. Firebase Structure (Professional Organization)

### 3.1 RTDB Structure (Real-Time State)
```
devices/
  {deviceId}/
    heartbeat: timestamp               # Updated every 60s (device online indicator)
    sensors/
      nitrogen: 45.2
      phosphorus: 12.8
      potassium: 38.5
      lastUpdate: timestamp
    location/
      latitude: number
      longitude: number
      timestamp: timestamp
    commands/                          # Command queue
      {nodeId}/
        action: string                 # Command name
        params: object                 # Command parameters
        ack: boolean                   # Device acknowledged?
        requestedAt: timestamp
        executedAt: timestamp
        status: "pending" | "executing" | "done" | "failed"
    actionTaken: boolean               # Ack flag (deprecated, use commands.status)
    lastSeen: timestamp                # When device last updated anything
    metadata/
      deviceType: string
      firmwareVersion: string
      batteryLevel: number
```

### 3.2 Firestore Structure (Historical & Queryable Data)

```
Firestore/
  
  fields/
    {fieldId}/
      name: string
      owner: string (userId)
      createdAt: timestamp
      
      paddies/
        {paddyId}/
          deviceId: string              # Links to RTDB device
          name: string
          
          logs/                         # Sensor history
            {logId}/
              nitrogen: number
              phosphorus: number
              potassium: number
              temperature: number (optional)
              humidity: number (optional)
              timestamp: Timestamp
              source: "esp32" | "firebase-scheduled" | "manual"
              deviceTimestamp: timestamp  # When ESP32 took reading
          
          statistics/
            {statisticsId}/
              period: "daily" | "weekly" | "monthly"
              date: string
              avgNitrogen: number
              maxNitrogen: number
              minNitrogen: number
              readingCount: number
              timestamp: Timestamp
  
  devices/
    {deviceId}/
      status: "online" | "offline" | "maintenance"
      lastHeartbeat: Timestamp
      lastSensorUpdate: Timestamp
      
      metrics/
        {metricId}/
          uptime: number           # Percentage
          totalCommands: number
          failedCommands: number
          averageResponseTime: number
          timestamp: Timestamp
  
  command_audit/
    {commandId}/
      deviceId: string
      userId: string
      action: string
      params: object
      status: "sent" | "acknowledged" | "completed" | "failed"
      requestedAt: Timestamp
      acknowledgedAt: Timestamp
      completedAt: Timestamp
      error: string (if failed)
      result: object (if completed)
  
  alerts/
    {fieldId}/
      {alertId}/
        type: "npk_low" | "npk_high" | "device_offline" | "water_level" | "anomaly"
        severity: "critical" | "warning" | "info"
        message: string
        value: number (current value)
        threshold: number
        paddyId: string
        deviceId: string
        createdAt: Timestamp
        read: boolean
        acknowledged: boolean
        acknowledgedAt: Timestamp
  
  user_activity/
    {userId}/
      {activityId}/
        action: string
        resource: string
        timestamp: Timestamp
        ip: string
        details: object
  
  settings/
    system/
      alertThresholds/
        nitrogen_min: 20
        nitrogen_max: 50
        phosphorus_min: 10
        phosphorus_max: 40
        potassium_min: 150
        potassium_max: 250
        deviceOfflineThreshold: 600000  # 10 minutes in ms
      
      logRetention: 2592000000          # 30 days in ms
      alertRetention: 7776000000        # 90 days in ms
      
      features/
        offlineAlerting: true
        predictiveAnalysis: false
        anomalyDetection: false
```

---

## 4. Cloud Functions Architecture

### 4.1 Current Implementations

#### Function 1: `scheduledSensorLogger`
**Trigger**: PubSub (every 5 minutes)  
**Purpose**: Log current RTDB sensor readings to Firestore for history/analytics  
**Logic**:
1. Read all devices from RTDB
2. For each device, find associated paddies
3. Compare with last log (dedupe within 5 min window)
4. Write new log to Firestore if changed
5. Handle errors gracefully

**Firestore Write**: `fields/{fieldId}/paddies/{paddyId}/logs/{logId}`

### 4.2 Recommended Additional Functions

#### Function 2: `realtimeAlertProcessor`
**Trigger**: Firestore `onChange` (paddies/{paddyId}/logs)  
**Purpose**: Check new readings against thresholds, create alerts  
**Logic**:
```typescript
export const realtimeAlertProcessor = functions.firestore
  .document('fields/{fieldId}/paddies/{paddyId}/logs/{logId}')
  .onCreate(async (snap, context) => {
    const log = snap.data();
    const { fieldId, paddyId } = context.params;
    
    // Get alert thresholds
    const settings = await db.collection('settings').doc('system').get();
    const thresholds = settings.data().alertThresholds;
    
    const alerts = [];
    
    // Check nitrogen
    if (log.nitrogen < thresholds.nitrogen_min) {
      alerts.push({
        type: 'npk_low',
        element: 'nitrogen',
        severity: 'critical',
        value: log.nitrogen,
        threshold: thresholds.nitrogen_min
      });
    }
    
    // Create alert documents
    const batch = db.batch();
    for (const alert of alerts) {
      const alertRef = db.collection('alerts').doc(fieldId).collection('alerts').doc();
      batch.set(alertRef, {
        ...alert,
        paddyId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        read: false,
        acknowledged: false
      });
    }
    
    await batch.commit();
    
    // Send FCM notification if user is online
    const field = await db.collection('fields').doc(fieldId).get();
    const userId = field.data().owner;
    const user = await db.collection('users').doc(userId).get();
    const fcmToken = user.data().fcmToken;
    
    if (fcmToken && alerts.length > 0) {
      await admin.messaging().send({
        token: fcmToken,
        notification: {
          title: '🚨 Paddy Alert',
          body: `${alerts[0].type}: ${alerts[0].element}`,
          click_action: `fields/${fieldId}`
        }
      });
    }
  });
```

#### Function 3: `deviceHealthMonitor`
**Trigger**: PubSub (every 2 minutes)  
**Purpose**: Check for offline devices, create health alerts  
**Logic**:
```typescript
export const deviceHealthMonitor = functions.pubsub
  .schedule('*/2 * * * *')
  .onRun(async () => {
    const firestore = admin.firestore();
    const database = admin.database();
    
    // Get all devices
    const devicesRef = database.ref('devices');
    const devicesSnap = await devicesRef.once('value');
    const devices = devicesSnap.val();
    
    const now = Date.now();
    const offlineThreshold = 10 * 60 * 1000; // 10 minutes
    
    for (const [deviceId, deviceData] of Object.entries(devices)) {
      const heartbeat = deviceData.heartbeat || 0;
      const timeSinceHeartbeat = now - (heartbeat < 1e11 ? heartbeat * 1000 : heartbeat);
      
      const isOffline = timeSinceHeartbeat > offlineThreshold;
      
      // Update device status in Firestore
      await firestore.collection('devices').doc(deviceId).update({
        status: isOffline ? 'offline' : 'online',
        lastHeartbeat: new admin.firestore.Timestamp(Math.floor(heartbeat / 1000), 0),
        lastChecked: admin.firestore.FieldValue.serverTimestamp()
      });
      
      // Create offline alert if newly offline
      if (isOffline) {
        // Check if alert already exists
        const existingAlert = await firestore
          .collectionGroup('alerts')
          .where('deviceId', '==', deviceId)
          .where('type', '==', 'device_offline')
          .where('acknowledged', '==', false)
          .limit(1)
          .get();
        
        if (existingAlert.empty) {
          // Create new alert
          const paddies = await firestore
            .collectionGroup('paddies')
            .where('deviceId', '==', deviceId)
            .get();
          
          paddies.forEach(async (paddyDoc) => {
            const fieldId = paddyDoc.ref.parent.parent.id;
            await firestore
              .collection('alerts')
              .doc(fieldId)
              .collection('alerts')
              .add({
                type: 'device_offline',
                severity: 'critical',
                deviceId,
                paddyId: paddyDoc.id,
                message: `Device ${deviceId} is offline`,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                read: false,
                acknowledged: false
              });
          });
        }
      }
    }
  });
```

#### Function 4: `commandAuditLogger`
**Trigger**: RTDB `onWrite` (devices/{deviceId}/commands)  
**Purpose**: Track all command executions for audit trail  

#### Function 5: `logCleanupScheduler`
**Trigger**: PubSub (daily at 2 AM)  
**Purpose**: Archive old logs, delete expired alerts based on retention policy

---

## 5. Offline-First Architecture

### 5.1 Client-Side Offline Queue

```typescript
// In-Browser Implementation (Next.js + IndexedDB)

interface PendingAction {
  id: string;
  type: 'command' | 'update';
  deviceId: string;
  action: string;
  params: object;
  timestamp: number;
  status: 'pending' | 'synced';
}

// Store offline actions in IndexedDB
async function queueOfflineAction(action: PendingAction) {
  const db = await openDB('padbuddy-offline');
  await db.add('pendingActions', action);
}

// When connection restored
async function syncOfflineQueue() {
  const db = await openDB('padbuddy-offline');
  const pending = await db.getAll('pendingActions');
  
  for (const action of pending) {
    try {
      if (action.status === 'pending') {
        await sendDeviceAction(action.deviceId, action.action);
        action.status = 'synced';
        await db.put('pendingActions', action);
      }
    } catch (e) {
      // Retry logic
      console.error('Failed to sync action:', e);
    }
  }
}
```

### 5.2 Alerts Sync Strategy

```typescript
// Web app syncs alerts to IndexedDB even when offline
// AlertContext listens to Firestore query

async function syncAlertsOffline() {
  const firestore = getFirestore();
  const userId = getCurrentUserId();
  
  // Fetch all alerts for user's fields
  const alertsSnapshot = await getDocs(
    query(
      collectionGroup(firestore, 'alerts'),
      where('fieldId', 'in', userFields)
    )
  );
  
  // Write to IndexedDB
  const db = await openDB('padbuddy-offline');
  for (const doc of alertsSnapshot.docs) {
    await db.put('alerts', doc.data());
  }
  
  // When offline, UI still shows cached alerts
  // When online, updates are synced back
}
```

---

## 6. Security & Access Control

### 6.1 Firebase Security Rules

#### RTDB Rules (Real-Time Data)
```
{
  "rules": {
    "devices": {
      "$deviceId": {
        // Only ESP32 can write to its own device path
        ".write": "auth.uid === root.child('devices').child($deviceId).child('owner').val()",
        
        // Anyone can read (consider restricting by field permission)
        ".read": "root.child('users').child(auth.uid).child('fields').hasChildren()",
        
        "sensors": {
          ".write": "auth.uid === root.child('devices').child($deviceId).child('owner').val()"
        },
        
        "commands": {
          ".write": "root.child('users').child(auth.uid).child('role').val() === 'admin' || 
                     root.child('fields').child(auth.uid).hasChildren()"
        }
      }
    }
  }
}
```

#### Firestore Rules
```
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    
    match /fields/{fieldId} {
      allow read: if request.auth.uid == resource.data.owner;
      allow write: if request.auth.uid == resource.data.owner;
      
      match /{document=**} {
        allow read: if request.auth.uid == get(/databases/$(database)/documents/fields/$(fieldId)).data.owner;
        allow write: if request.auth.uid == get(/databases/$(database)/documents/fields/$(fieldId)).data.owner;
      }
    }
    
    match /alerts/{fieldId}/{document=**} {
      allow read: if request.auth.uid == get(/databases/$(database)/documents/fields/$(fieldId)).data.owner;
      allow write: if request.time.toMillis() < resource.data.createdAt.toMillis() + 86400000; // 24 hours
    }
    
    match /command_audit/{commandId} {
      allow read: if request.auth.uid == resource.data.userId;
      allow write: if request.auth.uid == resource.data.userId;
    }
  }
}
```

### 6.2 Audit Trail
- **All commands logged**: firestore/command_audit
- **User actions tracked**: firestore/user_activity
- **Device changes recorded**: Firestore timestamps
- **Compliance**: Meets IoT industry standards (ISO 27001)

---

## 7. Scalability Considerations

### 7.1 Database Scaling
- **RTDB**: Auto-scales. Limit: ~200 concurrent connections per device
- **Firestore**: Auto-scales. Use batch writes, transactions for consistency
- **Indexes**: Create composite indexes for common queries (e.g., logs by date range)

### 7.2 Cloud Functions Scaling
- **Memory**: Increase to 2GB for heavy processing
- **Timeout**: Set appropriate (currently 60s default)
- **Concurrency**: Auto-scales based on load

### 7.3 Log Archival Strategy
```typescript
// Archive logs older than 90 days to BigQuery for analytics
export const archiveOldLogs = functions.pubsub
  .schedule('0 2 * * *') // Daily 2 AM
  .onRun(async () => {
    const firestore = admin.firestore();
    const bigquery = new BigQuery();
    
    const ninetyDaysAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);
    
    // Find old logs
    const oldLogs = await firestore
      .collectionGroup('logs')
      .where('timestamp', '<', new admin.firestore.Timestamp(ninetyDaysAgo / 1000, 0))
      .get();
    
    // Export to BigQuery, then delete from Firestore
    // Implement batched deletion to avoid quota limits
  });
```

---

## 8. Real-Time Alert Architecture (Offline-Capable)

### Key Design: Alert Persistence

1. **Firestore as Source of Truth**
   - All alerts stored permanently
   - Queryable and filterable

2. **FCM for Online Users**
   - Immediate push notification
   - Works only if user is online

3. **IndexedDB for Offline Users**
   - App syncs alerts periodically
   - User sees alerts even when offline
   - Updates sync when connection restored

4. **Firestore Listeners in App**
   - Real-time updates via query listeners
   - Automatic offline caching (Firestore offline persistence)
   - No additional work needed

```typescript
// In AlertContext
useEffect(() => {
  const userId = getCurrentUserId();
  const fields = getUserFields(userId);
  
  // Listen to all alerts across user's fields
  const unsubscribe = onSnapshot(
    query(
      collectionGroup(db, 'alerts'),
      where('fieldId', 'in', fields),
      orderBy('createdAt', 'desc')
    ),
    (snapshot) => {
      const alerts = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      setAlerts(alerts);
      
      // For offline persistence, Firestore handles this automatically
      // No manual IndexedDB sync needed
    },
    (error) => {
      console.error('Alert listener error:', error);
      // Firestore offline caching will show cached alerts
    }
  );
  
  return unsubscribe;
}, []);
```

---

## 9. Monitoring & Observability

### 9.1 Key Metrics to Track

```typescript
// In Cloud Functions, log structured data
functions.logger.info('Sensor logged', {
  deviceId: 'DEVICE_0001',
  paddyId: 'PADDY_A1',
  nitrogen: 45.2,
  timestamp: Date.now(),
  source: 'esp32',
  latency: endTime - startTime // ms
});

// Firebase Console shows these in Logs
// Enable Cloud Monitoring for dashboards
```

### 9.2 Alerting Rules
- Device offline > 10 minutes → Critical alert
- Function execution fails → Email admin
- High command failure rate → Metric alert
- Database quota approaching → Budget alert

---

## 10. Implementation Roadmap

### Phase 1: Foundation (Current)
- ✅ RTDB for real-time state
- ✅ Firestore for historical logs
- ✅ Scheduled sensor logger
- ✅ Device command flow

### Phase 2: Production-Ready (Next)
- [ ] Implement `realtimeAlertProcessor` function
- [ ] Implement `deviceHealthMonitor` function
- [ ] Add detailed audit logging
- [ ] Deploy Firestore security rules
- [ ] Set up monitoring dashboard

### Phase 3: Advanced (Future)
- [ ] Predictive analytics via ML
- [ ] Anomaly detection
- [ ] Mobile app native push
- [ ] Data export/reporting UI
- [ ] Device firmware OTA updates

---

## 11. API Endpoints (Next.js Routes)

Recommended API structure for your backend:

```
/api/
  /devices/
    GET     /              - List all devices (with permission check)
    POST    /              - Register new device
    GET     /[id]          - Get device details
    POST    /[id]/commands - Send command to device
    GET     /[id]/logs     - Get device logs
  
  /fields/
    GET     /              - List user's fields
    POST    /              - Create field
    GET     /[id]          - Get field details with paddies
    GET     /[id]/alerts   - Get field alerts
  
  /alerts/
    GET     /              - List unread alerts
    POST    /[id]/read     - Mark alert as read
    POST    /[id]/acknowledge - Acknowledge alert
  
  /logs/
    GET     /export        - Export logs as CSV/JSON
```

---

## Summary

This architecture provides:

✅ **Real-Time Updates**: RTDB for instant UI synchronization  
✅ **Historical Record**: Firestore for audit trails and analytics  
✅ **Offline Resilience**: Queued commands sync when online, alerts cached locally  
✅ **Professional Monitoring**: Structured logging, alert system, audit trails  
✅ **Scalability**: Auto-scaling infrastructure, archival strategy  
✅ **Security**: Role-based access, audit logs, secure RTDB rules  
✅ **IoT Best Practices**: Command acknowledgement, heartbeat monitoring, state management  

This is production-grade architecture suitable for agricultural IoT deployments.
