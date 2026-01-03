# ESP32-A Relay Controller Analysis

**Date:** January 3, 2026  
**Device:** ESP32-A Relay Controller (DEVICE_0005)  
**Firmware:** Relay control with 4 channels

---

## Executive Summary

🔴 **CRITICAL ISSUE FOUND:** Command path is completely incompatible with Cloud Functions

**Alignment Score: 40% ❌**

### Critical Problems

| Component | ESP32 Code | Expected by System | Status |
|-----------|------------|-------------------|---------|
| **Command Path** | `/devices/DEVICE_0005/commands/{id}` | `/devices/{deviceId}/commands/{nodeId}` | ❌ BROKEN |
| **Command Structure** | `{relay, action}` | `{nodeId, role, action, status}` | ❌ BROKEN |
| **Heartbeat Path** | `/devices/DEVICE_0005/heartbeat` | `/devices/{deviceId}/heartbeat` | ✅ CORRECT |
| **ACK Structure** | `{status, actualState, timestamp}` | Cloud Function expects `ack: true/false` | ⚠️ MISMATCH |

---

## Detailed Analysis

### 1. Heartbeat ✅ CORRECT

**ESP32 Code:**
```cpp
String path = "/devices/" DEVICE_ID "/heartbeat";
rtdb.set<int>(path, now);
```

**Expected Path:** `/devices/{deviceId}/heartbeat`

**Status:** ✅ **PERFECT ALIGNMENT**

**Cloud Function Compatibility:**
- ✅ `monitorHeartbeat` (RTDB trigger) will detect this
- ✅ `monitorDeviceHeartbeats` (scheduled) will check this
- ✅ Offline detection works correctly

---

### 2. Command Path ❌ CRITICAL ISSUE

**ESP32 Code:**
```cpp
String basePath = "/devices/" DEVICE_ID "/commands";
auto res = rtdb.get(basePath);
json.iteratorBegin(); // Reads ALL children
```

**Expected Path:** `/devices/{deviceId}/commands/{nodeId}`

**Problem Breakdown:**

#### Issue #1: No NodeId Specified
ESP32 reads from `/devices/DEVICE_0005/commands` (all children)  
Cloud Function expects `/devices/DEVICE_0005/commands/ESP32A`

**Impact:**
- Cloud Function `commandAuditLogger` triggers on `/commands/{nodeId}` ✅
- But ESP32 doesn't write to a specific nodeId path ❌
- Commands may get logged but ESP32 reads wrong path ❌

#### Issue #2: Frontend Compatibility
Frontend code (`deviceCommands.ts`) writes to:
```typescript
await update(deviceRef, {
  [`commands/${nodeId}`]: commandData  // e.g., commands/ESP32A
});
```

ESP32 reads from:
```cpp
String basePath = "/devices/" DEVICE_ID "/commands";  // No nodeId!
```

**Result:** ESP32 reads ALL commands as a list, not a specific nodeId

---

### 3. Command Structure ❌ INCOMPATIBLE

**ESP32 Expects:**
```json
{
  "commandId": {
    "relay": 0,
    "action": "ON"
  }
}
```

**Frontend Sends:**
```json
{
  "ESP32A": {
    "nodeId": "ESP32A",
    "role": "relay",
    "action": "open",
    "relay": 1,
    "status": "pending",
    "requestedAt": 1704153600000,
    "requestedBy": "user123"
  }
}
```

**Mismatch Analysis:**

| Field | ESP32 Reads | Frontend Sends | Status |
|-------|-------------|----------------|--------|
| relay | `relay` | `relay` | ✅ Match |
| action | `action` | `action` | ⚠️ Value mismatch |
| nodeId | ❌ Ignored | ✓ Included | ❌ ESP32 ignores |
| role | ❌ Ignored | ✓ Included | ❌ ESP32 ignores |
| status | ❌ Not read | ✓ Included | ❌ ESP32 doesn't check |

