# System Architecture Diagrams

## 1. Complete Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          PADBUDDY IoT SYSTEM FLOW                            │
└─────────────────────────────────────────────────────────────────────────────┘

                              HARDWARE LAYER
                         ┌────────────────────┐
                         │   ESP32 Devices    │
                         │  (Multiple Units)  │
                         └─────────┬──────────┘
                                   │
                    ┌──────────────┼──────────────┐
                    │              │              │
            Every 60s       Every 5-10s      Relay/Motors
            Heartbeat       Sensor Data       Control
                    │              │              │
                    ▼              ▼              ▼
        ┌─────────────────────────────────────────────────┐
        │      FIREBASE REALTIME DATABASE (RTDB)           │
        │  - Fast & Live (100ms latency)                   │
        │  - Current device state only                     │
        │  - Expires after 30 days                         │
        │                                                   │
        │  devices/{id}/                                   │
        │    ├─ heartbeat: timestamp                       │
        │    ├─ sensors/: {N, P, K, lastUpdate}           │
        │    ├─ commands/{node}/: {action, ack, status}   │
        │    └─ location/: {lat, lon}                     │
        │                                                   │
        │  Web App listens in real-time for UI updates    │
        └────────────┬──────────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
    Every 5 min            Real-time listener
        │                         │
        ▼                         ▼
 ┌──────────────────┐     ┌─────────────────┐
 │ scheduledSensor  │     │  Web Application │
 │   Logger         │     │  (Next.js)       │
 │ Cloud Function   │     │  Updates UI      │
 │                  │     │  in real-time    │
 └────────┬─────────┘     └────────┬────────┘
          │                        │
          │ Reads RTDB             │ Shows current readings
          │ Finds paddies          │ Allows user control
          │ Deduplicates logs      │ Sends commands
          │                        │
          ▼                        │
 ┌──────────────────────────────────────────────────────┐
 │    FIRESTORE (Persistent Historical Database)        │
 │  - Queryable & Indexed                               │
 │  - 30+ day retention                                 │
 │  - Real-time listeners enabled                       │
 │                                                      │
 │  fields/{fieldId}/paddies/{paddyId}/                │
 │    └─ logs/{logId}/                                 │
 │       ├─ nitrogen, phosphorus, potassium            │
 │       ├─ timestamp (Firestore server timestamp)      │
 │       └─ source: "firebase-scheduled"               │
 │                                                      │
 │  [NEW LOG CREATED] ──────────┐                      │
 └──────────────────────────────┼──────────────────────┘
                                │
                    ┌───────────┴──────────┐
                    │                      │
                    ▼                      ▼
          ┌──────────────────────┐   Every 2 min
          │ realtimeAlertProcesso│
          │  Cloud Function      │
          │                      │   ┌────────────────────┐
          │ - Read new log       │   │ deviceHealthMonitor│
          │ - Get thresholds     │   │ Cloud Function     │
          │ - Check N, P, K      │   │                    │
          │ - Create alert       │   │ - Read all devices │
          │ - Send FCM           │   │ - Check heartbeat  │
          │                      │   │ - Create offline   │
          └──────────┬───────────┘   │   alerts           │
                     │               │ - Update status    │
                     │               └────────┬───────────┘
                     │                        │
                     ▼                        ▼
          ┌───────────────────────────────────────────┐
          │  alerts/{fieldId}/alerts/{alertId}/        │
          │                                            │
          │  ├─ type: npk_low | npk_high | offline    │
          │  ├─ severity: critical | warning | info   │
          │  ├─ message: "Nitrogen too low"           │
          │  ├─ value: 8.0                            │
          │  ├─ threshold: 20                         │
          │  ├─ createdAt: timestamp                  │
          │  ├─ read: false                           │
          │  └─ acknowledged: false                   │
          │                                            │
          │  ALSO UPDATES:                            │
          │  devices/{id}.status = "offline"          │
          └────────┬──────────────────────────────────┘
                   │
        ┌──────────┴──────────────┐
        │                         │
        ▼                         ▼
   [If Online]          [If Offline or Async]
   Send FCM Push        Store in Firestore
   Notification         (synced via offline
                         persistence)
        │                         │
        └──────────┬──────────────┘
                   │
                   ▼
          ┌────────────────────────┐
          │   Web App Alert UI     │
          │                        │
          │ ┌──────────────────┐  │
          │ │ AlertBadge       │  │ Shows unread count
          │ │ "🔴 3 unread"    │  │ in header
          │ └──────────────────┘  │
          │                        │
          │ ┌──────────────────┐  │
          │ │ AlertBanner      │  │ Sticky notification
          │ │ "🚨 CRITICAL"    │  │ at top
          │ └──────────────────┘  │
          │                        │
          │ ┌──────────────────┐  │
          │ │ AlertPanel       │  │ Full list sidebar
          │ │ [Alert 1]        │  │
          │ │ [Alert 2]        │  │
          │ └──────────────────┘  │
          │                        │
          │ User Actions:          │
          │ ├─ Click "Acknowledge" │
          │ ├─ Click "Dismiss"     │
          │ └─ View Details        │
          └────────┬───────────────┘
                   │
                   ▼
          Updates Firestore:
          alert.read = true
          alert.acknowledged = true
          alert.acknowledgedAt = now()

                   Daily 2 AM
                   │
                   ▼
          ┌──────────────────────┐
          │ alertCleanupScheduler│
          │ Cloud Function       │
          │                      │
          │ Delete alerts older  │
          │ than 90 days         │
          └──────────────────────┘
