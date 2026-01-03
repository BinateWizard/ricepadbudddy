/**
 * Scheduled Commands Executor
 * Executes commands scheduled by users at specified times
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

/**
 * Execute Scheduled Commands
 * Trigger: Firestore /devices/{deviceId}/schedules/{scheduleId} onCreate or onUpdate
 * 
 * When a schedule becomes due:
 * - Pushes command to RTDB
 * - Waits for device ACK
 * - Updates schedule status
 * - Logs execution result
 */
export const executeScheduledCommand = functions.firestore
  .document('devices/{deviceDocId}/schedules/{scheduleId}')
  .onWrite(async (change, context) => {
    const deviceDocId = context.params.deviceDocId;
    const scheduleId = context.params.scheduleId;
    
    // Skip if schedule was deleted
    if (!change.after.exists) {
      return null;
    }
    
    const scheduleData = change.after.data();
    const now = Date.now();
    
    // Only process if schedule is pending and time has arrived
    if (scheduleData.status !== 'pending') {
      return null;
    }
    
    if (scheduleData.scheduledTime > now) {
      // Not yet time
      return null;
    }
    
    console.log(`[Scheduled] Executing schedule ${scheduleId} for device ${deviceDocId}`);
    
    try {
      const firestore = admin.firestore();
      const database = admin.database();
      
      // Get device document
      const deviceDoc = await firestore.collection('devices').doc(deviceDocId).get();
      
      if (!deviceDoc.exists) {
        console.error(`[Scheduled] Device ${deviceDocId} not found`);
        return null;
      }
      
      const deviceData = deviceDoc.data()!;
      const deviceId = deviceData.deviceId;
      
      // Check if device is online
      const heartbeatSnap = await database.ref(`/devices/${deviceId}/heartbeat`).once('value');
      let isOnline = false;
      
      if (heartbeatSnap.exists()) {
        const heartbeat = heartbeatSnap.val();
        const lastSeen = heartbeat.lastSeen || 0;
        const minutesAgo = Math.floor((now - lastSeen) / (1000 * 60));
        isOnline = minutesAgo < 5;
      }
      
      if (!isOnline) {
        console.warn(`[Scheduled] Device ${deviceId} is offline, marking schedule as failed`);
        
        // Update schedule status
        await change.after.ref.update({
          status: 'failed',
          executedAt: now,
          failureReason: 'Device offline'
        });
        
        // Log failure
        await firestore.collection('devices').doc(deviceDocId).collection('logs').add({
          type: 'scheduled',
          command: `relay${scheduleData.relay}_${scheduleData.action}`,
          requestedState: scheduleData.action,
          actualState: 'FAILED',
          success: false,
          timestamp: now,
          commandId: `schedule_${scheduleId}`,
          functionTriggered: 'executeScheduledCommand',
          userId: scheduleData.createdBy,
          details: {
            scheduleId: scheduleId,
            relay: scheduleData.relay,
            reason: 'Device offline'
          }
        });
        
        // Notify user
        const userRef = firestore.collection('users').doc(deviceData.ownerId);
        const userDoc = await userRef.get();
        
        if (userDoc.exists) {
          const userData = userDoc.data();
          const notifications = userData?.notifications || [];
          
          notifications.unshift({
            type: 'commandFailed',
            message: `Scheduled command failed: ${deviceData.name || deviceId} is offline`,
            timestamp: now,
            read: false,
            deviceId: deviceId,
            scheduleId: scheduleId
          });
          
          if (notifications.length > 50) {
            notifications.splice(50);
          }
          
          await userRef.update({ notifications });
        }
        
        return { success: false, reason: 'Device offline' };
      }
      
      // Device is online, send command
      const commandId = `schedule_${scheduleId}_${now}`;
      
      const commandData = {
        commandId: commandId,
        relay: scheduleData.relay,
        requestedState: scheduleData.action,
        timestamp: now,
        status: 'pending',
        source: 'scheduled',
        scheduleId: scheduleId
      };
      
      await database.ref(`/devices/${deviceId}/commands/${commandId}`).set(commandData);
      
      console.log(`[Scheduled] Command ${commandId} sent to device ${deviceId}`);
      
      // Wait for ACK (max 30 seconds)
      const maxWaitTime = 30 * 1000;
      const startTime = Date.now();
      let acknowledged = false;
      let executionResult = null;
      
      while (Date.now() - startTime < maxWaitTime && !acknowledged) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // Check every 2 seconds
        
        const cmdSnap = await database.ref(`/devices/${deviceId}/commands/${commandId}`).once('value');
        if (cmdSnap.exists()) {
          const cmdData = cmdSnap.val();
          if (cmdData.status === 'executed' || cmdData.status === 'acknowledged') {
            acknowledged = true;
            executionResult = cmdData.result || 'Success';
            break;
          } else if (cmdData.status === 'failed') {
            executionResult = cmdData.result || 'Failed';
            break;
          }
        }
      }
      
      const success = acknowledged;
      
      // Update schedule status
      await change.after.ref.update({
        status: success ? 'executed' : 'failed',
        executedAt: now,
        failureReason: success ? null : (executionResult || 'Timeout')
      });
      
      // Log execution
      await firestore.collection('devices').doc(deviceDocId).collection('logs').add({
        type: 'scheduled',
        command: `relay${scheduleData.relay}_${scheduleData.action}`,
        requestedState: scheduleData.action,
        actualState: success ? scheduleData.action : 'FAILED',
        success: success,
        timestamp: now,
        commandId: commandId,
        functionTriggered: 'executeScheduledCommand',
        userId: scheduleData.createdBy,
        details: {
          scheduleId: scheduleId,
          relay: scheduleData.relay,
          result: executionResult,
          acknowledged: acknowledged
        }
      });
      
      console.log(`[Scheduled] Schedule ${scheduleId} ${success ? 'SUCCEEDED' : 'FAILED'}`);
      
      // Notify user if failed
      if (!success) {
        const userRef = firestore.collection('users').doc(deviceData.ownerId);
        const userDoc = await userRef.get();
        
        if (userDoc.exists) {
          const userData = userDoc.data();
          const notifications = userData?.notifications || [];
          
          notifications.unshift({
            type: 'commandFailed',
            message: `Scheduled command failed on ${deviceData.name || deviceId}: ${executionResult || 'Unknown error'}`,
            timestamp: now,
            read: false,
            deviceId: deviceId,
            scheduleId: scheduleId
          });
          
          if (notifications.length > 50) {
            notifications.splice(50);
          }
          
          await userRef.update({ notifications });
        }
      }
      
      return { success, scheduleId, commandId, result: executionResult };
      
    } catch (error: any) {
      console.error(`[Scheduled] Error executing schedule ${scheduleId}:`, error);
      
      // Update schedule as failed
      await change.after.ref.update({
        status: 'failed',
        executedAt: Date.now(),
        failureReason: error.message
      });
      
      // Log error
      await admin.firestore().collection('systemLogs').add({
        functionName: 'executeScheduledCommand',
        deviceDocId,
        scheduleId,
        error: error.message,
        stack: error.stack,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
      
      return null;
    }
  });

/**
 * Check Pending Schedules (Cron)
 * Trigger: Runs every minute
 * 
 * Scans all pending schedules and triggers execution if time has arrived
 * This is a backup in case the onWrite trigger doesn't fire
 */
export const checkPendingSchedules = functions.pubsub
  .schedule('*/1 * * * *')  // Every minute
  .timeZone('Asia/Manila')
  .onRun(async (context) => {
    console.log('[Schedule Check] Checking for due schedules...');
    
    try {
      const firestore = admin.firestore();
      const now = Date.now();
      
      // Get all devices
      const devicesSnapshot = await firestore.collection('devices').get();
      
      let checkedCount = 0;
      let executedCount = 0;
      
      for (const deviceDoc of devicesSnapshot.docs) {
        try {
          // Get pending schedules for this device
          const schedulesSnapshot = await firestore
            .collection('devices')
            .doc(deviceDoc.id)
            .collection('schedules')
            .where('status', '==', 'pending')
            .where('scheduledTime', '<=', now)
            .get();
          
          for (const scheduleDoc of schedulesSnapshot.docs) {
            console.log(`[Schedule Check] Found due schedule: ${scheduleDoc.id}`);
            
            // Trigger by updating the document (this will trigger executeScheduledCommand)
            await scheduleDoc.ref.update({
              _trigger: now  // Dummy field to trigger onWrite
            });
            
            executedCount++;
          }
          
          checkedCount++;
          
        } catch (error: any) {
          console.error(`[Schedule Check] Error checking device ${deviceDoc.id}:`, error.message);
        }
      }
      
      console.log(`[Schedule Check] Checked ${checkedCount} devices, triggered ${executedCount} schedules`);
      
      return { success: true, checked: checkedCount, triggered: executedCount };
      
    } catch (error: any) {
      console.error('[Schedule Check] Fatal error:', error);
      return { success: false, error: error.message };
    }
  });
