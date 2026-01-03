# ESP32 Firmware Integration Guide

## 🎯 Overview

This guide explains how ESP32 firmware should integrate with the PadBuddy IoT architecture to support:
- Live commands from web app
- Heartbeat monitoring
- Scheduled commands
- Proper acknowledgment and completion reporting

---

## 📡 Required Features

### 1. **Heartbeat Transmission**

**Frequency:** Every 10-60 seconds (recommended: 30 seconds)

**Purpose:** Let Functions know device is online

**RTDB Path:**
```
devices/{deviceId}/status/heartbeat
```
OR (new hierarchy):
```
owners/{ownerId}/fields/{fieldId}/devices/{deviceId}/status/heartbeat
```

**Code Example (Arduino/ESP32):**
```cpp
#include <FirebaseESP32.h>

FirebaseData firebaseData;
unsigned long lastHeartbeat = 0;
const long HEARTBEAT_INTERVAL = 30000; // 30 seconds

void setup() {
  // Initialize Firebase
  Firebase.begin(FIREBASE_HOST, FIREBASE_AUTH);
  Firebase.reconnectWiFi(true);
}

void loop() {
  sendHeartbeat();
  listenForCommands();
  // ... other tasks
}

void sendHeartbeat() {
  unsigned long currentTime = millis();
  if (currentTime - lastHeartbeat >= HEARTBEAT_INTERVAL) {
    unsigned long timestamp = getEpochTime(); // Get Unix timestamp in milliseconds
    
    String path = "/devices/" + DEVICE_ID + "/status/heartbeat";
    if (Firebase.setInt(firebaseData, path, timestamp)) {
      Serial.println("✓ Heartbeat sent: " + String(timestamp));
    } else {
      Serial.println("✗ Heartbeat failed: " + firebaseData.errorReason());
    }
    
    lastHeartbeat = currentTime;
  }
}

// Get Unix timestamp in milliseconds
unsigned long getEpochTime() {
  time_t now;
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) {
    return 0;
  }
  time(&now);
  return (unsigned long)now * 1000; // Convert to milliseconds
}
```

---

### 2. **Command Listener (RTDB Streaming)**

**Purpose:** Listen for commands from web app or Functions via Firebase RTDB WebSocket streaming

**Why RTDB Streaming?**
- Client and ESP32 are on **different networks** (no direct connection possible)
- Firebase RTDB provides global WebSocket infrastructure
- Works across NAT/firewalls automatically
- Real-time notifications when Client writes commands

**RTDB Path:**
```
devices/{deviceId}/commands/{nodeId}
```
Where `nodeId` is:
- `ESP32A` - Relay controller
- `ESP32B` - Motor controller
- `ESP32C` - NPK sensor controller

**Command Format:**
```json
{
  "nodeId": "ESP32A",
  "role": "relay",
  "action": "on",
  "relay": 1,
  "status": "pending",
  "requestedAt": 1704153600000,
  "requestedBy": "user_abc",
  "source": "live"
}
```