```

---

## 2. Control Command Flow (ESP32 ← Web App)

```
┌─────────────────────────────────────────────────────────────────┐
│              DEVICE CONTROL COMMAND FLOW                         │
└─────────────────────────────────────────────────────────────────┘

User clicks "Spray Now"
in Web App
        │
        ▼
┌──────────────────────────┐
│  performDeviceAction()   │
│  (ControlPanelTab.tsx)   │
└────────────┬─────────────┘
             │
             ├─ Validate user permissions
             ├─ Create action object
             └─ Send to Firebase
                     │
                     ▼
        ┌────────────────────────────┐
        │   RTDB: devices/{id}       │
        │                            │
        │   commands/{nodeId}:       │
        │   {                        │
        │     action: "spray_pump_on"│
        │     params: {...}          │
        │     ack: false             │
        │     status: "pending"      │
        │     timestamp: now()       │
        │   }                        │
        │                            │
        │ + Log to Firestore:        │
        │   command_audit/{id}       │
        │   (commandAuditLogger)     │
        └────────────┬───────────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
   Web App waiting            ESP32 Listening
   (real-time listener)       (RTDB listener)
        │                         │
        │                         ▼
        │              Device receives command
        │              from RTDB
        │                         │
        │                         ├─ Validate action
        │                         ├─ Safety checks
        │                         └─ Set actionTaken = true
        │                             (acknowledgement)
        │                         │
        ▼                         ▼
  Web App sees:          RTDB: devices/{id}
  actionTaken = true     {
  Shows "Executing..."     actionTaken: true
                           status: "executing"
                         }
        │                         │
        │                         ├─ Execute relay command
        │                         │  (activate motor/valve)
        │                         │
        │                         ├─ Monitor operation
        │                         │  (typically 5-30 seconds)
        │                         │
        │                         └─ Verify execution
        │                             Set status = "done"
        │                         │
        ▼                         ▼
  Web App sees:          RTDB: devices/{id}
  status = "done"        {
  Shows "✅ Completed"      action: "done"
                           status: "completed"
                           executedAt: timestamp
                           result: {...}
                         }
                             │
                             ▼
                         Also updates
                         command_audit log
                         with completion time

Total Time: ~5-30 seconds
├─ Send: 100ms
├─ ESP32 receive & ack: 500-1000ms
├─ Execute: 5-20s
└─ Update & confirm: 1-5s
```

---

## 3. Device Status Monitoring

```
┌──────────────────────────────────────────────────────────┐
│       DEVICE HEALTH MONITORING FLOW                      │
└──────────────────────────────────────────────────────────┘

ESP32 Device Status Flow:
                                              
ONLINE                              OFFLINE
 ✓ Heartbeat sent                    ✗ No heartbeat update
   every 60 seconds                    for > 10 minutes
   └─ RTDB: devices/{id}.heartbeat
      = current timestamp


