# PadBuddy Firestore + RTDB Layered Architecture
## Complete Technical Specification

---

## 📐 Architecture Overview

PadBuddy uses a **layered architecture** combining **Firestore** for persistent data and **Realtime Database (RTDB)** for live device communication.

```
┌─────────────────────────────────────────────────────────────┐
│                      FRONTEND LAYER                         │
│  (Next.js/React - UI, state management, user interactions)  │
└──────────────────────┬──────────────────────────────────────┘
                       │
        ┌──────────────┴──────────────┐
        │                             │
        ▼                             ▼
┌───────────────────┐        ┌────────────────────┐
│  FIRESTORE        │        │  RTDB              │
│  (Persistent)     │        │  (Real-time)       │
├───────────────────┤        ├────────────────────┤
│ • Users           │        │ • Heartbeat        │
│ • Fields          │        │ • Live Commands    │
│ • Devices         │        │ • NPK Readings     │
│   ├─ Logs         │        │ • GPS Data         │
│   └─ Schedules    │        │                    │
└───────────────────┘        └────────────────────┘
        │                             │
        └──────────────┬──────────────┘
                       │
                       ▼
        ┌──────────────────────────────┐
        │   FIREBASE FUNCTIONS          │
        │  (Serverless Backend)         │
        ├──────────────────────────────┤
        │ • Heartbeat Monitor           │
        │ • Command Logger              │
        │ • Scheduled Commands          │
        │ • Sensor Logger (every 5 min) │
        │ • Notifications               │
        └──────────────────────────────┘
                       │
                       ▼
        ┌──────────────────────────────┐
        │      ESP32 DEVICES            │
        │  (IoT Hardware)               │
        └──────────────────────────────┘
```

---

## 1️⃣ USERS COLLECTION

### Path
```
/users/{userId}
```

### Purpose
Store user profiles, statistics, references to owned fields and devices, and notifications.

### Document Structure
```typescript
{
  displayName: string;              // e.g., "John Doe"
  email: string;                    // e.g., "john@example.com"
  photoURL?: string;                // Optional profile photo
  createdAt: number;                // Timestamp (milliseconds)
  
  // Ownership tracking (optional)
  fieldsOwned?: string[];           // ["field_001", "field_002"]
  devicesOwned?: string[];          // ["DEVICE_0005", "DEVICE_0006"]
  
  // Statistics (optional)
  statistics?: {
    totalFields: number;            // Count of fields
    totalDevices: number;           // Count of devices
  };
  
  // In-app notifications (optional)
  notifications?: Array<{
    type: "offline" | "commandFailed" | "system";
    message: string;
    timestamp: number;
    read: boolean;
  }>;
}
```

### Key Points
- ✅ Central user profile
- ✅ Quick reference to owned fields and devices
- ✅ In-app notification history (last 50)
- ✅ Statistics for dashboard display

### Example Document
```json
{
  "displayName": "Juan Dela Cruz",
  "email": "juan@farm.com",
  "photoURL": "https://example.com/juan.jpg",
  "createdAt": 1672531200000,
  "fieldsOwned": ["field_abc123", "field_def456"],
  "devicesOwned": ["DEVICE_0005", "DEVICE_0007"],
  "statistics": {
    "totalFields": 2,
    "totalDevices": 2
  },
  "notifications": [
    {
      "type": "offline",
      "message": "DEVICE_0005 went offline",
      "timestamp": 1672617600000,
      "read": false
    }
  ]
}
```

---

## 2️⃣ FIELDS COLLECTION

### Path
```
/fields/{fieldId}
```

### Purpose
Represents a rice field. Users create fields and attach devices. Supports optional planting info and polygon plotting for map visualization.

### Document Structure
```typescript
{
  ownerId: string;                  // User ID who owns this field
  name: string;                     // e.g., "North Rice Field"
  description?: string;             // Optional field description
  
  // Rice cultivation details (all optional)
  variety?: string;                 // e.g., "IR64", "PSB Rc82"
  plantingType?: "transplant" | "direct" | "sabog";
  startDate?: number;               // Planting start timestamp
  
  // Device tracking
  devices?: string[];               // ["DEVICE_0005", "DEVICE_0006"]
  
  // Map plotting (optional)
  plot?: Array<{
    lat: number;
    lng: number;
  }>;                               // Polygon points for area calculation
  
  createdAt: number;                // Creation timestamp
}
```

