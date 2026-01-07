# Motor & GPS Command Fix

## Problem

The ESP32B motor and GPS commands were not being verified by the Firebase Cloud Functions, causing them to fail silently. The relay commands on ESP32A worked correctly.

## Root Cause

The `verifyLiveCommand` Firebase function was configured to only trigger on this path pattern:

```
/devices/{deviceId}/commands/{nodeId}/{relayId}
```

This worked for relay commands which have paths like:
- `/devices/DEVICE_0005/commands/ESP32A/relay1`
- `/devices/DEVICE_0005/commands/ESP32A/relay2`

However, motor and GPS commands use different paths:
- `/devices/DEVICE_0005/commands/ESP32B/motor`
- `/devices/DEVICE_0005/commands/ESP32B/gps`

Since the function only listened to the 3-level pattern, it never triggered for motor/GPS commands.

## Solution

Updated the Firebase function to:

1. **Handle all command types** - Changed parameter name from `relayId` to `commandType` to be more generic
2. **Detect command type** - Added logic to identify whether a command is:
   - Relay command (`relay1` through `relay4`)
   - Motor command (`motor`)
   - GPS command (`gps`)
   - NPK command (`npk`)
3. **Log appropriately** - Different logging logic for each command type
4. **Store state correctly** - Only store relay state to RTDB (motor/GPS don't have persistent state)
5. **Update timeout handler** - Also fixed the `checkCommandTimeouts` function to iterate through nested node/command structure

## Changes Made

### File: `functions/src/liveCommands.ts`

#### 1. Function Trigger Path (Line 17)
```typescript
// Before
.ref('/devices/{deviceId}/commands/{nodeId}/{relayId}')

// After
.ref('/devices/{deviceId}/commands/{nodeId}/{commandType}')
```

#### 2. Command Type Detection (Lines 60-100)
Added logic to detect and handle different command types:
```typescript
const isRelay = commandType.startsWith('relay');
const isMotor = commandType === 'motor';
const isGPS = commandType === 'gps';
const isNPK = commandType === 'npk' || nodeId === 'ESP32C';
```

#### 3. Timeout Handler (Lines 215-260)
Updated to iterate through nested structure:
```typescript
// Iterate through all nodes (ESP32A, ESP32B, ESP32C)
for (const [nodeId, nodeCommands] of Object.entries(commands)) {
  // Iterate through all command types (relay1-4, motor, gps, npk)
  for (const [commandType, commandData] of Object.entries(nodeCommands)) {
    // Check timeout
  }
}
```

## Testing Required

After deploying the updated function, test:

1. **Motor Commands**
   - Send "down" command to ESP32B
   - Verify command completes and logs to Firestore
   - Send "up" command to ESP32B
   - Verify command completes and logs to Firestore

2. **GPS Commands**
   - Send GPS read command to ESP32B
   - Verify GPS coordinates are saved to `/devices/DEVICE_0005/sensors/gps`
   - Verify command status changes to "completed"
   - Check Firestore logs for GPS read entry

3. **Relay Commands (Regression Test)**
   - Ensure relay commands still work on ESP32A
   - Verify relay state is still stored to RTDB

## Deployment Instructions

```bash
# Build the functions
cd functions
npm run build

# Deploy to Firebase
firebase deploy --only functions:verifyLiveCommand,functions:checkCommandTimeouts

# Or deploy all functions
firebase deploy --only functions
```

## ESP32 Code Compatibility

The ESP32B code is already correct and doesn't need changes. It:
- ✅ Polls the correct paths (`/commands/ESP32B/motor` and `/commands/ESP32B/gps`)
- ✅ Updates status to "acknowledged" then "completed"
- ✅ Includes `requestedAt`, `executedAt`, and `actualState` fields
- ✅ Handles errors by setting status to "error" with error message

## Expected Behavior After Fix

### Motor Command Flow
1. Frontend sends motor command → `/devices/DEVICE_0005/commands/ESP32B/motor`
2. ESP32B polls and receives command
3. ESP32B ACKs: `{status: "acknowledged", acknowledgedAt: timestamp}`
4. **Firebase function logs ACK** ✨ (NEW - this was missing)
5. ESP32B executes motor action (5 seconds)
6. ESP32B completes: `{status: "completed", executedAt: timestamp, actualState: "motor_down"}`
7. **Firebase function logs completion** ✨ (NEW - this was missing)
8. Frontend shows success

### GPS Command Flow
1. Frontend sends GPS command → `/devices/DEVICE_0005/commands/ESP32B/gps`
2. ESP32B polls and receives command
3. ESP32B ACKs: `{status: "acknowledged", acknowledgedAt: timestamp}`
4. **Firebase function logs ACK** ✨ (NEW - this was missing)
5. ESP32B waits for GPS fix (up to 30 seconds)
6. ESP32B writes GPS data to `/devices/DEVICE_0005/sensors/gps`
7. ESP32B completes: `{status: "completed", executedAt: timestamp, actualState: "gps_read"}`
8. **Firebase function logs completion** ✨ (NEW - this was missing)
9. Frontend shows GPS coordinates

## Notes

- The relay-only state persistence is intentional - motor and GPS don't need persistent state
- Error handling now properly distinguishes between `status: "failed"` and `status: "error"`
- Timeout notifications will now work for motor/GPS commands
- Command logs in Firestore will now include motor/GPS commands