Every 2 Minutes:
deviceHealthMonitor Cloud Function triggers
        │
        ├─ Get all devices from RTDB
        ├─ Check: (now() - lastHeartbeat) > 10 min?
        │
        ├─ IF YES (device offline):
        │  ├─ Update Firestore: devices/{id}.status = "offline"
        │  ├─ Find paddies using this device
        │  ├─ Create alert in alerts/{fieldId}/alerts/
        │  │  {
        │  │    type: "device_offline",
        │  │    severity: "critical",
        │  │    message: "Device {id} is offline",
        │  │    read: false,
        │  │    acknowledged: false
        │  │  }
        │  └─ Trigger alert UI in web app
        │
        └─ IF NO (device still online):
           └─ Update Firestore: devices/{id}.status = "online"


Monitoring Dashboard
        │
        ├─ Fetches devices/{id}.status
        │  ├─ Shows green circle if "online"
        │  └─ Shows red circle if "offline"
        │
        ├─ Shows last heartbeat time
        │  ├─ "2 minutes ago" (online)
        │  └─ "15 minutes ago" (OFFLINE!)
        │
        └─ Shows offline alerts
           └─ "Device DEVICE_001 is offline"
              └─ User can acknowledge


Recovery:
Device powers back on / reconnects
        │
        ├─ Sends heartbeat to RTDB
        │
        ├─ Next health check (2 min):
        │  └─ Sees recent heartbeat
        │  └─ Updates status = "online"
        │
        └─ Old offline alert remains
           (but marked acknowledged)
           (or auto-dismissed if
            device comes online)
```

---

## 4. Alert Severity Levels

```
┌──────────────────────────────────────────────────────────┐
│           ALERT SEVERITY & RESPONSE                      │
└──────────────────────────────────────────────────────────┘

CRITICAL ALERTS
├─ NPK too low (below minimum)
│  └─ Action: Add fertilizer immediately
│  └─ Color: 🔴 Red
│  └─ Notification: Instant push + sticky banner
│  └─ Requires: Explicit acknowledgement
│
├─ Device offline (no heartbeat > 10 min)
│  └─ Action: Check device power/connection
│  └─ Color: 🔴 Red
│  └─ Notification: Instant push + sticky banner
│  └─ Requires: Explicit acknowledgement
│
└─ Water level critical
   └─ Action: Check irrigation system
   └─ Color: 🔴 Red
   └─ Notification: Instant push + sticky banner
   └─ Requires: Explicit acknowledgement


WARNING ALERTS
├─ NPK too high (above maximum)
│  └─ Action: Reduce fertilizer application
│  └─ Color: 🟠 Orange
│  └─ Notification: Push notification only
│  └─ Requires: Simple dismiss
│
└─ Anomaly detected
   └─ Action: Review readings for sensor malfunction
   └─ Color: 🟠 Orange
   └─ Notification: Push notification only
   └─ Requires: Simple dismiss


INFO ALERTS
└─ System events
   └─ Color: 🔵 Blue
   └─ Notification: No push, appears in list
   └─ Requires: Simple dismiss


UI Representation:

┌─ AlertBadge (Header)
│  └─ Shows count: "🔴 3" (critical alerts unread)
│
├─ AlertBanner (Sticky at top)
│  └─ Shows most critical unacknowledged alert
│  └─ Dismissible but keeps showing until acknowledged
│
├─ AlertPanel (Sidebar/Page)
│  └─ Lists all alerts
│  └─ Sorted: critical unacknowledged first
│  └─ Each has: Acknowledge button + Dismiss button
│
└─ AlertStats (Dashboard)
   └─ Total: 15
   └─ Critical: 2 🔴
   └─ Warning: 5 🟠
   └─ Unacknowledged: 7
```

---

## 5. Technology Stack

```
┌──────────────────────────────────────────────────────────┐
│             PADBUDDY TECHNOLOGY STACK                    │
└──────────────────────────────────────────────────────────┘

FRONTEND
┌──────────────────────────────────┐
│  React + Next.js 14              │
│  ├─ TypeScript                   │
│  ├─ Tailwind CSS                 │
│  └─ shadcn/ui components         │
│                                  │
│  Features:                       │
│  ├─ Real-time listeners          │
│  ├─ Offline persistence          │
│  ├─ PWA support                  │
│  └─ Push notifications           │
└──────────────────────────────────┘


