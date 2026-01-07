/**
 * Heartbeat Monitoring System
 * 
 * Layer 2: Background monitoring (Always-On)
 * - ESP32 sends periodic heartbeat to RTDB
 * - Function monitors heartbeat and detects offline devices
 * - Sends push/email notifications when device goes offline
 * - Updates Firestore logs
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const HEARTBEAT_TIMEOUT = 10 * 60 * 1000; // 10 minutes

/**
 * Monitor Heartbeat (Real-time RTDB Trigger)
 * Trigger: RTDB /devices/{deviceId}/heartbeat onUpdate
 * 
 * Detects when devices go offline/online in real-time
 */
export const monitorHeartbeat = functions.database
  .ref('/devices/{deviceId}/heartbeat')
  .onUpdate(async (change, context) => {
    const deviceId = context.params.deviceId;
    const after = change.after.val();
    
    console.log(`[Heartbeat] Device ${deviceId} heartbeat updated`);
    
    try {
      const firestore = admin.firestore();
      const now = Date.now();
      
      // Get device document from Firestore
      const devicesQuery = await firestore
        .collection('devices')
        .where('deviceId', '==', deviceId)
        .limit(1)
        .get();
      
      if (devicesQuery.empty) {
        console.warn(`[Heartbeat] Device ${deviceId} not found in Firestore`);
        return null;
      }
      
      const deviceDoc = devicesQuery.docs[0];
      const deviceData = deviceDoc.data();
      const deviceDocId = deviceDoc.id;
      
      // Check heartbeat value (ESP32 may send millis() or Unix timestamp)
      const heartbeatValue = typeof after === 'number' ? after : (after?.heartbeat || after?.lastSeen || 0);
      const previousHeartbeat = deviceData.lastHeartbeat || 0;
      
      // Detect if heartbeat is changing (device is alive)
      // If heartbeat value increased, device is online (works for both millis() and Unix timestamp)
      const heartbeatChanged = heartbeatValue > previousHeartbeat;
      const isOnline = heartbeatChanged;
      const wasOnline = deviceData.connected === true;
      
      console.log(`[Heartbeat] Device ${deviceId} - Previous: ${previousHeartbeat}, Current: ${heartbeatValue}, Changed: ${heartbeatChanged}`);
      
      // Update RTDB status for frontend
      await admin.database().ref(`devices/${deviceId}/status`).update({
        online: isOnline,
        lastChecked: now
      });
      
      // Status changed detection
      if (isOnline !== wasOnline) {
        console.log(`[Heartbeat] Device ${deviceId} status changed: ${isOnline ? 'ONLINE' : 'OFFLINE'}`);
        
        // Update Firestore device connected status
        await firestore.collection('devices').doc(deviceDocId).update({
          connected: isOnline,
          lastHeartbeat: heartbeatValue
        });
        
        // Log the event in device logs
        await firestore
          .collection('devices')
          .doc(deviceDocId)
          .collection('logs')
          .add({
            type: 'system',
            command: isOnline ? 'heartbeat_online' : 'heartbeat_offline',
            requestedState: null,
            actualState: isOnline ? 'online' : 'offline',
            success: isOnline,
            timestamp: now,
            commandId: `heartbeat_${now}`,
            functionTriggered: 'monitorHeartbeat',
            userId: deviceData.ownerId,
            details: {
              lastSeen: heartbeatValue,
              previousHeartbeat: previousHeartbeat,
              heartbeatChanged: heartbeatChanged,
              deviceName: deviceData.name || deviceId
            }
          });
        
        // Add notification to user (especially for offline events)
        if (!isOnline) {
          const userRef = firestore.collection('users').doc(deviceData.ownerId);
          const userDoc = await userRef.get();
          
          if (userDoc.exists) {
            const userData = userDoc.data();
            const notifications = userData?.notifications || [];
            
            notifications.unshift({
              type: 'offline',
              message: `Device ${deviceData.name || deviceId} went offline`,
              timestamp: now,
              read: false,
              deviceId: deviceId,
              fieldId: deviceData.fieldId || null
            });
            
            // Keep only last 50 notifications
            if (notifications.length > 50) {
              notifications.splice(50);
            }
            
            await userRef.update({ notifications });
            
            console.log(`[Heartbeat] Notification added for user ${deviceData.ownerId}`);
          }
        } else {
          // Device came back online - optionally notify
          console.log(`[Heartbeat] Device ${deviceId} is back online`);
        }
      }
      
      return { success: true, deviceId, status: isOnline ? 'online' : 'offline' };
      
    } catch (error: any) {
      console.error(`[Heartbeat] Error monitoring device ${deviceId}:`, error);
      
      // Log error to system logs
      await admin.firestore().collection('systemLogs').add({
        functionName: 'monitorHeartbeat',
        deviceId,
        error: error.message,
        stack: error.stack,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
      
      return null;
    }
  });

/**
 * Scheduled function: Monitor device heartbeats
 * Runs every 2 minutes to check all devices
 */
export const monitorDeviceHeartbeats = functions.pubsub
  .schedule('*/2 * * * *') // Every 2 minutes
  .timeZone('Asia/Manila')
  .onRun(async (context) => {
    console.log('[Heartbeat Monitor] Starting heartbeat check...');
    
    const database = admin.database();
    const firestore = admin.firestore();
    const now = Date.now();
    
    try {
      // Check all devices in the new hierarchy
      const devices: Record<string, any> = {};
      
      // Load from owners/fields/devices structure
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
                __meta: { ownerId, fieldId }
              };
            }
          }
        }
      }
      
      // Fallback: Check legacy devices structure
      const legacySnap = await database.ref('devices').once('value');
      if (legacySnap.exists()) {
        const legacyDevices = legacySnap.val();
        for (const [deviceId, deviceData] of Object.entries(legacyDevices) as [string, any][]) {
          if (!devices[deviceId]) {
            devices[deviceId] = { ...deviceData, __meta: { legacy: true } };
          }
        }
      }
      
      if (Object.keys(devices).length === 0) {
        console.log('[Heartbeat Monitor] No devices found');
        return null;
      }
      
      let offlineCount = 0;
      let onlineCount = 0;
      
      // Process each device
      for (const [deviceId, deviceData] of Object.entries(devices) as [string, any][]) {
        try {
          // Get heartbeat timestamp
          const heartbeat = deviceData.status?.heartbeat || 
                          deviceData.heartbeat || 
                          deviceData.status?.lastSeen ||
                          deviceData.lastSeen;
          
          if (!heartbeat) {
            console.warn(`[Heartbeat Monitor] Device ${deviceId} has no heartbeat data`);
            continue;
          }
          
          const timeSinceHeartbeat = now - (typeof heartbeat === 'number' ? heartbeat : 0);
          const wasOnline = deviceData.status?.online ?? true;
          const isNowOffline = timeSinceHeartbeat > HEARTBEAT_TIMEOUT;
          
          if (isNowOffline) {
            offlineCount++;
            
            // Device is offline - only notify if status changed from online to offline
            if (wasOnline) {
              console.log(`[Heartbeat Monitor] Device ${deviceId} went OFFLINE (last seen ${Math.round(timeSinceHeartbeat / 60000)} min ago)`);
              
              // Update device status in RTDB
              const devicePath = deviceData.__meta?.legacy 
                ? `devices/${deviceId}`
                : `owners/${deviceData.__meta.ownerId}/fields/${deviceData.__meta.fieldId}/devices/${deviceId}`;
              
              await database.ref(`${devicePath}/status`).update({
                online: false,
                lastOfflineAt: now,
                offlineReason: 'heartbeat_timeout'
              });
              
              // Log to Firestore errors collection
              await firestore.collection('errors').add({
                deviceId,
                type: 'device_offline',
                severity: 'critical',
                message: `Device ${deviceId} is offline (no heartbeat for ${Math.round(timeSinceHeartbeat / 60000)} minutes)`,
                details: {
                  lastHeartbeat: heartbeat,
                  timeSinceHeartbeat,
                  ownerId: deviceData.__meta?.ownerId,
                  fieldId: deviceData.__meta?.fieldId
                },
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                resolved: false,
                notified: false
              });
              
              // Send notifications
              await sendOfflineNotification(deviceId, deviceData.__meta?.ownerId, timeSinceHeartbeat);
            }
          } else {
            onlineCount++;
            
            // Device is online - update status if it was previously offline
            if (!wasOnline) {
              console.log(`[Heartbeat Monitor] Device ${deviceId} came back ONLINE`);
              
              const devicePath = deviceData.__meta?.legacy 
                ? `devices/${deviceId}`
                : `owners/${deviceData.__meta.ownerId}/fields/${deviceData.__meta.fieldId}/devices/${deviceId}`;
              
              await database.ref(`${devicePath}/status`).update({
                online: true,
                lastOnlineAt: now
              });
              
              // Log recovery to Firestore
              await firestore.collection('system_logs').add({
                deviceId,
                type: 'device_online',
                message: `Device ${deviceId} came back online`,
                timestamp: admin.firestore.FieldValue.serverTimestamp()
              });
              
              // Resolve error if exists
              const errorsQuery = await firestore.collection('errors')
                .where('deviceId', '==', deviceId)
                .where('type', '==', 'device_offline')
                .where('resolved', '==', false)
                .get();
              
              const batch = firestore.batch();
              errorsQuery.docs.forEach(doc => {
                batch.update(doc.ref, { 
                  resolved: true, 
                  resolvedAt: admin.firestore.FieldValue.serverTimestamp() 
                });
              });
              await batch.commit();
            }
          }
        } catch (error: any) {
          console.error(`[Heartbeat Monitor] Error processing device ${deviceId}:`, error);
        }
      }
      
      console.log(`[Heartbeat Monitor] Check complete. Online: ${onlineCount}, Offline: ${offlineCount}`);
      return { success: true, online: onlineCount, offline: offlineCount };
      
    } catch (error: any) {
      console.error('[Heartbeat Monitor] Fatal error:', error);
      throw error;
    }
  });

