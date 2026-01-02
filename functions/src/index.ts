import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

// Initialize Firebase Admin explicitly with RTDB URL for reliability
admin.initializeApp({
  databaseURL: "https://rice-padbuddy-default-rtdb.asia-southeast1.firebasedatabase.app",
});

/**
 * Scheduled function: Auto-log sensor readings every 5 minutes
 * 
 * This runs independently of your Vercel app and works 24/7.
 * It checks all devices in RTDB and logs new readings to Firestore.
 */
export const scheduledSensorLogger = functions.pubsub
  .schedule('*/5 * * * *')  // Cron expression: every 5 minutes
  .timeZone('Asia/Manila')  // Set timezone (adjust if needed)
  .onRun(async (context) => {
    console.log('[Scheduled] Starting sensor logging job...');
    
    const firestore = admin.firestore();
    const database = admin.database();
    
    try {
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
          console.log('[Scheduled] No devices found in RTDB (owners/ or devices/)');
          return null;
        }
        Object.assign(devices, legacySnap.val());
      }

      let totalLogged = 0;

      // Process each device
      for (const [deviceId, deviceData] of Object.entries(devices) as [string, any][]) {
        try {
          // Get NPK data from device
          const npk = deviceData.npk || deviceData.sensors || deviceData.readings;
          
          if (!npk) {
            // Log error: No sensor data found
            console.warn(`[Scheduled] No sensor data for device ${deviceId}`);
            await firestore.collection('errors').add({
              deviceId: deviceId,
              type: 'sensor_read_failed',
              severity: 'warning',
              message: `Device ${deviceId} has no sensor data in RTDB`,
              details: {
                availableKeys: Object.keys(deviceData),
                checkedAt: Date.now()
              },
              timestamp: admin.firestore.FieldValue.serverTimestamp(),
              resolved: false,
              notified: false
            });
            continue; // Skip devices without sensor data
          }

          // Normalize readings
          const nitrogen = npk.nitrogen ?? npk.n ?? npk.N ?? null;
          const phosphorus = npk.phosphorus ?? npk.p ?? npk.P ?? null;
          const potassium = npk.potassium ?? npk.k ?? npk.K ?? null;
          const deviceTimestamp = npk.lastUpdate ?? npk.timestamp ?? npk.ts ?? Date.now();

          // Skip if no actual readings
          if (nitrogen === null && phosphorus === null && potassium === null) {
            console.warn(`[Scheduled] Device ${deviceId} has null/empty sensor values`);
            await firestore.collection('errors').add({
              deviceId: deviceId,
              type: 'invalid_data',
              severity: 'warning',
              message: `Device ${deviceId} has incomplete sensor data (all null)`,
              details: { nitrogen, phosphorus, potassium },
              timestamp: admin.firestore.FieldValue.serverTimestamp(),
              resolved: false,
              notified: false
            });
            continue;
          }

          // Find paddies associated with this device
          const paddiesSnapshot = await firestore
            .collectionGroup('paddies')
            .where('deviceId', '==', deviceId)
            .get();

          if (paddiesSnapshot.empty) {
            console.log(`[Scheduled] No paddies found for device ${deviceId}`);
            // Only log as info-level error (not critical)
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

          // Log to each associated paddy (with deduplication check)
          const logPayload = {
            nitrogen,
            phosphorus,
            potassium,
            deviceTimestamp: deviceTimestamp ?? null,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            source: 'firebase-scheduled',
          };

          const writes: Promise<any>[] = [];
          paddiesSnapshot.forEach((paddyDoc) => {
            const logsCol = paddyDoc.ref.collection('logs');
            
            // Check if we already logged this reading (deduplication)
            writes.push(
              logsCol
                .orderBy('timestamp', 'desc')
                .limit(1)
                .get()
                .then(async (lastLogSnapshot) => {
                  if (!lastLogSnapshot.empty) {
                    const lastLog = lastLogSnapshot.docs[0].data();
                    // Handle Firestore Timestamp properly
                    let lastLogTime = 0;
                    if (lastLog.timestamp) {
                      if (lastLog.timestamp.toDate) {
                        lastLogTime = lastLog.timestamp.toDate().getTime();
                      } else if (lastLog.timestamp.getTime) {
                        lastLogTime = lastLog.timestamp.getTime();
                      } else if (typeof lastLog.timestamp === 'number') {
                        lastLogTime = lastLog.timestamp;
                      }
                    }
                    
                    const currentTime = deviceTimestamp || Date.now();
                    
                    // Skip if same values logged within last 5 minutes
                    if (
                      lastLog.nitrogen === nitrogen &&
                      lastLog.phosphorus === phosphorus &&
                      lastLog.potassium === potassium &&
                      lastLogTime > 0 &&
                      (currentTime - lastLogTime) < 5 * 60 * 1000
                    ) {
                      return null; // Skip duplicate
                    }
                  }
                  
                  // Log the reading
                  return logsCol.add(logPayload);
                })
                .catch((error) => {
                  console.error(`[Scheduled] Error checking/adding log for paddy ${paddyDoc.id}:`, error);
                  return null;
                })
            );
          });

          const results = await Promise.all(writes);
          const successful = results.filter(r => r !== null).length;
          totalLogged += successful;

          if (successful > 0) {
            console.log(`[Scheduled] Logged ${successful} reading(s) for device ${deviceId}`);
          }
        } catch (error: any) {
          console.error(`[Scheduled] Error processing device ${deviceId}:`, error);
        }
      }

      console.log(`[Scheduled] Job completed. Logged ${totalLogged} reading(s) total.`);
      return { success: true, logged: totalLogged };
    } catch (error: any) {
      console.error('[Scheduled] Fatal error:', error);
      console.error('[Scheduled] Error stack:', error.stack);
      throw error; // Re-throw to mark function as failed
    }
  });

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
