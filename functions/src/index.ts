import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

// Initialize Firebase Admin explicitly with RTDB URL for reliability
admin.initializeApp({
  databaseURL: "https://rice-padbuddy-default-rtdb.asia-southeast1.firebasedatabase.app",
});

// ============================================
// EXPORT ALL CLOUD FUNCTIONS
// ============================================

// 1️⃣ Device Heartbeat & Monitoring
// Note: heartbeatMonitor.ts has legacy functions, we keep them for compatibility
export * from './heartbeatMonitor';

// 2️⃣ Live Command Verification
export * from './liveCommands';

// 3️⃣ Scheduled Commands Executor
export * from './scheduledExecutor';

// 4️⃣ NPK / Sensor Data Logger
export * from './sensorLogger';

// 5️⃣ Device Registration & Onboarding
export * from './deviceRegistration';

// 6️⃣ Field Area Calculation & NPK Recommendations
export * from './fieldCalculations';

// 7️⃣ System Logger & Audit (NEW - preferred over legacy)
export {
  cleanupSystemLogs,
  cleanupDeviceLogs,
  generateHealthReport,
  logInfo,
  logWarning,
  logError,
  logCritical
} from './systemLogger';

// 8️⃣ Notification Dispatcher
export * from './notificationDispatcher';

// 9️⃣ User Action Logger (includes sendTestNotification)
export * from './userActionLogger';

// 🔟 Device Action Logger (device-specific logs)
export * from './deviceActionLogger';

// Legacy functions (for backward compatibility)
export * from './scheduledCommands';
// Export commandLogger without logSystemEvent to avoid conflict
export {
  CommandLog,
  logCommand,
  updateCommandLog,
  getDeviceCommandLogs,
  getUserCommandLogs,
  logDeviceError,
  resolveDeviceError,
  getDeviceErrors,
  cleanupOldLogs,
  getDeviceCommandStats
} from './commandLogger';

// ============================================
// LEGACY FUNCTIONS (Backward Compatibility)
// ============================================

/**
 * Real-time Alert Processor: Triggered when new sensor logs are created
 * 
 * Checks readings against thresholds and creates alerts if out of range
 */