### Key Points
- ✅ Top-level collection (not nested under users)
- ✅ References user via `ownerId`
- ✅ Maintains array of attached devices
- ✅ Optional polygon for map visualization and area calculation
- ✅ Extensible with optional fields

### Example Document
```json
{
  "ownerId": "user_abc123",
  "name": "Northern Rice Paddy",
  "description": "Near irrigation canal",
  "variety": "IR64",
  "plantingType": "transplant",
  "startDate": 1672531200000,
  "devices": ["DEVICE_0005"],
  "plot": [
    { "lat": 14.5995, "lng": 120.9842 },
    { "lat": 14.5996, "lng": 120.9845 },
    { "lat": 14.5998, "lng": 120.9844 },
    { "lat": 14.5997, "lng": 120.9841 }
  ],
  "createdAt": 1672531200000
}
```

---

## 3️⃣ DEVICES COLLECTION

### Path
```
/devices/{deviceId}
```

### Purpose
Represents hardware devices (ESP32 controllers). Includes connection status, location, optional plot, and subcollections for logs and schedules.

### Document Structure
```typescript
{
  ownerId: string;                  // User who owns this device
  fieldId?: string;                 // Optional field assignment
  
  name: string;                     // e.g., "Relay Controller"
  deviceType: string;               // e.g., "ESP32"
  deviceId: string;                 // e.g., "DEVICE_0005"
  description?: string;             // Optional description
  
  // Connection status
  connected: boolean;               // true = online, false = offline
  lastHeartbeat: number;            // Last heartbeat timestamp
  
  // Location (optional)
  location?: {
    lat: number;
    lng: number;
  };
  
  // Map plotting (optional)
  plot?: Array<{
    lat: number;
    lng: number;
  }>;
  
  createdAt: number;                // Creation timestamp
}
```

### Subcollections

#### 3a) **Logs** - `/devices/{deviceId}/logs/{logId}`
Audit trail for all device actions (live commands, scheduled commands, system events).

```typescript
{
  type: "live" | "scheduled" | "system";
  command: string;                  // e.g., "relay2_ON"
  requestedState: string;           // e.g., "ON"
  actualState: string;              // e.g., "ON"
  success: boolean;                 // true/false
  timestamp: number;                // When command was executed
  commandId: string;                // Unique command ID
  functionTriggered?: string;       // e.g., "scheduledCommandFunction"
  userId: string;                   // Who triggered the command
}
```

#### 3b) **Schedules** - `/devices/{deviceId}/schedules/{scheduleId}`
Stores scheduled commands for future execution.

```typescript
{
  relay: number;                    // Relay number (1-4)
  action: "ON" | "OFF";
  scheduledTime: number;            // Future timestamp
  status: "pending" | "executed" | "failed";
  createdBy: string;                // User ID
  executedAt?: number | null;       // Execution timestamp (if executed)
}
```

### Key Points
- ✅ **Top-level collection** for global device access
- ✅ Device-centric logging (logs live under device)
- ✅ Schedules managed per device
- ✅ Connection status tracked via `lastHeartbeat`
- ✅ Optional GPS location and polygon plot
- ✅ Extensible for new device types

### Example Device Document
```json
{
  "ownerId": "user_abc123",
  "fieldId": "field_xyz789",
  "name": "4-Channel Relay",
  "deviceType": "ESP32",
  "deviceId": "DEVICE_0005",
  "description": "Controls irrigation pump",
  "connected": true,
  "lastHeartbeat": 1672617600000,
  "location": {
    "lat": 14.5995,
    "lng": 120.9842
  },
  "createdAt": 1672531200000
}
```

---

## 4️⃣ REALTIME DATABASE (RTDB) LAYER

### Purpose
Handle **live device communication** across networks in real-time. ESP32 devices stream commands and send heartbeat.

### Structure

#### Device Root
```
/devices/{deviceId}
```

