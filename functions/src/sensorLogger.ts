/**
 * NPK / Sensor Data Logger
 * Stores sensor readings from devices
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

/**
 * Log Sensor Data
 * Trigger: RTDB /devices/{deviceId}/npk onWrite
 * 
 * When NPK sensor data is updated:
 * - Validates data
 * - Stores in Firestore device logs
 * - Optionally aggregates for field statistics
 */
export const logSensorData = functions.database
  .ref('/devices/{deviceId}/npk')
  .onWrite(async (change, context) => {
    const deviceId = context.params.deviceId;
    
    // Skip if data was deleted
    if (!change.after.exists()) {
      return null;
    }
    
    const npkData = change.after.val();
    const previousData = change.before.exists() ? change.before.val() : null;
    
    // Skip if data hasn't actually changed
    if (
      previousData &&
      previousData.n === npkData.n &&
      previousData.p === npkData.p &&
      previousData.k === npkData.k &&
      previousData.timestamp === npkData.timestamp
    ) {
      return null;
    }
    
    console.log(`[Sensor Logger] NPK data updated for device ${deviceId}`);
    
    try {
      const firestore = admin.firestore();
      
      // Validate NPK data
      const nitrogen = npkData.n ?? npkData.nitrogen ?? npkData.N ?? null;
      const phosphorus = npkData.p ?? npkData.phosphorus ?? npkData.P ?? null;
      const potassium = npkData.k ?? npkData.potassium ?? npkData.K ?? null;
      const timestamp = npkData.timestamp ?? npkData.lastUpdate ?? Date.now();
      
      // Check if data is valid
      if (nitrogen === null && phosphorus === null && potassium === null) {
        console.warn(`[Sensor Logger] Invalid NPK data for device ${deviceId}: all values are null`);
        return null;
      }
      
      // Check if data is fresh (not older than 1 hour)
      // Handle both relative timestamps (device millis) and absolute timestamps (epoch time)
      const now = Date.now();
      const isRelativeTime = timestamp < 10000000000; // < 10 billion = device millis
      
      if (!isRelativeTime) {
        // Absolute timestamp - check if data is fresh
        const dataAge = now - timestamp;
        
        if (dataAge > 60 * 60 * 1000) {
          console.warn(`[Sensor Logger] Stale NPK data for device ${deviceId}: ${Math.floor(dataAge / 60000)} minutes old`);
          return null;
        }
      } else {
        // Relative timestamp (device millis since boot) - accept any non-zero value as fresh
        console.log(`[Sensor Logger] NPK data with relative timestamp: ${timestamp}ms (device boot time)`);
      }
      
      // Get device document
      const devicesQuery = await firestore
        .collection('devices')
        .where('deviceId', '==', deviceId)
        .limit(1)
        .get();
      
      if (devicesQuery.empty) {
        console.warn(`[Sensor Logger] Device ${deviceId} not found in Firestore`);
        return null;
      }
      
      const deviceDoc = devicesQuery.docs[0];
      const deviceData = deviceDoc.data();
      const deviceDocId = deviceDoc.id;
      
      // Check for duplicate logs (deduplication)
      const recentLogsQuery = await firestore
        .collection('devices')
        .doc(deviceDocId)
        .collection('logs')
        .where('type', '==', 'sensor')
        .orderBy('timestamp', 'desc')
        .limit(1)
        .get();
      
      if (!recentLogsQuery.empty) {
        const lastLog = recentLogsQuery.docs[0].data();
        const lastTimestamp = lastLog.details?.sensorTimestamp || 0;
        
        // Skip if we already logged this exact reading
        if (lastTimestamp === timestamp) {
          console.log(`[Sensor Logger] Duplicate sensor reading detected, skipping`);
          return null;
        }
        
        // Skip if same values within 5 minutes
        if (
          Math.abs(lastTimestamp - timestamp) < 5 * 60 * 1000 &&
          lastLog.details?.nitrogen === nitrogen &&
          lastLog.details?.phosphorus === phosphorus &&
          lastLog.details?.potassium === potassium
        ) {
          console.log(`[Sensor Logger] Near-duplicate sensor reading detected, skipping`);
          return null;
        }
      }
      
      // Log sensor reading
      const logData = {
        type: 'sensor',
        command: 'npk_reading',
        requestedState: 'READ',
        actualState: 'LOGGED',
        success: true,
        timestamp: now,
        commandId: `sensor_${timestamp}`,
        functionTriggered: 'logSensorData',
        userId: deviceData.ownerId,
        details: {
          nitrogen: nitrogen,
          phosphorus: phosphorus,
          potassium: potassium,
          sensorTimestamp: timestamp,
          source: 'rtdb_trigger'
        }
      };
      
      await firestore
        .collection('devices')
        .doc(deviceDocId)
        .collection('logs')
        .add(logData);
      
      console.log(`[Sensor Logger] Logged NPK reading for device ${deviceId}: N=${nitrogen}, P=${phosphorus}, K=${potassium}`);
      
      // Optional: Aggregate field statistics
      if (deviceData.fieldId) {
        try {
          // Get field document
          const fieldDoc = await firestore.collection('fields').doc(deviceData.fieldId).get();
          
          if (fieldDoc.exists) {
            const fieldData = fieldDoc.data();
            
            // Calculate average NPK for all devices in this field
            const devicesInField = fieldData?.devices || [];
            
            if (devicesInField.length > 0) {
              let totalN = 0, totalP = 0, totalK = 0, count = 0;
              
              for (const devId of devicesInField) {
                const database = admin.database();
                const devNpkSnap = await database.ref(`/devices/${devId}/npk`).once('value');
                
                if (devNpkSnap.exists()) {
                  const devNpk = devNpkSnap.val();
                  const n = devNpk.n ?? devNpk.nitrogen ?? 0;
                  const p = devNpk.p ?? devNpk.phosphorus ?? 0;
                  const k = devNpk.k ?? devNpk.potassium ?? 0;
                  
                  if (n > 0 || p > 0 || k > 0) {
                    totalN += n;
                    totalP += p;
                    totalK += k;
                    count++;
                  }
                }
              }
              
              if (count > 0) {
                const avgNPK = {
                  nitrogen: Math.round(totalN / count),
                  phosphorus: Math.round(totalP / count),
                  potassium: Math.round(totalK / count),
                  lastUpdated: now,
                  deviceCount: count
                };
                
                // Update field with average NPK
                await firestore.collection('fields').doc(deviceData.fieldId).update({
                  averageNPK: avgNPK
                });
                
                console.log(`[Sensor Logger] Updated field ${deviceData.fieldId} average NPK`);
              }
            }
          }
        } catch (error: any) {
          console.error(`[Sensor Logger] Error aggregating field statistics:`, error.message);
          // Don't fail the entire function if aggregation fails
        }
      }
      
      return { success: true, deviceId, nitrogen, phosphorus, potassium };
      
    } catch (error: any) {
      console.error(`[Sensor Logger] Error logging sensor data for device ${deviceId}:`, error);
      
      // Log error to system logs
      await admin.firestore().collection('systemLogs').add({
        functionName: 'logSensorData',
        deviceId,
        error: error.message,
        stack: error.stack,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
      
      return null;
    }
  });

/**
 * Scheduled Sensor Logger (Backup)
 * Trigger: Runs every 5 minutes
 * 
 * Ensures sensor data is logged even if the onWrite trigger fails
 * This is the same logic as in the original index.ts scheduledSensorLogger
 */
export const scheduledSensorLogger = functions.pubsub
  .schedule('*/5 * * * *')  // Every 5 minutes
  .timeZone('Asia/Manila')
  .onRun(async (context) => {
    console.log('[Scheduled Sensor] Starting sensor logging job...');
    
    try {
      const firestore = admin.firestore();
      const database = admin.database();
      const now = Date.now();
      
      // Get all devices
      const devicesSnapshot = await firestore.collection('devices').get();
      
      let totalLogged = 0;
      
      for (const deviceDoc of devicesSnapshot.docs) {
        const deviceData = deviceDoc.data();
        const deviceId = deviceData.deviceId;
        
        try {
          // Get NPK data from RTDB
          const npkSnap = await database.ref(`/devices/${deviceId}/npk`).once('value');
          
          if (!npkSnap.exists()) {
            continue;
          }
          
          const npkData = npkSnap.val();
          
          // Validate timestamp
          const timestamp = npkData.timestamp ?? npkData.lastUpdate ?? 0;
          
          if (!timestamp) {
            console.warn(`[Scheduled Sensor] Device ${deviceId} has no timestamp`);
            continue;
          }
          
          // Skip stale data (older than 1 hour)
          const dataAge = now - timestamp;
          if (dataAge > 60 * 60 * 1000) {
            console.warn(`[Scheduled Sensor] Device ${deviceId} data is stale (${Math.floor(dataAge / 60000)} min old)`);
            continue;
          }
          
          // Extract NPK values
          const nitrogen = npkData.n ?? npkData.nitrogen ?? null;
          const phosphorus = npkData.p ?? npkData.phosphorus ?? null;
          const potassium = npkData.k ?? npkData.potassium ?? null;
          
          if (nitrogen === null && phosphorus === null && potassium === null) {
            continue;
          }
          
          // Check for duplicates
          const recentLogsQuery = await firestore
            .collection('devices')
            .doc(deviceDoc.id)
            .collection('logs')
            .where('type', '==', 'sensor')
            .where('details.sensorTimestamp', '==', timestamp)
            .limit(1)
            .get();
          
          if (!recentLogsQuery.empty) {
            // Already logged this reading
            continue;
          }
          
          // Log the reading
          await firestore
            .collection('devices')
            .doc(deviceDoc.id)
            .collection('logs')
            .add({
              type: 'sensor',
              command: 'npk_reading',
              requestedState: 'READ',
              actualState: 'LOGGED',
              success: true,
              timestamp: now,
              commandId: `sensor_scheduled_${timestamp}`,
              functionTriggered: 'scheduledSensorLogger',
              userId: deviceData.ownerId,
              details: {
                nitrogen: nitrogen,
                phosphorus: phosphorus,
                potassium: potassium,
                sensorTimestamp: timestamp,
                source: 'scheduled_job'
              }
            });
          
          totalLogged++;
          console.log(`[Scheduled Sensor] Logged reading for device ${deviceId}`);
          
        } catch (error: any) {
          console.error(`[Scheduled Sensor] Error processing device ${deviceId}:`, error.message);
        }
      }
      
      console.log(`[Scheduled Sensor] Completed: ${totalLogged} readings logged`);
      
      return { success: true, logged: totalLogged };
      
    } catch (error: any) {
      console.error('[Scheduled Sensor] Fatal error:', error);
      return { success: false, error: error.message };
    }
  });