**Action Value Mismatch:**
- Frontend sends: `"open"` or `"close"`
- ESP32 expects: `"ON"` or `"OFF"`

---

### 4. ACK Structure ⚠️ PARTIAL MISMATCH

**ESP32 Writes:**
```cpp
FirebaseJson ack;
ack.set("status", "success");
ack.set("actualState", state ? "ON" : "OFF");
ack.set("timestamp", millis());

rtdb.set(basePath + "/" + commandId + "/ack", ack);
```

**Result in RTDB:**
```json
{
  "commands": {
    "commandId123": {
      "relay": 0,
      "action": "ON",
      "ack": {
        "status": "success",
        "actualState": "ON",
        "timestamp": 12345
      }
    }
  }
}
```

**Cloud Function Expects:**
```typescript
// From liveCommands.ts
const success = commandData.status === 'executed' || commandData.status === 'acknowledged';
const failed = commandData.status === 'failed';
```

**Problem:**
- Cloud Function checks `commandData.status` at root level ❌
- ESP32 writes `commandData.ack.status` nested ❌
- Cloud Function will NOT detect command completion ❌

---

### 5. Command Execution Flow (Current vs Expected)

#### Current Flow (BROKEN)
```
1. Frontend writes to /devices/DEVICE_0005/commands/ESP32A:
   {
     nodeId: "ESP32A",
     role: "relay",
     action: "open",
     relay: 1,
     status: "pending"
   }

2. ESP32 polls /devices/DEVICE_0005/commands (ALL children):
   ✅ ESP32 CAN see the command (as a child)
   ⚠️ ESP32 doesn't check nodeId (reads all commands regardless)
   ⚠️ ESP32 expects action="ON", gets action="open"

3. ESP32 writes ACK to /devices/DEVICE_0005/commands/ESP32A/ack:
   {
     status: "success",
     actualState: "ON",
     timestamp: 12345
   }

4. Cloud Function checks commandData.status:
   ❌ Still reads "pending" (ESP32 wrote to .ack.status, not .status)
   ❌ Cloud Function thinks command failed/timed out

5. After 30s timeout:
   ⚠️ Cloud Function marks command as timed out
   ⚠️ User sees "Command Failed"
```

#### Expected Flow (CORRECT)
```
1. Frontend writes to /devices/DEVICE_0005/commands/ESP32A:
   {
     nodeId: "ESP32A",
     role: "relay",
     action: "ON",
     relay: 1,
     status: "pending",
     requestedAt: 1704153600000
   }

2. ESP32 listens to /devices/DEVICE_0005/commands/ESP32A:
   ✅ ESP32 sees exact command for this node
   ✅ ESP32 checks if nodeId matches
   ✅ ESP32 reads action="ON" correctly

3. ESP32 updates status to /devices/DEVICE_0005/commands/ESP32A:
   {
     nodeId: "ESP32A",
     role: "relay",
     action: "ON",
     relay: 1,
     status: "executed",  // ← Updated root-level status
     requestedAt: 1704153600000,
     executedAt: 1704153700000,
     actualState: "ON"
   }

4. Cloud Function detects status change:
   ✅ commandData.status === "executed"
   ✅ Cloud Function logs success
   ✅ User sees "Command Successful"
```

---

## Code Comparison

### Heartbeat (✅ CORRECT)

| ESP32 Current | Expected | Status |
|---------------|----------|--------|
| `rtdb.set<int>(path, now)` | `rtdb.set<int>(path, now)` | ✅ Perfect |
| Path: `/devices/DEVICE_0005/heartbeat` | Path: `/devices/{deviceId}/heartbeat` | ✅ Perfect |
| Value: `millis()` | Value: `timestamp` | ✅ Perfect |

---

### Command Reading (❌ BROKEN)