#### Heartbeat
```
/devices/{deviceId}/heartbeat
{
  lastSeen: 1672617600000,          // Timestamp (milliseconds)
  status: "online" | "offline",
  deviceName: "Relay_Controller"
}
```

#### Commands
```
/devices/{deviceId}/commands/{commandId}
{
  commandId: "cmd_001",
  relay: 2,
  requestedState: "ON",
  timestamp: 1672617600000,
  status: "pending" | "acknowledged" | "executed" | "failed",
  result?: "Success"
}
```

#### NPK Sensor Data
```
/devices/{deviceId}/npk
{
  n: 45,                            // Nitrogen (ppm)
  p: 22,                            // Phosphorus (ppm)
  k: 38,                            // Potassium (ppm)
  lastUpdate: 1672617600000,
  timestamp: 1672617600000
}
```

#### GPS Data
```
/devices/{deviceId}/gps
{
  lat: 14.5995,
  lng: 120.9842,
  alt: 12.5,                        // Altitude (meters)
  hdop: 1.2,                        // Horizontal dilution
  sats: 8,                          // Satellites connected
  ts: 1672617600000                 // Timestamp
}
```

### Key Points
- ✅ Real-time bidirectional communication
- ✅ ESP32 streams RTDB for incoming commands
- ✅ Firebase Functions monitor heartbeat
- ✅ NPK and GPS data updated by ESP32
- ✅ Low latency (<1 second)

---

## 5️⃣ RELATIONSHIPS OVERVIEW

```
users/{userId}
 ├─ fieldsOwned → fields/{fieldId}
 ├─ devicesOwned → devices/{deviceId}
 └─ notifications → in-document array

fields/{fieldId}
 ├─ ownerId → references user
 ├─ devices[] → array of device IDs
 └─ plot[] → polygon for map

devices/{deviceId}
 ├─ ownerId → references user
 ├─ fieldId → optional field reference
 ├─ /logs/{logId} → action audit trail
 ├─ /schedules/{scheduleId} → scheduled commands
 └─ lastHeartbeat → monitored by Functions
```

### Data Flow

1. **User creates field** → Firestore `/fields/{id}`
2. **User connects device** → Firestore `/devices/{id}` + RTDB `/devices/{id}`
3. **Device sends heartbeat** → RTDB `/devices/{id}/heartbeat`
4. **Firebase Function monitors** → Updates Firestore `connected` status
5. **User sends command** → RTDB `/devices/{id}/commands/{cmdId}`
6. **ESP32 executes** → Updates RTDB command status
7. **Function logs result** → Firestore `/devices/{id}/logs/{logId}`

---

## 6️⃣ DESIGN PRINCIPLES

### ✅ Optional Fields
- `description`, `variety`, `plantingType`, `startDate`, `plot`, `location` are all optional
- Allows gradual data enrichment
- No breaking changes when fields are empty

### ✅ Device-Centric Logging
- Logs and schedules live under `/devices/{deviceId}`
- Easy to query all actions for a specific device
- No deep nesting under users/fields

### ✅ Realtime Layer for Commands
- RTDB handles time-sensitive operations
- Firestore stores persistent state
- Best of both worlds

### ✅ Serverless Backend
Firebase Functions handle:
- **Logging** NPK sensor data every 5 minutes
- **Heartbeat monitoring** (detect offline devices)
- **Scheduled command execution**
- **Command verification** (log success/failure)
- **Push notifications** (offline alerts)

### ✅ Frontend Layer
UI responsibilities:
- Display device status
- Send live commands
- Create/manage schedules
- View historical logs
- Visualize map plots

### ✅ Extensible & Scalable
- New device types: Add to `deviceType` field
- New sensors: Add to RTDB `/devices/{id}/sensors`
- New field metrics: Add optional fields to `/fields`

---

## 7️⃣ IMPLEMENTATION FILES

### TypeScript Types
📄 **`/lib/types/firestore-schema.ts`**
- Complete type definitions for all collections
- Request/response types for API calls
- Helper types for frontend usage

### Firestore Helpers
📄 **`/lib/utils/firestoreHelpers.ts`**
- Type-safe CRUD operations
- User, Field, Device, Log, Schedule methods
- Notification management

