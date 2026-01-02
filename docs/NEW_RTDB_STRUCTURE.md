# New RTDB Structure for PadBuddy IoT System

## Overview
This structure organizes devices by owner and field for better access control and scalability.

## Complete RTDB Hierarchy

```
owners/
  {ownerId}/                          # Firebase UID or custom owner ID
    fields/
      {fieldId}/                      # Field identifier
        devices/
          {deviceId}/                 # Device identifier (e.g., DEVICE_0001)
            
            # === DEVICE INFO (Set by ESP32 on boot) ===
            metadata/
              deviceType: "NPK-SENSOR-V1"
              firmwareVersion: "1.2.0"
              macAddress: "AA:BB:CC:DD:EE:FF"
              lastBoot: 1704153600000
            
            # === SENSOR READINGS (Written by ESP32) ===
            sensors/
              nitrogen: 45.2            # mg/kg
              phosphorus: 12.8          # mg/kg
              potassium: 38.5           # mg/kg
              temperature: 28.5         # °C (optional)
              humidity: 75.3            # % (optional)
              waterLevel: 15.2          # cm (optional)
              lastUpdate: 1704153600000 # Unix timestamp (ms)
            
            # === DEVICE STATUS (Written by ESP32) ===
            status/
              heartbeat: 1704153600000  # Updated every 60s
              battery: 85               # % (if battery-powered)
              signal: -65               # WiFi signal strength (dBm)
              online: true              # Boolean status
            
            # === GPS LOCATION (Written by ESP32) ===
            location/
              latitude: 14.5995
              longitude: 120.9842
              accuracy: 5.0             # meters
              timestamp: 1704153600000
            
            # === COMMANDS (Written by Client, Read by ESP32) ===
            commands/
              pending/
                {commandId}/            # Auto-generated command ID
                  type: "relay"         # Command type
                  action: "on"          # on/off/toggle
                  relay: 1              # Relay number (1-4)
                  duration: 300000      # Duration in ms (optional)
                  requestedAt: 1704153600000
                  requestedBy: "user123"
                  status: "pending"     # pending/processing/completed/failed
              
              active/
                {commandId}/            # Command being processed
                  type: "motor"
                  action: "extend"      # extend/retract/stop
                  distance: 50          # cm (optional)
                  speed: 100            # % (optional)
                  startedAt: 1704153600000
                  status: "processing"
              
              history/
                {commandId}/            # Last 50 commands
                  type: "relay"
                  action: "on"
                  completedAt: 1704153600000
                  status: "completed"
                  result: "success"     # success/failed/timeout
                  error: null           # Error message if failed

# === GLOBAL DEVICE REGISTRY (Optional - for quick lookup) ===
devices/
  {deviceId}/
    owner: "owner123"                   # Reference to owner
    field: "field456"                   # Reference to field
    status: "online"                    # Quick status check
    lastSeen: 1704153600000
```

## Command Types

### 1. Relay Control
```json
{
  "type": "relay",
  "action": "on",           // on/off/toggle
  "relay": 1,               // Relay number (1-4)
  "duration": 300000        // Auto-off after 5 min (optional)
}
```

### 2. Motor Control
```json
{
  "type": "motor",
  "action": "extend",       // extend/retract/stop
  "distance": 50,           // cm (optional)
  "speed": 100              // % of max speed (optional)
}
```

### 3. Sensor Calibration
```json
{
  "type": "calibrate",
  "sensor": "npk",          // npk/temperature/humidity
  "offset": {
    "nitrogen": 0,
    "phosphorus": 0,
    "potassium": 0
  }
}
```

### 4. Device Configuration
```json
{
  "type": "config",
  "action": "update",
  "settings": {
    "sensorInterval": 300000,   // Read sensors every 5 min
    "heartbeatInterval": 60000, // Heartbeat every 60s
    "gpsInterval": 3600000      // GPS update every hour
  }
}
```