**Current Code:**
```cpp
void checkCommands() {
  String basePath = "/devices/" DEVICE_ID "/commands";
  
  auto res = rtdb.get(basePath);  // Gets ALL children
  if (!res) return;

  FirebaseJson json = res.to<FirebaseJson>();
  FirebaseJsonData data;
  size_t count = json.iteratorBegin();

  for (size_t i = 0; i < count; i++) {
    json.iteratorGet(i, data);
    String commandId = data.key;  // Could be "ESP32A", "ESP32B", etc.
    FirebaseJson cmd = data.value;

    // No nodeId check!
    // Executes ALL commands regardless of target node
  }
}
```

**Corrected Code:**
```cpp
// Define this ESP32's nodeId
#define NODE_ID "ESP32A"

void checkCommands() {
  // Read specific node path
  String nodePath = "/devices/" DEVICE_ID "/commands/" NODE_ID;
  
  auto res = rtdb.get(nodePath);
  if (!res) return;

  FirebaseJson cmd = res.to<FirebaseJson>();
  
  // Validate nodeId matches
  FirebaseJsonData nodeIdData;
  cmd.get(nodeIdData, "nodeId");
  if (nodeIdData.stringValue != NODE_ID) {
    Serial.println("Command not for this node, ignoring");
    return;
  }

  // Check status (only process pending commands)
  FirebaseJsonData statusData;
  cmd.get(statusData, "status");
  if (statusData.stringValue != "pending") {
    return; // Already processed
  }

  // Get relay and action
  FirebaseJsonData relayData, actionData;
  cmd.get(relayData, "relay");
  cmd.get(actionData, "action");
  
  int relayIndex = relayData.intValue - 1; // Convert to 0-based index
  String action = actionData.stringValue;

  // Map action to state
  bool state = (action == "ON" || action == "open" || action == "1");
  setRelay(relayIndex, state);

  // Update status (not nested in ack)
  String statusPath = nodePath + "/status";
  rtdb.set(statusPath, "executed");
  
  String executedAtPath = nodePath + "/executedAt";
  rtdb.set(executedAtPath, millis());
  
  String actualStatePath = nodePath + "/actualState";
  rtdb.set(actualStatePath, state ? "ON" : "OFF");

  Serial.printf("Executed command -> Relay %d %s\n", relayIndex + 1, state ? "ON" : "OFF");
}
```

---

## Required Changes

### Critical (Must Fix)

#### 1. Add NodeId Definition
```cpp
#define NODE_ID "ESP32A"  // Each relay controller gets unique ID
```

#### 2. Fix Command Path
```cpp
// OLD:
String basePath = "/devices/" DEVICE_ID "/commands";

// NEW:
String nodePath = "/devices/" DEVICE_ID "/commands/" NODE_ID;
```

#### 3. Fix Status Update
```cpp
// OLD:
FirebaseJson ack;
ack.set("status", "success");
rtdb.set(basePath + "/" + commandId + "/ack", ack);

// NEW:
rtdb.set(nodePath + "/status", "executed");
rtdb.set(nodePath + "/executedAt", millis());
rtdb.set(nodePath + "/actualState", state ? "ON" : "OFF");
```

#### 4. Add NodeId Validation
```cpp
// Validate command is for this node
FirebaseJsonData nodeIdData;
cmd.get(nodeIdData, "nodeId");
if (nodeIdData.stringValue != NODE_ID) {
  return; // Ignore commands for other nodes
}
```

#### 5. Add Status Check
```cpp
// Only process pending commands
FirebaseJsonData statusData;
cmd.get(statusData, "status");
if (statusData.stringValue != "pending") {
  return; // Already processed
}
```

---

## Corrected Full Code