### RTDB Helpers
📄 **`/lib/utils/rtdbHelpers.ts`**
- Heartbeat monitoring
- Live command sending
- NPK/GPS data retrieval
- Real-time subscriptions

### Migration Script
📄 **`/scripts/migrateToNewArchitecture.js`**
- Migrates legacy data structure
- Creates top-level collections
- Preserves all existing data

### Documentation
📄 **`/docs/MIGRATION_GUIDE.md`**
- Step-by-step migration instructions
- Compatibility layer
- Testing checklist

---

## 8️⃣ SECURITY RULES

### Firestore Rules
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Users can only read/write their own profile
    match /users/{userId} {
      allow read, write: if request.auth.uid == userId;
    }
    
    // Fields: owner can manage, others can read if they have device access
    match /fields/{fieldId} {
      allow read: if request.auth != null;
      allow write: if request.auth.uid == resource.data.ownerId;
    }
    
    // Devices: owner can manage, logs are read-only for owner
    match /devices/{deviceId} {
      allow read: if request.auth.uid == resource.data.ownerId;
      allow write: if request.auth.uid == resource.data.ownerId;
      
      match /logs/{logId} {
        allow read: if request.auth.uid == get(/databases/$(database)/documents/devices/$(deviceId)).data.ownerId;
        allow write: if false;  // Only Functions can write logs
      }
      
      match /schedules/{scheduleId} {
        allow read: if request.auth.uid == get(/databases/$(database)/documents/devices/$(deviceId)).data.ownerId;
        allow write: if request.auth.uid == resource.data.createdBy;
      }
    }
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

## 9️⃣ USAGE EXAMPLES

### Create a New Field
```typescript
import { createField } from '@/lib/utils/firestoreHelpers';

await createField(db, {
  ownerId: user.uid,
  name: "North Rice Paddy",
  variety: "IR64",
  plantingType: "transplant",
  startDate: Date.now(),
  plot: [
    { lat: 14.5995, lng: 120.9842 },
    { lat: 14.5996, lng: 120.9845 }
  ]
});
```

### Connect a Device
```typescript
import { createDevice } from '@/lib/utils/firestoreHelpers';

await createDevice(db, {
  ownerId: user.uid,
  fieldId: "field_abc123",
  name: "Relay Controller",
  deviceType: "ESP32",
  deviceId: "DEVICE_0005",
  location: { lat: 14.5995, lng: 120.9842 }
});
```

### Send Live Command
```typescript
import { sendLiveCommand } from '@/lib/utils/rtdbHelpers';

const commandId = await sendLiveCommand(database, "DEVICE_0005", 2, "ON");
// Command sent to relay 2, turn ON
```

### Monitor Heartbeat
```typescript
import { subscribeToHeartbeat, isDeviceOnline } from '@/lib/utils/rtdbHelpers';

const unsubscribe = subscribeToHeartbeat(database, "DEVICE_0005", (heartbeat) => {
  if (isDeviceOnline(heartbeat)) {
    console.log("Device is online!");
  } else {
    console.log("Device is offline");
  }
});

// Clean up
unsubscribe();
```

---

## 🎯 SUMMARY

| **Component** | **Technology** | **Purpose** |
|---------------|----------------|-------------|
| Users | Firestore `/users` | User profiles, ownership tracking |
| Fields | Firestore `/fields` | Rice field information, plotting |
| Devices | Firestore `/devices` | Device metadata, logs, schedules |
| Heartbeat | RTDB `/devices/{id}/heartbeat` | Real-time device status |
| Commands | RTDB `/devices/{id}/commands` | Live command execution |
| Sensors | RTDB `/devices/{id}/npk` | Real-time NPK readings |
| Functions | Firebase Cloud Functions | Backend logic, monitoring, logging |

### ✅ Benefits
- **Scalable**: Top-level collections, no deep nesting
- **Real-time**: RTDB for instant updates
- **Auditable**: Complete log trail in Firestore
- **Extensible**: Optional fields, new device types
- **Secure**: Granular security rules
- **Type-safe**: Full TypeScript coverage

---

**Last Updated:** January 3, 2026  
**Version:** 2.0.0  
**Status:** ✅ Production Ready