### 5. System Commands
```json
{
  "type": "system",
  "action": "reboot"        // reboot/reset/sleep
}
```

## ESP32 Implementation Guide

### Writing Sensor Data
```cpp
// Path: owners/{ownerId}/fields/{fieldId}/devices/{deviceId}/sensors
void updateSensors() {
  String path = "owners/" + OWNER_ID + "/fields/" + FIELD_ID + 
                "/devices/" + DEVICE_ID + "/sensors/";
  
  Firebase.setFloat(firebaseData, path + "nitrogen", readNPK_N());
  Firebase.setFloat(firebaseData, path + "phosphorus", readNPK_P());
  Firebase.setFloat(firebaseData, path + "potassium", readNPK_K());
  Firebase.setInt(firebaseData, path + "lastUpdate", millis());
}
```

### Sending Heartbeat
```cpp
// Path: owners/{ownerId}/fields/{fieldId}/devices/{deviceId}/status
void sendHeartbeat() {
  String path = "owners/" + OWNER_ID + "/fields/" + FIELD_ID + 
                "/devices/" + DEVICE_ID + "/status/";
  
  Firebase.setInt(firebaseData, path + "heartbeat", millis());
  Firebase.setBool(firebaseData, path + "online", true);
  Firebase.setInt(firebaseData, path + "battery", getBatteryLevel());
  Firebase.setInt(firebaseData, path + "signal", WiFi.RSSI());
}
```

### Listening for Commands
```cpp
// Path: owners/{ownerId}/fields/{fieldId}/devices/{deviceId}/commands/pending
void checkCommands() {
  String path = "owners/" + OWNER_ID + "/fields/" + FIELD_ID + 
                "/devices/" + DEVICE_ID + "/commands/pending";
  
  if (Firebase.getJSON(firebaseData, path)) {
    FirebaseJson json = firebaseData.jsonObject();
    
    // Process each pending command
    size_t len = json.iteratorBegin();
    for (size_t i = 0; i < len; i++) {
      String commandId;
      FirebaseJson commandData;
      json.iteratorGet(i, commandId, commandData);
      
      // Move to active
      moveCommandToActive(commandId, commandData);
      
      // Execute command
      executeCommand(commandData);
      
      // Move to history
      moveCommandToHistory(commandId, "completed", "success");
    }
    json.iteratorEnd();
  }
}

void executeCommand(FirebaseJson& command) {
  String type = command.get("type");
  
  if (type == "relay") {
    String action = command.get("action");
    int relay = command.get("relay");
    
    if (action == "on") {
      digitalWrite(RELAY_PINS[relay], HIGH);
    } else if (action == "off") {
      digitalWrite(RELAY_PINS[relay], LOW);
    }
  } else if (type == "motor") {
    String action = command.get("action");
    if (action == "extend") {
      extendMotor();
    } else if (action == "retract") {
      retractMotor();
    }
  }
}
```

## Client (Web App) Command Sending

```typescript
// Send command from web app
async function sendDeviceCommand(
  ownerId: string,
  fieldId: string,
  deviceId: string,
  command: any
) {
  const commandId = Date.now().toString();
  const commandRef = ref(
    database,
    `owners/${ownerId}/fields/${fieldId}/devices/${deviceId}/commands/pending/${commandId}`
  );
  
  await set(commandRef, {
    ...command,
    requestedAt: Date.now(),
    requestedBy: auth.currentUser?.uid,
    status: 'pending'
  });
  
  return commandId;
}

// Example: Turn on relay 1 for 5 minutes
await sendDeviceCommand(
  'user123',
  'field456',
  'DEVICE_0001',
  {
    type: 'relay',
    action: 'on',
    relay: 1,
    duration: 300000
  }
);
```

## Cloud Functions Updates Required

