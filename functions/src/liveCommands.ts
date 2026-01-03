/**
 * Live Command Verification Functions
 * Ensures live commands from client were successfully executed by the device
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const COMMAND_TIMEOUT = 30 * 1000; // 30 seconds

/**
 * Verify Live Command Execution
 * Trigger: RTDB /devices/{deviceId}/commands/{commandId} onWrite
 * 
 * Monitors command execution and:
 * - Logs success/failure to Firestore
 * - Notifies user on failure
 * - Handles timeouts
 */
export const verifyLiveCommand = functions.database
  .ref('/devices/{deviceId}/commands/{commandId}')
  .onWrite(async (change, context) => {
    const deviceId = context.params.deviceId;
    const commandId = context.params.commandId;
    
    // Skip if command was deleted
    if (!change.after.exists()) {
      return null;
    }
    
    const commandData = change.after.val();
    const previousData = change.before.exists() ? change.before.val() : null;
    
    console.log(`[Command Verify] Command ${commandId} for device ${deviceId}`);
    
    try {
      const firestore = admin.firestore();
      
      // Get device document
      const devicesQuery = await firestore
        .collection('devices')
        .where('deviceId', '==', deviceId)
        .limit(1)
        .get();
      
      if (devicesQuery.empty) {
        console.warn(`[Command Verify] Device ${deviceId} not found in Firestore`);
        return null;
      }
      
      const deviceDoc = devicesQuery.docs[0];
      const deviceData = deviceDoc.data();
      const deviceDocId = deviceDoc.id;
      
      // Check if status changed to executed or failed
      const statusChanged = previousData?.status !== commandData.status;
      
      if (!statusChanged) {
        // New command created, schedule timeout check
        if (!previousData) {
          console.log(`[Command Verify] New command ${commandId}, scheduling timeout check`);
          
          // Schedule a timeout check (using a different approach since we can't delay in this function)
          // The scheduled function checkCommandTimeouts will handle this
        }
        return null;
      }
      
      // Status changed - log the result
      // Check if status changed to completed, executed, or failed
      const success = commandData.status === 'completed' || commandData.status === 'executed' || commandData.status === 'acknowledged';
      const failed = commandData.status === 'failed';
      
      if (success || failed) {
        // Determine the actual state from ESP32 response
        const relayState = commandData.actualState || (commandData.action === 'on' || commandData.action === 'ON' ? 'ON' : 'OFF');
        
        // Log to Firestore
        const logData = {
          type: 'live',
          command: commandData.action || `relay${commandData.relay}_${relayState}`,
          requestedState: commandData.action?.toUpperCase() || 'UNKNOWN',
          actualState: success ? relayState : 'FAILED',
          success: success,
          timestamp: Date.now(),
          commandId: commandId,
          functionTriggered: 'verifyLiveCommand',
          userId: deviceData.ownerId,
          details: {
            relay: commandData.relay,
            result: commandData.result || null,
            executedAt: commandData.timestamp
          }
        };
        
        await firestore
          .collection('devices')
          .doc(deviceDocId)
          .collection('logs')
          .add(logData);
        
        console.log(`[Command Verify] Logged ${success ? 'SUCCESS' : 'FAILURE'} for command ${commandId}`);
        
        // Store relay state in RTDB for device recovery on boot
        console.log(`[Command Verify] Checking relay state storage - success: ${success}, relay: ${commandData.relay}, actualState: ${commandData.actualState}`);
        
        if (success && commandData.relay) {
          const database = admin.database();
          // Use actualState from ESP32 response, or derive from action field
          const relayState = commandData.actualState || (commandData.action === 'on' || commandData.action === 'ON' ? 'ON' : 'OFF');
          
          console.log(`[Command Verify] Writing to RTDB: devices/${deviceId}/relays/${commandData.relay} with state: ${relayState}`);
          
          await database
            .ref(`devices/${deviceId}/relays/${commandData.relay}`)
            .update({
              state: relayState,
              lastUpdated: Date.now(),
              updatedBy: 'Cloud Function - verifyLiveCommand'
            });
          
          console.log(`[Command Verify] ✓ Successfully stored relay ${commandData.relay} state: ${relayState} to RTDB`);
        } else {
          console.log(`[Command Verify] Skipping relay state storage - success: ${success}, relay: ${commandData.relay}`);
        }
        
        // If failed, notify user
        if (failed) {
          const userRef = firestore.collection('users').doc(deviceData.ownerId);
          const userDoc = await userRef.get();
          
          if (userDoc.exists) {
            const userData = userDoc.data();
            const notifications = userData?.notifications || [];
            
            notifications.unshift({
              type: 'commandFailed',
              message: `Command failed on ${deviceData.name || deviceId}: ${commandData.result || 'Unknown error'}`,
              timestamp: Date.now(),
              read: false,
              deviceId: deviceId,
              commandId: commandId
            });
            
            if (notifications.length > 50) {
              notifications.splice(50);
            }
            
            await userRef.update({ notifications });
            
            console.log(`[Command Verify] Failure notification sent to user ${deviceData.ownerId}`);
          }
        }
      }
      
      return { success: true, commandId, status: commandData.status };
      
    } catch (error: any) {
      console.error(`[Command Verify] Error verifying command ${commandId}:`, error);
      
      // Log error to system logs
      await admin.firestore().collection('systemLogs').add({
        functionName: 'verifyLiveCommand',
        deviceId,
        commandId,
        error: error.message,
        stack: error.stack,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
      
      return null;
    }
  });

/**
 * Check Command Timeouts (Scheduled)
 * Trigger: Runs every 1 minute
 * 
 * Checks for commands that haven't been acknowledged within timeout period
 */
export const checkCommandTimeouts = functions.pubsub
  .schedule('*/1 * * * *')  // Every 1 minute
  .timeZone('Asia/Manila')
  .onRun(async (context) => {
    console.log('[Command Timeout] Checking for timed-out commands...');
    
    try {
      const database = admin.database();
      const firestore = admin.firestore();
      const now = Date.now();
      
      // Get all devices
      const devicesSnapshot = await firestore.collection('devices').get();
      
      let checkedCount = 0;
      let timedOutCount = 0;
      
      for (const deviceDoc of devicesSnapshot.docs) {
        const deviceData = deviceDoc.data();
        const deviceId = deviceData.deviceId;
        
        try {
          // Get all commands for this device
          const commandsSnap = await database.ref(`/devices/${deviceId}/commands`).once('value');
          
          if (!commandsSnap.exists()) continue;
          
          const commands = commandsSnap.val();
          
          for (const [commandId, commandData] of Object.entries(commands) as [string, any][]) {
            const commandAge = now - (commandData.timestamp || 0);
            
            // Check if command is still pending and has exceeded timeout
            if (
              commandData.status === 'pending' &&
              commandAge > COMMAND_TIMEOUT
            ) {
              console.log(`[Command Timeout] Command ${commandId} timed out (${Math.floor(commandAge / 1000)}s)`);
              
              // Update command status to failed
              await database.ref(`/devices/${deviceId}/commands/${commandId}`).update({
                status: 'failed',
                result: 'Timeout - no response from device'
              });
              
              // Log timeout
              await firestore
                .collection('devices')
                .doc(deviceDoc.id)
                .collection('logs')
                .add({
                  type: 'live',
                  command: `relay${commandData.relay}_${commandData.requestedState}`,
                  requestedState: commandData.requestedState,
                  actualState: 'TIMEOUT',
                  success: false,
                  timestamp: Date.now(),
                  commandId: commandId,
                  functionTriggered: 'checkCommandTimeouts',
                  userId: deviceData.ownerId,
                  details: {
                    relay: commandData.relay,
                    reason: 'Command timeout - no device response',
                    timeoutSeconds: Math.floor(commandAge / 1000)
                  }
                });
              
              timedOutCount++;
            }
          }
          
          checkedCount++;
          
        } catch (error: any) {
          console.error(`[Command Timeout] Error checking device ${deviceId}:`, error.message);
        }
      }
      
      console.log(`[Command Timeout] Checked ${checkedCount} devices, ${timedOutCount} commands timed out`);
      
      return { success: true, checked: checkedCount, timedOut: timedOutCount };
      
    } catch (error: any) {
      console.error('[Command Timeout] Fatal error:', error);
      return { success: false, error: error.message };
    }
  });
