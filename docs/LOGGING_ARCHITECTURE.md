# Complete Logging Architecture for PadBuddy

## Logging Philosophy

**ESP32 Responsibility:**
- Write sensor data to RTDB (fast, lightweight)
- Send heartbeat every 60s
- Execute commands, report results to RTDB

**Cloud Functions Responsibility:**
- Read RTDB → Write Firestore (validated, enriched)
- Monitor health, detect errors
- Create notifications
- Audit all actions

## Firestore Collections Structure

```
# === SENSOR DATA LOGS (per paddy) ===
fields/{fieldId}/
  paddies/{paddyId}/
    logs/  # Historical sensor readings
      {logId}/
        nitrogen: 45.2
        phosphorus: 12.8
        potassium: 38.5
        temperature: 28.5
        humidity: 75.0
        timestamp: Timestamp
        deviceTimestamp: Timestamp
        source: "firebase-scheduled" | "esp32" | "manual"
        deviceId: "DEVICE_0001"
        loggedBy: "scheduledSensorLogger"

# === ERROR LOGS (top-level for aggregation) ===
errors/
  {errorId}/
    userId: "user123"
    fieldId: "field456"
    deviceId: "DEVICE_0001"
    paddyId: "paddy789"  # optional
    
    type: "sensor_read_failed" | "device_offline" | "command_failed" | 
          "heartbeat_missing" | "invalid_data" | "network_error"
    
    severity: "critical" | "warning" | "info"
    
    message: "Device DEVICE_0001 failed to read NPK sensor"
    details: {
      error: "Timeout reading Modbus",
      attemptNumber: 3,
      lastSuccessfulRead: Timestamp
    }
    
    timestamp: Timestamp
    resolved: false
    resolvedAt: null
    resolvedBy: null
    
    # Notification tracking
    notified: true
    notifiedAt: Timestamp
    notificationSent: ["email", "push", "sms"]

# === CONTROL/ACTION LOGS (audit trail) ===
control_logs/
  {logId}/
    userId: "user123"
    fieldId: "field456"
    deviceId: "DEVICE_0001"
    paddyId: "paddy789"  # optional
    
    action: "relay_on" | "relay_off" | "motor_extend" | "motor_retract" | 
            "calibrate_sensor" | "update_config" | "reboot_device"
    
    # Command details
    command: {
      type: "relay"
      relay: 1
      action: "on"
      duration: 300000
    }
    
    # Execution tracking
    status: "pending" | "processing" | "success" | "failed" | "timeout"
    
    requestedAt: Timestamp
    requestedBy: "user123"
    
    startedAt: Timestamp
    completedAt: Timestamp
    
    # Results
    result: {
      success: true
      executionTime: 1250  # ms
      relayState: "on"
      currentDraw: 0.5  # amps (if available)
    }
    
    error: null  # or error message if failed
    
    # Audit
    ipAddress: "192.168.1.100"
    userAgent: "Mozilla/5.0..."

# === DEVICE ERROR LOGS (device-specific) ===
device_logs/
  {deviceId}/
    errors/
      {errorId}/
        type: "sensor_malfunction" | "power_issue" | "network_unstable" | 
              "memory_low" | "firmware_crash"
        
        severity: "critical" | "warning" | "info"
        message: "NPK sensor not responding"
        
        # Device diagnostics
        diagnostics: {
          freeMemory: 45000  # bytes
          uptime: 86400000  # ms
          wifiSignal: -65  # dBm
          batteryLevel: 75  # %
          temperature: 45  # °C (device temp)
        }
        
        timestamp: Timestamp
        resolved: false
        
    health_history/  # Device health snapshots
      {snapshotId}/
        timestamp: Timestamp
        status: "online" | "offline"
        heartbeat: Timestamp
        uptime: 86400000
        freeMemory: 45000
        wifiSignal: -65
        batteryLevel: 75

# === NOTIFICATIONS (linked to errors/alerts) ===
notifications/
  {userId}/
    messages/
      {notificationId}/
        type: "error" | "alert" | "info" | "warning"
        title: "Device Offline"
        message: "DEVICE_0001 has been offline for 15 minutes"
        
        # Link to source
        sourceType: "error" | "alert" | "control_log"
        sourceId: "error123"
        
        # Delivery status
        channels: ["push", "email"]
        deliveryStatus: {
          push: {
            sent: true
            sentAt: Timestamp
            fcmResponse: {...}
          }
          email: {
            sent: false
            error: "Email service unavailable"
          }
        }
        
        # User interaction
        read: false
        readAt: null
        dismissed: false
        dismissedAt: null
        
        timestamp: Timestamp
        expiresAt: Timestamp  # Auto-dismiss after 7 days
```