### 1. Update scheduledSensorLogger
```typescript
// OLD: devices/{deviceId}
// NEW: owners/{ownerId}/fields/{fieldId}/devices/{deviceId}

export const scheduledSensorLogger = functions.pubsub
  .schedule('*/5 * * * *')
  .onRun(async (context) => {
    const database = admin.database();
    const firestore = admin.firestore();
    
    // Get all owners
    const ownersRef = database.ref('owners');
    const ownersSnapshot = await ownersRef.once('value');
    
    if (!ownersSnapshot.exists()) return null;
    
    const owners = ownersSnapshot.val();
    
    for (const [ownerId, ownerData] of Object.entries(owners) as [string, any][]) {
      const fields = ownerData.fields || {};
      
      for (const [fieldId, fieldData] of Object.entries(fields) as [string, any][]) {
        const devices = fieldData.devices || {};
        
        for (const [deviceId, deviceData] of Object.entries(devices) as [string, any][]) {
          // Process sensor data
          const sensors = deviceData.sensors;
          if (!sensors) continue;
          
          const { nitrogen, phosphorus, potassium, lastUpdate } = sensors;
          
          // Write to Firestore fields/{fieldId}/paddies/{paddyId}/logs
          // ... rest of logging logic
        }
      }
    }
  });
```

### 2. Update deviceHealthMonitor
```typescript
export const deviceHealthMonitor = functions.pubsub
  .schedule('*/2 * * * *')
  .onRun(async (context) => {
    const database = admin.database();
    const ownersRef = database.ref('owners');
    const ownersSnapshot = await ownersRef.once('value');
    
    // Check heartbeat for all devices in new structure
    // ... iterate owners/fields/devices
  });
```

## Migration Steps

1. **Phase 1: Create new structure in RTDB**
   - Keep old `devices/` structure temporarily
   - Create new `owners/` structure alongside

2. **Phase 2: Update Cloud Functions**
   - Update to read from both old and new structure
   - Prioritize new structure

3. **Phase 3: Update ESP32 firmware**
   - Flash new firmware that writes to new paths
   - Include owner/field IDs in firmware config

4. **Phase 4: Update web client**
   - Update all device command functions
   - Use new paths for reading/writing

5. **Phase 5: Deprecate old structure**
   - Remove old `devices/` once all migrated
   - Clean up old Cloud Functions code

## Security Rules (database.rules.json)

```json
{
  "rules": {
    "owners": {
      "$ownerId": {
        ".read": "auth.uid === $ownerId || root.child('admins').child(auth.uid).exists()",
        
        "fields": {
          "$fieldId": {
            "devices": {
              "$deviceId": {
                "sensors": {
                  ".write": "true",  // Allow ESP32 to write (no auth)
                  ".read": "auth.uid === $ownerId"
                },
                "status": {
                  ".write": "true",  // Allow ESP32 to write heartbeat
                  ".read": "auth.uid === $ownerId"
                },
                "commands": {
                  "pending": {
                    ".write": "auth.uid === $ownerId",
                    ".read": "true"  // ESP32 reads commands
                  },
                  "active": {
                    ".write": "true",  // ESP32 updates status
                    ".read": "auth.uid === $ownerId"
                  },
                  "history": {
                    ".read": "auth.uid === $ownerId",
                    ".write": "true"  // ESP32 writes completed commands
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
```

## Benefits of New Structure

✅ **Clear ownership hierarchy** - Each device belongs to owner and field  
✅ **Better access control** - Rules based on ownership  
✅ **Scalability** - Easy to add multiple owners/fields  
✅ **Command support** - Built-in command queue system  
✅ **Audit trail** - Command history tracking  
✅ **ESP32-friendly** - Simple paths, clear separation  
✅ **Offline resilience** - Commands queue when device offline  
✅ **Flexible** - Easy to add new command types  

## Next Steps

1. Review this structure
2. Update Cloud Functions code
3. Create ESP32 firmware template
4. Update web client command functions
5. Test with one device
6. Migrate remaining devices