**Code Example:**
```cpp
FirebaseData streamData;
bool commandStreamActive = false;

void listenForCommands() {
  // Setup stream listener (call once in setup or when reconnecting)
  if (!commandStreamActive) {
    String commandPath = "/devices/" + DEVICE_ID + "/commands/" + NODE_ID;
    if (Firebase.beginStream(streamData, commandPath)) {
      commandStreamActive = true;
      Serial.println("✓ Command stream started");
    }
  }
  
  // Check for new commands
  if (Firebase.readStream(streamData)) {
    if (streamData.dataType() == "json") {
      FirebaseJson json = streamData.jsonObject();
      
      String status;
      json.get("status", status);
      
      if (status == "pending") {
        // New command received!
        executeCommand(json);
      }
    }
  }
}

void executeCommand(FirebaseJson &commandJson) {
  String role, action;
  int relay = 0;
  
  commandJson.get("role", role);
  commandJson.get("action", action);
  commandJson.get("relay", relay);
  
  Serial.println("📩 Command received: " + role + " " + action);
  
  // STEP 1: Acknowledge command immediately
  acknowledgeCommand();
  
  // STEP 2: Execute command
  bool success = false;
  
  if (role == "relay") {
    if (action == "on") {
      digitalWrite(getRelayPin(relay), HIGH);
      success = true;
    } else if (action == "off") {
      digitalWrite(getRelayPin(relay), LOW);
      success = true;
    }
  }
  
  // STEP 3: Report completion
  reportCompletion(success);
}

void acknowledgeCommand() {
  String path = "/devices/" + DEVICE_ID + "/commands/" + NODE_ID + "/acknowledgedAt";
  unsigned long timestamp = getEpochTime();
  Firebase.setInt(firebaseData, path, timestamp);
  Serial.println("✓ Command acknowledged");
}

void reportCompletion(bool success) {
  String basePath = "/devices/" + DEVICE_ID + "/commands/" + NODE_ID;
  unsigned long timestamp = getEpochTime();
  
  if (success) {
    Firebase.setString(firebaseData, basePath + "/status", "completed");
    Firebase.setInt(firebaseData, basePath + "/executedAt", timestamp);
    Serial.println("✓ Command completed");
  } else {
    Firebase.setString(firebaseData, basePath + "/status", "error");
    Firebase.setString(firebaseData, basePath + "/error", "Execution failed");
    Firebase.setInt(firebaseData, basePath + "/executedAt", timestamp);
    Serial.println("✗ Command failed");
  }
}

int getRelayPin(int relayNumber) {
  switch(relayNumber) {
    case 1: return RELAY1_PIN;
    case 2: return RELAY2_PIN;
    default: return -1;
  }
}
```

---

### 3. **NPK Sensor Readings**

**Purpose:** Send sensor data for logging

**RTDB Path:**
```
devices/{deviceId}/sensors/
```

**Format:**
```json
{
  "nitrogen": 45.2,
  "phosphorus": 12.8,
  "potassium": 38.5,
  "lastUpdate": 1704153600000
}
```

**Code Example:**
```cpp
void sendNPKReading(float nitrogen, float phosphorus, float potassium) {
  String basePath = "/devices/" + DEVICE_ID + "/sensors";
  unsigned long timestamp = getEpochTime();
  
  Firebase.setFloat(firebaseData, basePath + "/nitrogen", nitrogen);
  Firebase.setFloat(firebaseData, basePath + "/phosphorus", phosphorus);
  Firebase.setFloat(firebaseData, basePath + "/potassium", potassium);
  Firebase.setInt(firebaseData, basePath + "/lastUpdate", timestamp);
  
  Serial.println("✓ NPK reading sent: N=" + String(nitrogen) + 
                 " P=" + String(phosphorus) + 
                 " K=" + String(potassium));
}
```

---

## 🔄 Complete Example Flow

### Scenario: User turns ON Relay 1

```cpp
// 1. ESP32 listens for commands
void listenForCommands() {
  if (Firebase.readStream(streamData)) {
    if (streamData.dataType() == "json") {
      FirebaseJson json = streamData.jsonObject();
      
      String status;
      json.get("status", status);
      
      if (status == "pending") {
        // Command received!
        String role, action;
        int relay;
        json.get("role", role);
        json.get("action", action);
        json.get("relay", relay);
        
        Serial.println("📩 Received: " + role + " " + action + " relay=" + String(relay));
        
        // 2. Acknowledge immediately
        String ackPath = "/devices/" + DEVICE_ID + "/commands/ESP32A/acknowledgedAt";
        Firebase.setInt(firebaseData, ackPath, getEpochTime());
        Serial.println("✓ Acknowledged");
        
        // 3. Execute command
        if (role == "relay" && action == "on" && relay == 1) {
          digitalWrite(RELAY1_PIN, HIGH);
          delay(100); // Small delay to ensure stable state
          
          // 4. Report completion
          String basePath = "/devices/" + DEVICE_ID + "/commands/ESP32A";
          Firebase.setString(firebaseData, basePath + "/status", "completed");
          Firebase.setInt(firebaseData, basePath + "/executedAt", getEpochTime());
          Firebase.setString(firebaseData, basePath + "/result/success", "true");
          Serial.println("✓ Relay 1 turned ON successfully");
        }
      }
    }
  }
}
```