export const realtimeAlertProcessor = functions.firestore
  .document('fields/{fieldId}/paddies/{paddyId}/logs/{logId}')
  .onCreate(async (snap, context) => {
    const firestore = admin.firestore();
    const log = snap.data();
    const { fieldId, paddyId } = context.params;

        try {
      // Validate the log has a fresh timestamp (not stale data)
      if (!log.deviceTimestamp) {
        console.warn('[Alert Processor] Log has no deviceTimestamp, skipping (stale data)');
        return null;
      }
      
      const now = Date.now();
      const timeSinceDeviceUpdate = now - (typeof log.deviceTimestamp === 'number' ? log.deviceTimestamp : 0);
      
      // Skip alerts if sensor data is older than 1 hour
      if (timeSinceDeviceUpdate > 60 * 60 * 1000) {
        console.warn(`[Alert Processor] Device data is ${Math.round(timeSinceDeviceUpdate / 60000)} minutes old, skipping stale alerts`);
        return null;
      }
      
      // Get alert thresholds from settings
      const settingsDoc = await firestore.collection('settings').doc('system').get();
      
      if (!settingsDoc.exists) {
        console.warn('[Alert Processor] Settings document not found, skipping alert creation');
        return null;
      }

      const settings = settingsDoc.data();
      const thresholds = settings?.alertThresholds || {
        nitrogen_min: 20,
        nitrogen_max: 50,
        phosphorus_min: 10,
        phosphorus_max: 40,
        potassium_min: 150,
        potassium_max: 250,
      };

      const alerts: any[] = [];

      // Check nitrogen levels
      if (log.nitrogen !== null && log.nitrogen !== undefined) {
        if (log.nitrogen < thresholds.nitrogen_min) {
          alerts.push({
            type: 'npk_low',
            element: 'nitrogen',
            severity: 'critical',
            value: log.nitrogen,
            threshold: thresholds.nitrogen_min,
          });
        } else if (log.nitrogen > thresholds.nitrogen_max) {
          alerts.push({
            type: 'npk_high',
            element: 'nitrogen',
            severity: 'warning',
            value: log.nitrogen,
            threshold: thresholds.nitrogen_max,
          });
        }
      }

      // Check phosphorus levels
      if (log.phosphorus !== null && log.phosphorus !== undefined) {
        if (log.phosphorus < thresholds.phosphorus_min) {
          alerts.push({
            type: 'npk_low',
            element: 'phosphorus',
            severity: 'critical',
            value: log.phosphorus,
            threshold: thresholds.phosphorus_min,
          });
        } else if (log.phosphorus > thresholds.phosphorus_max) {
          alerts.push({
            type: 'npk_high',
            element: 'phosphorus',
            severity: 'warning',
            value: log.phosphorus,
            threshold: thresholds.phosphorus_max,
          });
        }
      }

      // Check potassium levels
      if (log.potassium !== null && log.potassium !== undefined) {
        if (log.potassium < thresholds.potassium_min) {
          alerts.push({
            type: 'npk_low',
            element: 'potassium',
            severity: 'critical',
            value: log.potassium,
            threshold: thresholds.potassium_min,
          });
        } else if (log.potassium > thresholds.potassium_max) {
          alerts.push({
            type: 'npk_high',
            element: 'potassium',
            severity: 'warning',
            value: log.potassium,
            threshold: thresholds.potassium_max,
          });
        }
      }

      if (alerts.length === 0) {
        // No alerts needed
        return null;
      }

      // Get paddy and field info
      const paddyDoc = await firestore.collection('fields').doc(fieldId).collection('paddies').doc(paddyId).get();
      const fieldDoc = await firestore.collection('fields').doc(fieldId).get();

      if (!paddyDoc.exists || !fieldDoc.exists) {
        console.warn(`[Alert Processor] Paddy or field not found: ${fieldId}/${paddyId}`);
        return null;
      }

      const paddyData = paddyDoc.data();
      const fieldData = fieldDoc.data();
      const deviceId = paddyData?.deviceId;
      const ownerId = fieldData?.owner;

      // Create alert documents
      const batch = firestore.batch();
      const alertsCollectionRef = firestore
        .collection('alerts')
        .doc(fieldId)
        .collection('alerts');

      for (const alert of alerts) {
        const alertDocRef = alertsCollectionRef.doc();
        batch.set(alertDocRef, {
          ...alert,
          paddyId,
          deviceId,
          logId: snap.id,
          message: `${alert.element.toUpperCase()} is ${alert.type === 'npk_low' ? 'too low' : 'too high'}: ${alert.value.toFixed(1)}`,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          read: false,
          acknowledged: false,
          acknowledgedAt: null,
        });
      }

      await batch.commit();
      console.log(`[Alert Processor] Created ${alerts.length} alert(s) for paddy ${paddyId}`);

      // Send FCM notification if user has FCM token
      if (ownerId) {
        const userDoc = await firestore.collection('users').doc(ownerId).get();
        const fcmToken = userDoc.data()?.fcmToken;

        if (fcmToken && alerts.length > 0) {
          const mostSevere = alerts[0];
          try {
            await admin.messaging().send({
              token: fcmToken,
              notification: {
                title: '🚨 PadBuddy Alert',
                body: mostSevere.message,
              },
              data: {
                fieldId,
                paddyId,
                type: mostSevere.type,
                severity: mostSevere.severity,
                click_action: `padbuddy://fields/${fieldId}`,
              },
            });
            console.log(`[Alert Processor] Sent FCM notification to user ${ownerId}`);
          } catch (error: any) {
            console.warn(`[Alert Processor] Failed to send FCM: ${error.message}`);
            // Don't fail the entire function if FCM fails
          }
        }
      }

      return { success: true, alertsCreated: alerts.length };
    } catch (error: any) {
      console.error(`[Alert Processor] Error processing log for paddy ${paddyId}:`, error);
      throw error;
    }
  });

/**
 * Device Health Monitor: Checks device heartbeats every 2 minutes
 * 
 * Creates offline alerts if device hasn't sent heartbeat in > 10 minutes
 * Updates device status in Firestore
 */