## Cloud Functions Implementation

### 1. Enhanced Sensor Logger (with error tracking)

```typescript
export const scheduledSensorLogger = functions.pubsub
  .schedule('*/5 * * * *')
  .onRun(async (context) => {
    const firestore = admin.firestore();
    const database = admin.database();
    
    const devicesRef = database.ref('devices');
    const devicesSnapshot = await devicesRef.once('value');
    
    for (const [deviceId, deviceData] of Object.entries(devicesSnapshot.val())) {
      try {
        const sensors = deviceData.sensors || deviceData.npk;
        
        if (!sensors) {
          // Log error: No sensor data
          await firestore.collection('errors').add({
            userId: deviceData.owner || null,
            fieldId: deviceData.fieldId || null,
            deviceId: deviceId,
            type: 'sensor_read_failed',
            severity: 'warning',
            message: `Device ${deviceId} has no sensor data in RTDB`,
            details: {
              deviceData: deviceData,
              checkedAt: Date.now()
            },
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            resolved: false,
            notified: false
          });
          continue;
        }
        
        // Validate sensor readings
        const { nitrogen, phosphorus, potassium } = sensors;
        
        if (nitrogen === null || phosphorus === null || potassium === null) {
          // Log error: Invalid sensor data
          await firestore.collection('errors').add({
            deviceId: deviceId,
            type: 'invalid_data',
            severity: 'warning',
            message: `Device ${deviceId} has incomplete sensor data`,
            details: { nitrogen, phosphorus, potassium },
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            resolved: false,
            notified: false
          });
          continue;
        }
        
        // Find paddies for this device
        const paddiesSnapshot = await firestore
          .collectionGroup('paddies')
          .where('deviceId', '==', deviceId)
          .get();
        
        if (paddiesSnapshot.empty) {
          // Log error: Device not assigned
          await firestore.collection('errors').add({
            deviceId: deviceId,
            type: 'device_unassigned',
            severity: 'info',
            message: `Device ${deviceId} is not assigned to any paddy`,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            resolved: false,
            notified: false
          });
          continue;
        }
        
        // Log sensor data
        const logPayload = {
          nitrogen,
          phosphorus,
          potassium,
          temperature: sensors.temperature || null,
          humidity: sensors.humidity || null,
          deviceTimestamp: sensors.lastUpdate || Date.now(),
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          source: 'firebase-scheduled',
          deviceId: deviceId,
          loggedBy: 'scheduledSensorLogger'
        };
        
        for (const paddyDoc of paddiesSnapshot.docs) {
          await paddyDoc.ref.collection('logs').add(logPayload);
        }
        
        console.log(`✅ Logged data from ${deviceId} to ${paddiesSnapshot.size} paddies`);
        
      } catch (error) {
        // Log critical error
        await firestore.collection('errors').add({
          deviceId: deviceId,
          type: 'logging_failed',
          severity: 'critical',
          message: `Failed to log data from ${deviceId}`,
          details: {
            error: error.message,
            stack: error.stack
          },
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          resolved: false,
          notified: false
        });
        
        console.error(`❌ Error logging ${deviceId}:`, error);
      }
    }
  });
```

### 2. Control Action Logger (command audit)

```typescript
export const commandAuditLogger = functions.database
  .ref('devices/{deviceId}/commands/pending/{commandId}')
  .onCreate(async (snapshot, context) => {
    const { deviceId, commandId } = context.params;
    const command = snapshot.val();
    
    const firestore = admin.firestore();
    
    try {
      // Log the control action
      await firestore.collection('control_logs').doc(commandId).set({
        userId: command.requestedBy || 'unknown',
        fieldId: command.fieldId || null,
        deviceId: deviceId,
        paddyId: command.paddyId || null,
        
        action: `${command.type}_${command.action}`,
        command: command,
        
        status: 'pending',
        requestedAt: admin.firestore.Timestamp.fromMillis(command.requestedAt || Date.now()),
        requestedBy: command.requestedBy || 'unknown',
        
        startedAt: null,
        completedAt: null,
        result: null,
        error: null,
        
        ipAddress: command.ipAddress || null,
        userAgent: command.userAgent || null
      });
      
      console.log(`📝 Logged command ${commandId} for device ${deviceId}`);
      
    } catch (error) {
      console.error(`❌ Failed to log command ${commandId}:`, error);
    }
  });

// Listen for command completion
export const commandResultLogger = functions.database
  .ref('devices/{deviceId}/commands/history/{commandId}')
  .onCreate(async (snapshot, context) => {
    const { deviceId, commandId } = context.params;
    const result = snapshot.val();
    
    const firestore = admin.firestore();
    
    try {
      // Update control log with results
      await firestore.collection('control_logs').doc(commandId).update({
        status: result.status || 'completed',
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        result: result.result || null,
        error: result.error || null
      });
      
      console.log(`✅ Updated command ${commandId} result: ${result.status}`);
      
      // If command failed, create error log
      if (result.status === 'failed') {
        await firestore.collection('errors').add({
          deviceId: deviceId,
          type: 'command_failed',
          severity: 'warning',
          message: `Command ${result.type} failed on device ${deviceId}`,
          details: {
            commandId: commandId,
            command: result,
            error: result.error
          },
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          resolved: false,
          notified: false
        });
      }
      
    } catch (error) {
      console.error(`❌ Failed to update command result:`, error);
    }
  });
```