```cpp
#include <WiFi.h>
#include <FirebaseClient.h>

using namespace firebase;

// ================= WIFI =================
const char* ssid = "4G-UFI-5623";
const char* password = "1234567890";

// ================= FIREBASE =================
#define DATABASE_URL "https://rice-padbuddy-default-rtdb.asia-southeast1.firebasedatabase.app"
#define DATABASE_SECRET "lTOi0CD0S1Mf3Vu6dVhCPPaWKU9c5FTRSZ9idBYN"

// ================= DEVICE =================
#define DEVICE_ID "DEVICE_0005"
#define NODE_ID "ESP32A"  // ← NEW: Unique node identifier

// ================= RELAYS =================
const int relayPins[4] = {27, 26, 25, 33};

// ================= HEARTBEAT =================
const unsigned long HEARTBEAT_INTERVAL = 10000;
unsigned long lastHeartbeat = 0;

// ================= FIREBASE OBJECTS =================
DefaultNetwork network;
FirebaseApp app;
RealtimeDatabase rtdb;

// ================= RELAY CONTROL =================
void setRelay(int index, bool state) {
  if (index < 0 || index > 3) return;
  digitalWrite(relayPins[index], state ? HIGH : LOW);
}

// ================= HEARTBEAT =================
void sendHeartbeat() {
  unsigned long now = millis();
  if (now - lastHeartbeat >= HEARTBEAT_INTERVAL) {
    String path = "/devices/" DEVICE_ID "/heartbeat";
    rtdb.set<int>(path, now);
    Serial.println("✓ Heartbeat sent");
    lastHeartbeat = now;
  }
}

// ================= COMMAND HANDLER =================
void checkCommands() {
  // ← FIXED: Read specific node path
  String nodePath = "/devices/" DEVICE_ID "/commands/" NODE_ID;

  auto res = rtdb.get(nodePath);
  if (!res) return;

  FirebaseJson cmd = res.to<FirebaseJson>();

  // ← NEW: Validate nodeId
  FirebaseJsonData nodeIdData;
  cmd.get(nodeIdData, "nodeId");
  if (nodeIdData.stringValue != NODE_ID) {
    return; // Not for this node
  }

  // ← NEW: Check status (only process pending)
  FirebaseJsonData statusData;
  cmd.get(statusData, "status");
  String status = statusData.stringValue;
  if (status != "pending") {
    return; // Already processed
  }

  // Get relay and action
  FirebaseJsonData relayData, actionData;
  cmd.get(relayData, "relay");
  cmd.get(actionData, "action");

  int relay = relayData.intValue;
  String action = actionData.stringValue;

  // Convert 1-based to 0-based index
  int relayIndex = relay - 1;
  if (relayIndex < 0 || relayIndex > 3) {
    Serial.println("Invalid relay number");
    
    // ← FIXED: Update status to failed
    rtdb.set(nodePath + "/status", "failed");
    rtdb.set(nodePath + "/error", "Invalid relay number");
    return;
  }

  // Map action to state (support multiple formats)
  bool state = (action == "ON" || action == "open" || action == "1");
  setRelay(relayIndex, state);

  // ← FIXED: Update status at root level (not nested)
  unsigned long now = millis();
  rtdb.set(nodePath + "/status", "executed");
  rtdb.set(nodePath + "/executedAt", now);
  rtdb.set(nodePath + "/actualState", state ? "ON" : "OFF");

  Serial.printf("✓ Executed: Relay %d → %s\n", relay, state ? "ON" : "OFF");
}

// ================= SETUP FIREBASE =================
void setupFirebase() {
  network.begin(WiFi.localIP());

  app.setDatabaseUrl(DATABASE_URL);
  app.setLegacyToken(DATABASE_SECRET);

  app.begin(&network);
  rtdb.begin(&app);

  Serial.println("Firebase initialized");
}

// ================= SETUP =================
void setup() {
  Serial.begin(115200);

  for (int i = 0; i < 4; i++) {
    pinMode(relayPins[i], OUTPUT);
    digitalWrite(relayPins[i], LOW);
  }

  WiFi.begin(ssid, password);
  Serial.print("Connecting WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected");

  setupFirebase();
  
  Serial.printf("Node ID: %s\n", NODE_ID);
}

// ================= LOOP =================
void loop() {
  sendHeartbeat();
  checkCommands();
  delay(1000);
}
```