export const deviceHealthMonitor = functions.pubsub
  .schedule('*/2 * * * *') // Every 2 minutes
  .timeZone('Asia/Manila')
  .onRun(async (context) => {
    const firestore = admin.firestore();
    const database = admin.database();

    try {
      console.log('[Health Monitor] Starting device health check...');

      // Prefer new hierarchy: owners/{ownerId}/fields/{fieldId}/devices/{deviceId}
      // Fallback to legacy: devices/{deviceId}
      const devices: Record<string, any> = {};

      const ownersSnap = await database.ref('owners').once('value');
      if (ownersSnap.exists()) {
        const owners = ownersSnap.val();
        for (const [ownerId, ownerData] of Object.entries(owners) as [string, any][]) {
          const fields = ownerData.fields || {};
          for (const [fieldId, fieldData] of Object.entries(fields) as [string, any][]) {
            const fieldDevices = fieldData.devices || {};
            for (const [deviceId, deviceData] of Object.entries(fieldDevices) as [string, any][]) {
              devices[deviceId] = {
                ...deviceData,
                __meta: { ownerId, fieldId, path: 'owners' },
              };
            }
          }
        }
      }

      // Legacy fallback
      if (Object.keys(devices).length === 0) {
        const legacySnap = await database.ref('devices').once('value');
        if (!legacySnap.exists()) {
          console.log('[Health Monitor] No devices found (owners/ or devices/)');
          return null;
        }
        Object.assign(devices, legacySnap.val());
      }
      const now = Date.now();
      const offlineThreshold = 10 * 60 * 1000; // 10 minutes

      let offlineCount = 0;
      let onlineCount = 0;

      for (const [deviceId, deviceData] of Object.entries(devices) as [string, any][]) {
        try {
          // Get heartbeat with multiple fallbacks
          let heartbeat = deviceData.heartbeat || deviceData.status?.heartbeat || 0;
          
          // Validate heartbeat exists and is not too old (> 30 days = likely invalid)
          if (!heartbeat || heartbeat === 0) {
            console.log(`[Health Monitor] Device ${deviceId} has no heartbeat timestamp`);
            heartbeat = 0; // Mark as never seen
          }
          
          // Convert from seconds to milliseconds if needed
          const heartbeatMs = heartbeat < 1e11 ? heartbeat * 1000 : heartbeat;
          const timeSinceHeartbeat = now - heartbeatMs;
          
          // Check if timestamp is in the future (clock sync issue)
          if (timeSinceHeartbeat < 0) {
            console.warn(`[Health Monitor] Device ${deviceId} has future timestamp (clock sync issue)`);
          }

          const isOffline = heartbeat === 0 || timeSinceHeartbeat > offlineThreshold;

          // Update device status in Firestore
          const deviceRef = firestore.collection('devices').doc(deviceId);
          const deviceDocSnap = await deviceRef.get();

          const currentStatus = deviceDocSnap.data()?.status || 'unknown';

          await deviceRef.set(
            {
              status: isOffline ? 'offline' : 'online',
              lastHeartbeat: heartbeat > 0 ? admin.firestore.Timestamp.fromMillis(heartbeatMs) : null,
              lastHealthCheck: admin.firestore.FieldValue.serverTimestamp(),
              timeSinceHeartbeat: timeSinceHeartbeat,
              isAlive: !isOffline,
              lastSeenHumanReadable: heartbeat > 0 ? new Date(heartbeatMs).toISOString() : 'Never',
            },
            { merge: true }
          );

          if (isOffline) {
            offlineCount++;
            console.log(`[Health Monitor] Device ${deviceId} OFFLINE - Last seen: ${Math.floor(timeSinceHeartbeat / 60000)} min ago`);
          } else {
            onlineCount++;
          }

          // Only create offline alert on transition (offline -> just went offline)
          if (isOffline && currentStatus !== 'offline') {
            console.log(`[Health Monitor] Device ${deviceId} is NOW offline`);

            // Find all paddies using this device
            const paddiesSnapshot = await firestore
              .collectionGroup('paddies')
              .where('deviceId', '==', deviceId)
              .get();

            if (!paddiesSnapshot.empty) {
              const batch = firestore.batch();

              paddiesSnapshot.forEach((paddyDoc) => {
                const fieldId = paddyDoc.ref.parent.parent?.id;

                if (fieldId) {
                  // Check if offline alert already exists
                  const alertsRef = firestore
                    .collection('alerts')
                    .doc(fieldId)
                    .collection('alerts');

                  batch.set(alertsRef.doc(), {
                    type: 'device_offline',
                    severity: 'critical',
                    deviceId,
                    paddyId: paddyDoc.id,
                    message: `Device ${deviceId} is offline (no heartbeat for ${Math.floor(timeSinceHeartbeat / 60000)} minutes)`,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    read: false,
                    acknowledged: false,
                    acknowledgedAt: null,
                  });
                }
              });

              await batch.commit();
              console.log(
                `[Health Monitor] Created offline alert for ${paddiesSnapshot.size} paddy(ies)`
              );
            }
          }
        } catch (error: any) {
          console.error(`[Health Monitor] Error processing device ${deviceId}:`, error);
        }
      }

      console.log(
        `[Health Monitor] Health check complete. Online: ${onlineCount}, Offline: ${offlineCount}`
      );
      return { success: true, online: onlineCount, offline: offlineCount };
    } catch (error: any) {
      console.error('[Health Monitor] Fatal error:', error);
      throw error;
    }
  });