BACKEND
┌──────────────────────────────────┐
│  Firebase Cloud Functions        │
│  ├─ Node.js 20                   │
│  ├─ TypeScript                   │
│  ├─ Firebase Admin SDK           │
│  └─ 5 serverless functions       │
│                                  │
│  Triggers:                       │
│  ├─ PubSub scheduler             │
│  ├─ Firestore onCreate           │
│  ├─ RTDB onWrite                 │
│  └─ HTTP endpoints               │
└──────────────────────────────────┘


DATABASES
┌──────────────────────────────────┐
│  Firebase Realtime Database      │
│  ├─ Real-time state              │
│  ├─ Device sensors & commands    │
│  ├─ ~100ms latency               │
│  └─ 30-day retention             │
│                                  │
│  Google Cloud Firestore          │
│  ├─ Persistent storage           │
│  ├─ Queryable collections        │
│  ├─ Composite indexes            │
│  └─ Unlimited retention          │
│                                  │
│  Firebase Authentication         │
│  ├─ Email/password               │
│  ├─ Session persistence          │
│  └─ Security rules               │
│                                  │
│  Firebase Cloud Messaging        │
│  ├─ Push notifications           │
│  ├─ Real-time delivery           │
│  └─ Offline caching              │
└──────────────────────────────────┘


HARDWARE
┌──────────────────────────────────┐
│  ESP32 Microcontroller           │
│  ├─ NPK sensor module            │
│  ├─ WiFi connectivity            │
│  ├─ Relay/motor control          │
│  ├─ GPS module (optional)        │
│  └─ Firebase library             │
│                                  │
│  Sensors:                        │
│  ├─ Nitrogen (mg/kg)             │
│  ├─ Phosphorus (mg/kg)           │
│  ├─ Potassium (mg/kg)            │
│  └─ Temperature/Humidity (opt)   │
│                                  │
│  Controls:                       │
│  ├─ Pump relays                  │
│  ├─ Motor controllers            │
│  └─ Valve actuators              │
└──────────────────────────────────┘


MONITORING
┌──────────────────────────────────┐
│  Firebase Console                │
│  ├─ Real-time database viewer    │
│  ├─ Firestore explorer           │
│  ├─ Cloud Functions logs         │
│  └─ Billing & usage              │
│                                  │
│  Google Cloud Monitoring         │
│  ├─ Function execution metrics   │
│  ├─ Performance dashboards       │
│  ├─ Alerting rules               │
│  └─ Quota monitoring             │
└──────────────────────────────────┘
```

---

## 6. Deployment Architecture

```
┌──────────────────────────────────────────────────────────┐
│         PRODUCTION DEPLOYMENT ARCHITECTURE                │
└──────────────────────────────────────────────────────────┘

Development
    │
    ├─ Local Firebase Emulator
    │  └─ Test RTDB, Firestore, Functions locally
    │
    └─ npm run serve
       └─ Run functions on localhost:5001

Staging/Testing
    │
    └─ Firebase Project (same as prod)
       ├─ Test data in RTDB
       ├─ Test collections in Firestore
       └─ Deploy functions in draft mode

Production
    │
    ├─ Firebase Project
    │  ├─ Multi-region support (Asia-SE1)
    │  ├─ Automatic scaling
    │  ├─ 99.95% uptime SLA
    │  └─ Backups automatic
    │
    ├─ Cloud Functions
    │  ├─ 5 production functions
    │  ├─ Auto-scaling (0-3000 concurrent)
    │  ├─ Timeout: 60 seconds
    │  ├─ Memory: 256MB default (512MB for sensor logger)
    │  └─ Cold start: ~2 seconds
    │
    ├─ Web App (Vercel)
    │  ├─ Next.js deployment
    │  ├─ Edge caching
    │  ├─ CDN global
    │  └─ Auto-scaling
    │
    └─ Monitoring
       ├─ Firebase Logs
       ├─ Cloud Monitoring Dashboards
       ├─ Error reporting
       └─ Performance monitoring

Cost Breakdown (Monthly)
├─ Cloud Functions: FREE (1st 2M invocations)
├─ Firestore: $1-5 (reads/writes)
├─ RTDB: $1 (network egress)
├─ Cloud Messaging: FREE
├─ Cloud Storage: FREE
├─ Vercel: $20 (Pro plan)
└─ Total: ~$25-30/month
```

---

This visual guide helps you understand:
- How data flows from devices to web app
- When each Cloud Function triggers
- How alerts are created and displayed
- Device status monitoring
- System components & deployment

Keep these diagrams as reference during development!