**Timeline:**
```
T+0ms:    Web app writes command to RTDB
T+50ms:   ESP32 stream detects new data
T+100ms:  ESP32 acknowledges (acknowledgedAt)
T+200ms:  ESP32 executes relay command
T+300ms:  ESP32 reports completion (status: "completed")
T+400ms:  Web app detects completion, updates UI
```

---

## 📋 Command Types Reference

### Relay Control
```json
{
  "nodeId": "ESP32A",
  "role": "relay",
  "action": "on" | "off",
  "relay": 1 | 2,
  "status": "pending"
}
```

### Motor Control
```json
{
  "nodeId": "ESP32B",
  "role": "motor",
  "action": "extend" | "retract" | "stop",
  "params": {
    "duration": 5000,
    "speed": 100
  },
  "status": "pending"
}
```

### NPK Sensor Scan
```json
{
  "nodeId": "ESP32C",
  "role": "npk",
  "action": "scan",
  "params": {
    "duration": 10000
  },
  "status": "pending"
}
```

---

## ⚠️ Important Notes

### 1. **Always Acknowledge Commands**
The web app shows "Waiting..." until it receives:
- Either `acknowledgedAt` timestamp
- OR `status: "completed"`

Without acknowledgment, the UI will timeout after 30 seconds.

### 2. **Report Completion**
After executing a command, always update:
```json
{
  "status": "completed",
  "executedAt": 1704153600500,
  "result": { "success": true }
}
```

### 3. **Handle Errors Gracefully**
If command execution fails:
```json
{
  "status": "error",
  "executedAt": 1704153600500,
  "error": "Relay pin not responding"
}
```

### 4. **Timestamp Format**
Always use Unix timestamp in **milliseconds**:
```cpp
unsigned long timestamp = getEpochTime(); // e.g., 1704153600000
```

### 5. **Stream Reconnection**
If WiFi disconnects, restart the stream:
```cpp
if (WiFi.status() != WL_CONNECTED) {
  commandStreamActive = false;
  // Reconnect WiFi...
  // Stream will restart in listenForCommands()
}
```

---

## 🧪 Testing Your Implementation

### Test 1: Heartbeat
1. Upload firmware to ESP32
2. Check Firebase RTDB: `devices/{deviceId}/status/heartbeat`
3. Should update every 30 seconds

### Test 2: Command Reception
1. Manually write command to RTDB:
   ```json
   devices/DEVICE_0001/commands/ESP32A: {
     "nodeId": "ESP32A",
     "role": "relay",
     "action": "on",
     "relay": 1,
     "status": "pending",
     "requestedAt": 1704153600000
   }
   ```
2. Check Serial Monitor for: "📩 Received: relay on relay=1"
3. Check RTDB for `acknowledgedAt` and `executedAt` timestamps

### Test 3: Full Integration
1. Open PadBuddy web app
2. Click "Turn ON Relay 1"
3. Check Serial Monitor for execution logs
4. Verify relay physically turns ON
5. Verify UI updates to "Turn OFF"

---

## 📚 Additional Resources

- [Firebase ESP32 Library Documentation](https://github.com/mobizt/Firebase-ESP32)
- [PadBuddy IoT Architecture](./IOT_ARCHITECTURE.md)
- [RTDB Structure Reference](./RTDB_STRUCTURE.md)

---

**Last Updated:** 2026-01-03  
**Version:** 1.0.0