### 3. Error Notification Function

```typescript
export const errorNotifier = functions.firestore
  .document('errors/{errorId}')
  .onCreate(async (snap, context) => {
    const error = snap.data();
    const errorId = context.params.errorId;
    
    // Only notify critical and warning errors
    if (error.severity === 'info') {
      return null;
    }
    
    const firestore = admin.firestore();
    const userId = error.userId;
    
    if (!userId) {
      console.log('No user ID for error, skipping notification');
      return null;
    }
    
    try {
      // Create notification for user
      await firestore
        .collection('notifications')
        .doc(userId)
        .collection('messages')
        .add({
          type: 'error',
          title: getErrorTitle(error.type, error.severity),
          message: error.message,
          
          sourceType: 'error',
          sourceId: errorId,
          
          channels: ['push'],
          deliveryStatus: {},
          
          read: false,
          dismissed: false,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          expiresAt: admin.firestore.Timestamp.fromMillis(
            Date.now() + 7 * 24 * 60 * 60 * 1000  // 7 days
          )
        });
      
      // Get user's FCM token and send push notification
      const userDoc = await firestore.collection('users').doc(userId).get();
      const fcmToken = userDoc.data()?.fcmToken;
      
      if (fcmToken) {
        await admin.messaging().send({
          token: fcmToken,
          notification: {
            title: getErrorTitle(error.type, error.severity),
            body: error.message
          },
          data: {
            errorId: errorId,
            type: error.type,
            severity: error.severity,
            click_action: 'OPEN_ERROR_DETAILS'
          }
        });
      }
      
      // Mark as notified
      await snap.ref.update({
        notified: true,
        notifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        notificationSent: ['push']
      });
      
      console.log(`🔔 Notified user ${userId} about error ${errorId}`);
      
    } catch (err) {
      console.error(`❌ Failed to notify user:`, err);
    }
  });

function getErrorTitle(type: string, severity: string): string {
  const prefix = severity === 'critical' ? '🚨' : '⚠️';
  const titles: Record<string, string> = {
    'device_offline': 'Device Offline',
    'sensor_read_failed': 'Sensor Read Failed',
    'command_failed': 'Command Failed',
    'invalid_data': 'Invalid Sensor Data',
    'heartbeat_missing': 'Device Not Responding'
  };
  return `${prefix} ${titles[type] || 'Device Error'}`;
}
```

## Summary

**✅ Data Flow:**
```
ESP32
  ├─ Writes sensors + heartbeat → RTDB
  └─ Executes commands → Writes results to RTDB

Cloud Functions
  ├─ scheduledSensorLogger (every 5 min)
  │   ├─ Reads RTDB sensors
  │   ├─ Validates data
  │   ├─ Writes to fields/{fieldId}/paddies/{paddyId}/logs
  │   └─ Logs errors to errors/ collection
  │
  ├─ deviceHealthMonitor (every 2 min)
  │   ├─ Checks heartbeat
  │   └─ Creates device_offline errors
  │
  ├─ commandAuditLogger (on command creation)
  │   └─ Writes to control_logs/ collection
  │
  ├─ commandResultLogger (on command completion)
  │   ├─ Updates control_logs/ with results
  │   └─ Creates errors if command failed
  │
  └─ errorNotifier (on error creation)
      ├─ Creates notification for user
      └─ Sends push notification
```

**✅ Collections:**
- `fields/{fieldId}/paddies/{paddyId}/logs` - Sensor data
- `errors/` - All system errors (top-level for aggregation)
- `control_logs/` - All user actions/commands (audit trail)
- `device_logs/{deviceId}/errors` - Device-specific errors
- `notifications/{userId}/messages` - User notifications

This gives you complete visibility into:
- What data was logged and when
- What errors occurred and why
- What actions users took and their results
- Full audit trail for compliance