/**
 * Send offline notification via FCM and/or email
 */
async function sendOfflineNotification(
  deviceId: string, 
  ownerId: string | undefined,
  timeSinceHeartbeat: number
): Promise<void> {
  try {
    const firestore = admin.firestore();
    const messaging = admin.messaging();
    
    if (!ownerId) {
      console.warn(`[Heartbeat Monitor] No owner ID for device ${deviceId}, skipping notification`);
      return;
    }
    
    // Get user's FCM tokens
    const userDoc = await firestore.collection('users').doc(ownerId).get();
    if (!userDoc.exists) {
      console.warn(`[Heartbeat Monitor] User ${ownerId} not found`);
      return;
    }
    
    const userData = userDoc.data();
    const fcmTokens = userData?.fcmTokens || [];
    
    if (fcmTokens.length === 0) {
      console.log(`[Heartbeat Monitor] No FCM tokens for user ${ownerId}`);
      return;
    }
    
    // Send FCM notification
    const minutesOffline = Math.round(timeSinceHeartbeat / 60000);
    const message = {
      notification: {
        title: '⚠️ Device Offline',
        body: `Device ${deviceId} has been offline for ${minutesOffline} minutes`
      },
      data: {
        type: 'device_offline',
        deviceId,
        timestamp: Date.now().toString()
      },
      tokens: fcmTokens
    };
    
    const response = await messaging.sendEachForMulticast(message);
    console.log(`[Heartbeat Monitor] Sent ${response.successCount} notifications for device ${deviceId}`);
    
    // Update notified flag in error log
    const errorQuery = await firestore.collection('errors')
      .where('deviceId', '==', deviceId)
      .where('type', '==', 'device_offline')
      .where('notified', '==', false)
      .limit(1)
      .get();
    
    if (!errorQuery.empty) {
      await errorQuery.docs[0].ref.update({ notified: true });
    }
    
  } catch (error) {
    console.error(`[Heartbeat Monitor] Error sending notification for device ${deviceId}:`, error);
  }
}