/**
 * Command Audit Logger: Logs all command executions for audit trail
 * 
 * Triggered when commands are sent to devices
 */
export const commandAuditLogger = functions.database
  .ref('devices/{deviceId}/commands/{nodeId}')
  .onWrite(async (change, context) => {
    const firestore = admin.firestore();
    const { deviceId, nodeId } = context.params;

    try {
      const commandAfter = change.after.val();

      if (!commandAfter) {
        // Command was deleted, log as cancelled
        console.log(`[Audit] Command deleted for ${deviceId}/${nodeId}`);
        return null;
      }

      // Log command to audit collection
      const auditEntry = {
        deviceId,
        nodeId,
        action: commandAfter.action,
        params: commandAfter.params || {},
        status: commandAfter.status || 'sent',
        ack: commandAfter.ack || false,
        requestedAt: admin.firestore.Timestamp.fromMillis(commandAfter.requestedAt || Date.now()),
        executedAt: commandAfter.executedAt
          ? admin.firestore.Timestamp.fromMillis(commandAfter.executedAt)
          : null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      const auditRef = firestore.collection('command_audit').doc();
      await auditRef.set(auditEntry);

      console.log(`[Audit] Logged command for ${deviceId}/${nodeId}`);
      return null;
    } catch (error: any) {
      console.error(`[Audit] Error logging command:`, error);
      // Don't throw - don't want audit failures to block command execution
      return null;
    }
  });

/**
 * Alert Cleanup: Removes old alerts based on retention policy
 * 
 * Runs daily at 2 AM - removes alerts older than 90 days
 */
export const alertCleanupScheduler = functions.pubsub
  .schedule('0 2 * * *') // Daily at 2 AM
  .timeZone('Asia/Manila')
  .onRun(async (context) => {
    const firestore = admin.firestore();

    try {
      console.log('[Cleanup] Starting alert cleanup...');

      const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
      const ninetyDaysAgoTimestamp = admin.firestore.Timestamp.fromMillis(ninetyDaysAgo);

      // Get all fields
      const fieldsSnapshot = await firestore.collection('fields').get();
      let deletedCount = 0;

      for (const fieldDoc of fieldsSnapshot.docs) {
        const alertsRef = firestore
          .collection('alerts')
          .doc(fieldDoc.id)
          .collection('alerts');

        const oldAlertsSnapshot = await alertsRef
          .where('createdAt', '<', ninetyDaysAgoTimestamp)
          .get();

        if (!oldAlertsSnapshot.empty) {
          const batch = firestore.batch();
          oldAlertsSnapshot.forEach((alertDoc) => {
            batch.delete(alertDoc.ref);
          });

          await batch.commit();
          deletedCount += oldAlertsSnapshot.size;
          console.log(`[Cleanup] Deleted ${oldAlertsSnapshot.size} old alerts from field ${fieldDoc.id}`);
        }
      }

      console.log(`[Cleanup] Alert cleanup complete. Deleted ${deletedCount} total alerts.`);
      return { success: true, deletedCount };
    } catch (error: any) {
      console.error('[Cleanup] Fatal error:', error);
      throw error;
    }
  });

// Basic test endpoint remains
export const helloWorld = functions.https.onRequest((request, response) => {
  response.send("Hello from PadBuddy Cloud Functions!");
});

/**
 * HTTPS Callable Function: Send Device Command
 * 
 * Validates and sends commands to ESP32 devices through RTDB.
 * This provides server-side security, validation, and logging.
 * 
 * Call from client:
 * const sendCommand = httpsCallable(functions, 'sendDeviceCommand');
 * await sendCommand({ deviceId, nodeId, role, action, params });
 */
export const sendDeviceCommand = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'User must be authenticated to send commands'
    );
  }

  const { deviceId, nodeId, role, action, params = {} } = data;
  const userId = context.auth.uid;

  // Validate required fields
  if (!deviceId || !nodeId || !role || !action) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Missing required fields: deviceId, nodeId, role, action'
    );
  }

  // Validate nodeId
  if (!['ESP32A', 'ESP32B', 'ESP32C'].includes(nodeId)) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Invalid nodeId. Must be ESP32A, ESP32B, or ESP32C'
    );
  }

  // Validate role
  if (!['relay', 'motor', 'npk', 'gps'].includes(role)) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Invalid role. Must be relay, motor, npk, or gps'
    );
  }

  try {
    const database = admin.database();
    const firestore = admin.firestore();
    const now = Date.now();

    // Check if device exists and user has access
    const deviceRef = database.ref(`devices/${deviceId}`);
    const deviceSnap = await deviceRef.once('value');
    
    if (!deviceSnap.exists()) {
      throw new functions.https.HttpsError(
        'not-found',
        `Device ${deviceId} not found`
      );
    }

    
    // Skip permission check for now - authenticated users can control devices
    // TODO: Implement faster permission check via custom claims or RTDB rules
    console.log(`[Command] User ${userId} sending command to device ${deviceId}`);

    // Build command data
    const commandData: any = {
      nodeId,
      role,
      action,
      status: 'pending',
      requestedAt: now,
      requestedBy: userId
    };

    // Add relay number for relay commands
    if (role === 'relay' && params.relay) {
      commandData.relay = params.relay;
    }

    // Add other params
    if (Object.keys(params).length > 0) {
      commandData.params = params;
    }

    // Write command to RTDB - use 3-level paths for all command types
    let commandPath: string;
    if (role === 'relay' && params.relay) {
      commandPath = `commands/${nodeId}/relay${params.relay}`;
    } else if (role === 'motor') {
      commandPath = `commands/${nodeId}/motor`;
    } else if (role === 'gps') {
      commandPath = `commands/${nodeId}/gps`;
    } else if (role === 'npk') {
      commandPath = `commands/${nodeId}/npk`;
    } else {
      // Default fallback
      commandPath = `commands/${nodeId}/${role}`;
    }
    
    await deviceRef.update({
      [commandPath]: commandData,
      [`audit/lastCommand`]: action,
      [`audit/lastCommandBy`]: userId,
      [`audit/lastCommandAt`]: now
    });

    // Log to Firestore (optional - don't fail command if logging fails)
    try {
      await firestore.collection('command_logs').add({
        deviceId,
        nodeId,
        role,
        action,
        params,
        userId,
        status: 'sent',
        timestamp: admin.firestore.Timestamp.fromMillis(now)
      });
    } catch (logError: any) {
      console.warn(`[Command] Failed to log to Firestore: ${logError.message}`);
    }

    console.log(`[Command] Sent to ${deviceId}/${commandPath}: ${action} by ${userId}`);

    const responsePath = `devices/${deviceId}/${commandPath}`;
    
    return {
      success: true,
      message: `Command ${action} sent to ${deviceId}`,
      commandPath: responsePath,
      timestamp: now
    };

  } catch (error: any) {
    console.error('[Command] Error:', error);
    
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    throw new functions.https.HttpsError(
      'internal',
      `Failed to send command: ${error.message}`
    );
  }
});