---

## Testing Checklist

### Before Deploying Fixes

- [ ] Define unique `NODE_ID` for this ESP32 (ESP32A, ESP32B, ESP32C)
- [ ] Update command path to include nodeId
- [ ] Remove nested ACK structure
- [ ] Add nodeId validation
- [ ] Add status checking
- [ ] Update status at root level

### After Deploying Fixes

- [ ] Test heartbeat: Check Firebase Console → RTDB → `/devices/DEVICE_0005/heartbeat`
- [ ] Test command write: Frontend sends command to `/commands/ESP32A`
- [ ] Test command read: ESP32 reads from `/commands/ESP32A`
- [ ] Test command execution: Relay turns on/off
- [ ] Test status update: Check `/commands/ESP32A/status` changes to "executed"
- [ ] Test Cloud Function logging: Check Firestore `command_audit` collection
- [ ] Test timeout: Send command with ESP32 offline, verify timeout after 30s
- [ ] Test wrong nodeId: Send to ESP32B, verify ESP32A ignores it

---

## Impact Assessment

### Current System (Before Fix)

| Feature | Works? | Notes |
|---------|--------|-------|
| Heartbeat | ✅ Yes | Path is correct |
| Offline Detection | ✅ Yes | Cloud Function works correctly |
| Command Sending | ✅ Yes | Frontend writes correctly |
| Command Execution | ⚠️ Partial | ESP32 executes but reads all commands |
| Command ACK | ❌ No | Nested structure not detected by Cloud Function |
| Command Logging | ❌ No | Cloud Function can't detect completion |
| Command Timeout | ❌ No | All commands timeout because status never updates |
| Multi-Node Support | ❌ No | All ESP32s read all commands |

### After Fix

| Feature | Works? | Notes |
|---------|--------|-------|
| Heartbeat | ✅ Yes | Already correct |
| Offline Detection | ✅ Yes | Already correct |
| Command Sending | ✅ Yes | Already correct |
| Command Execution | ✅ Yes | ESP32 reads only its commands |
| Command ACK | ✅ Yes | Root-level status update |
| Command Logging | ✅ Yes | Cloud Function detects completion |
| Command Timeout | ✅ Yes | Works if ESP32 offline |
| Multi-Node Support | ✅ Yes | Each node reads only its commands |

---

## Summary

### Critical Issues Found

1. ❌ **Command Path Missing NodeId** - ESP32 reads all commands instead of node-specific path
2. ❌ **ACK Structure Incompatible** - Nested status prevents Cloud Function detection
3. ❌ **No NodeId Validation** - ESP32 executes commands meant for other nodes
4. ❌ **No Status Checking** - ESP32 re-executes already completed commands

### Alignment Score Breakdown

| Component | Weight | Score | Notes |
|-----------|--------|-------|-------|
| Heartbeat | 20% | 100% | ✅ Perfect |
| Command Path | 30% | 0% | ❌ Missing nodeId |
| Command Structure | 20% | 50% | ⚠️ Reads fields but no validation |
| ACK/Status | 20% | 0% | ❌ Wrong structure |
| Error Handling | 10% | 0% | ❌ No error handling |
| **TOTAL** | | **40%** | 🔴 CRITICAL ISSUES |

### Priority Fixes

1. 🔴 **CRITICAL:** Add nodeId to command path
2. 🔴 **CRITICAL:** Fix status update (root level, not nested)
3. 🟡 **HIGH:** Add nodeId validation
4. 🟡 **HIGH:** Add status checking
5. 🟢 **MEDIUM:** Add error handling

---

**Next Step:** Update ESP32-A firmware with corrected code, test with frontend, verify Cloud Function logs success.