/**
 * RTDB trigger: Update device online status immediately when heartbeat changes
 * This provides instant feedback without waiting for scheduled check
 */
export const onDeviceHeartbeat = functions.database
  .ref('/owners/{ownerId}/fields/{fieldId}/devices/{deviceId}/status/heartbeat')
  .onUpdate(async (change, context) => {
    const { ownerId, fieldId, deviceId } = context.params;
    const newHeartbeat = change.after.val();
    const database = admin.database();
    
    if (!newHeartbeat) return null;
    
    const now = Date.now();
    const timeSinceHeartbeat = now - (typeof newHeartbeat === 'number' ? newHeartbeat : 0);
    const isOnline = timeSinceHeartbeat < HEARTBEAT_TIMEOUT;
    
    console.log(`[Heartbeat Trigger] Device ${deviceId} heartbeat updated: ${isOnline ? 'ONLINE' : 'OFFLINE'}`);
    
    // Update online status
    await database.ref(`/owners/${ownerId}/fields/${fieldId}/devices/${deviceId}/status`).update({
      online: isOnline,
      lastChecked: now
    });
    
    return null;
  });

/**
 * Legacy heartbeat trigger for devices/ path
 */
export const onLegacyDeviceHeartbeat = functions.database
  .ref('/devices/{deviceId}/heartbeat')
  .onUpdate(async (change, context) => {
    const { deviceId } = context.params;
    const newHeartbeat = change.after.val();
    const database = admin.database();
    
    if (!newHeartbeat) return null;
    
    const now = Date.now();
    const timeSinceHeartbeat = now - (typeof newHeartbeat === 'number' ? newHeartbeat : 0);
    const isOnline = timeSinceHeartbeat < HEARTBEAT_TIMEOUT;
    
    console.log(`[Heartbeat Trigger] Legacy device ${deviceId} heartbeat updated: ${isOnline ? 'ONLINE' : 'OFFLINE'}`);
    
    // Update online status
    await database.ref(`/devices/${deviceId}/status`).update({
      online: isOnline,
      lastChecked: now
    });
    
    return null;
  });