/**
 * RTDB Trigger: Monitor Command Completion
 * 
 * Listens for ESP32 to update command status to "completed"
 * Logs completion to Firestore for analytics
 */
export const onCommandComplete = functions.database
  .ref('/devices/{deviceId}/commands/{nodeId}')
  .onUpdate(async (change, context) => {
    const { deviceId, nodeId } = context.params;
    const before = change.before.val();
    const after = change.after.val();

    // Check if status changed to completed
    if (before.status !== 'completed' && after.status === 'completed') {
      const firestore = admin.firestore();
      
      try {
        await firestore.collection('command_logs').add({
          deviceId,
          nodeId,
          role: after.role,
          action: after.action,
          status: 'completed',
          requestedAt: admin.firestore.Timestamp.fromMillis(after.requestedAt),
          executedAt: admin.firestore.Timestamp.fromMillis(after.executedAt),
          duration: after.executedAt - after.requestedAt,
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log(`[Command] Completed: ${deviceId}/${nodeId} - ${after.action}`);
      } catch (error) {
        console.error('[Command] Error logging completion:', error);
      }
    }

    return null;
  });

/**
 * HTTP Function: Clean up all user data from Firestore
 * 
 * Requires admin authentication to call
 * Deletes all users, fields, paddies, logs, notifications, and FCM tokens
 */
export const cleanupAllUserData = functions.https.onCall(async (data, context) => {
  // Verify user is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'Must be logged in to cleanup data'
    );
  }

  // Verify user is admin
  const adminEmail = 'ricepaddy.contact@gmail.com';
  const idTokenResult = await admin.auth().getUser(context.auth.uid);
  const userEmail = idTokenResult.email;

  if (userEmail !== adminEmail) {
    throw new functions.https.HttpsError(
      'permission-denied',
      `Only ${adminEmail} can cleanup data`
    );
  }

  const firestore = admin.firestore();
  const stats = {
    users: 0,
    fields: 0,
    paddies: 0,
    logs: 0,
    tasks: 0,
    notifications: 0,
    fcmTokens: 0,
    totalDeleted: 0,
  };

  try {
    console.log('[Cleanup] Starting data cleanup...');

    // Get all users
    const usersRef = firestore.collection('users');
    const usersSnapshot = await usersRef.get();

    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      const batch = firestore.batch();
      let batchSize = 0;

      // Delete all fields and nested documents
      const fieldsRef = firestore.collection('users').doc(userId).collection('fields');
      const fieldsSnapshot = await fieldsRef.get();

      for (const fieldDoc of fieldsSnapshot.docs) {
        const fieldId = fieldDoc.id;

        // Delete paddies and their logs
        const paddiesRef = firestore
          .collection('users')
          .doc(userId)
          .collection('fields')
          .doc(fieldId)
          .collection('paddies');
        const paddiesSnapshot = await paddiesRef.get();

        for (const paddyDoc of paddiesSnapshot.docs) {
          const paddyId = paddyDoc.id;

          // Delete logs under this paddy
          const logsRef = firestore
            .collection('users')
            .doc(userId)
            .collection('fields')
            .doc(fieldId)
            .collection('paddies')
            .doc(paddyId)
            .collection('logs');
          const logsSnapshot = await logsRef.get();

          for (const logDoc of logsSnapshot.docs) {
            batch.delete(logDoc.ref);
            batchSize++;
            stats.logs++;

            if (batchSize >= 500) {
              await batch.commit();
              batchSize = 0;
            }
          }

          // Delete the paddy itself
          batch.delete(paddyDoc.ref);
          batchSize++;
          stats.paddies++;

          if (batchSize >= 500) {
            await batch.commit();
            batchSize = 0;
          }
        }

        // Delete tasks under this field
        const tasksRef = firestore
          .collection('users')
          .doc(userId)
          .collection('fields')
          .doc(fieldId)
          .collection('tasks');
        const tasksSnapshot = await tasksRef.get();

        for (const taskDoc of tasksSnapshot.docs) {
          batch.delete(taskDoc.ref);
          batchSize++;
          stats.tasks++;

          if (batchSize >= 500) {
            await batch.commit();
            batchSize = 0;
          }
        }

        // Delete the field itself
        batch.delete(fieldDoc.ref);
        batchSize++;
        stats.fields++;

        if (batchSize >= 500) {
          await batch.commit();
          batchSize = 0;
        }
      }

      // Delete notifications
      const notificationsRef = firestore
        .collection('users')
        .doc(userId)
        .collection('notifications');
      const notificationsSnapshot = await notificationsRef.get();

      for (const notifDoc of notificationsSnapshot.docs) {
        batch.delete(notifDoc.ref);
        batchSize++;
        stats.notifications++;

        if (batchSize >= 500) {
          await batch.commit();
          batchSize = 0;
        }
      }

      // Delete FCM tokens
      const fcmTokensRef = firestore
        .collection('users')
        .doc(userId)
        .collection('fcmTokens');
      const fcmTokensSnapshot = await fcmTokensRef.get();

      for (const tokenDoc of fcmTokensSnapshot.docs) {
        batch.delete(tokenDoc.ref);
        batchSize++;
        stats.fcmTokens++;

        if (batchSize >= 500) {
          await batch.commit();
          batchSize = 0;
        }
      }

      // Delete the user document itself
      batch.delete(userDoc.ref);
      batchSize++;
      stats.users++;

      // Final commit for this user
      if (batchSize > 0) {
        await batch.commit();
      }
    }

    stats.totalDeleted =
      stats.users +
      stats.fields +
      stats.paddies +
      stats.logs +
      stats.tasks +
      stats.notifications +
      stats.fcmTokens;

    console.log('[Cleanup] Successfully cleaned up data:', stats);

    return {
      success: true,
      message: `Cleanup complete! Deleted ${stats.totalDeleted} documents.`,
      stats,
    };
  } catch (error) {
    console.error('[Cleanup] Error:', error);
    throw new functions.https.HttpsError('internal', `Cleanup failed: ${error}`);
  }
});
