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
 * 
 * Handles both relay commands (relay1-4) and motor/GPS commands
 */
export const verifyLiveCommand = functions.database
  .ref('/devices/{deviceId}/commands/{nodeId}/{commandType}')
  .onWrite(async (change, context) => {
    const deviceId = context.params.deviceId;
    const nodeId = context.params.nodeId;
    const commandType = context.params.commandType; // relay1-4, motor, gps, or npk
    
    console.log(`[Command Verify] Triggered for ${deviceId}/${nodeId}/${commandType}`);
    
    // Skip if command was deleted
    if (!change.after.exists()) {
      return null;
    }
    
    const commandData = change.after.val();
    const previousData = change.before.exists() ? change.before.val() : null;
    
    console.log(`[Command Verify] Command ${commandType} for device ${deviceId}`);
    
    try {
      const firestore = admin.firestore();
      
      // Get device document (optional)
      const devicesQuery = await firestore
        .collection('devices')
        .where('deviceId', '==', deviceId)
        .limit(1)
        .get();

      // Device document may not exist yet (e.g. during initial bring-up).
      // In that case we still want to update RTDB relay state so the
      // frontend and ESP32 can recover state on boot, but we skip
      // Firestore logging/notifications.
      const deviceDoc = devicesQuery.empty ? null : devicesQuery.docs[0];
      const deviceData = deviceDoc ? deviceDoc.data() : null;
      const deviceDocId = deviceDoc ? deviceDoc.id : null;
      
      // Check if status changed to executed or failed
      const statusChanged = previousData?.status !== commandData.status;
      
      if (!statusChanged) {
        // New command created, schedule timeout check
        if (!previousData) {
          console.log(`[Command Verify] New command ${commandType}, scheduling timeout check`);
          
          // Schedule a timeout check (using a different approach since we can't delay in this function)
          // The scheduled function checkCommandTimeouts will handle this
        }
        return null;
      }
      
      // Status changed - log the result
      // Check if status changed to completed, executed, or failed
      const success = commandData.status === 'completed' || commandData.status === 'executed' || commandData.status === 'acknowledged';
      const failed = commandData.status === 'failed' || commandData.status === 'error';
      
      if (success || failed) {
        // Determine the command type (relay, motor, gps, npk)
        const isRelay = commandType.startsWith('relay');
        const isMotor = commandType === 'motor';
        const isGPS = commandType === 'gps';
        const isNPK = commandType === 'npk' || nodeId === 'ESP32C';
        
        // Determine the actual state from ESP32 response
        let actualState = commandData.actualState;
        if (!actualState && isRelay) {
          actualState = (commandData.action === 'on' || commandData.action === 'ON' ? 'ON' : 'OFF');
        }
        
        // Build command description
        let commandDescription = commandData.action || 'unknown';
        if (isRelay && commandData.relay) {
          commandDescription = `relay${commandData.relay}_${actualState}`;
        } else if (isMotor) {
          commandDescription = `motor_${commandData.action}`;
        } else if (isGPS) {
          commandDescription = 'gps_read';
        } else if (isNPK) {
          commandDescription = 'npk_scan';
        }
        
        // Log to Firestore (only if device document exists)
        if (deviceDocId) {
          const logData = {
            type: 'live',
            command: commandDescription,
            requestedState: commandData.action?.toUpperCase() || 'UNKNOWN',
            actualState: success ? (actualState || 'COMPLETED') : 'FAILED',
            success: success,
            timestamp: Date.now(),
            commandId: commandType,
            functionTriggered: 'verifyLiveCommand',
            userId: deviceData?.ownerId,
            details: {
              nodeId: nodeId,
              commandType: commandType,
              relay: commandData.relay || null,
              result: commandData.result || null,
              error: commandData.error || null,
              executedAt: commandData.executedAt || commandData.timestamp
            }
          };

          await firestore
            .collection('devices')
            .doc(deviceDocId)
            .collection('logs')
            .add(logData);
          
          console.log(`[Command Verify] Logged ${success ? 'SUCCESS' : 'FAILURE'} for ${nodeId}/${commandType}`);
        } else {
          console.log(`[Command Verify] Skipping Firestore log for ${deviceId} (device document not found)`);
        }
        
        // Store relay state in RTDB for device recovery on boot (relay commands only)
        if (isRelay && success && commandData.relay) {
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
        }
        
        // If failed, notify user
        if (failed && deviceData?.ownerId) {
          const userRef = firestore.collection('users').doc(deviceData.ownerId);
          const userDoc = await userRef.get();
          
          if (userDoc.exists) {
            const userData = userDoc.data();
            const notifications = userData?.notifications || [];
            
            const errorMessage = commandData.error || commandData.result || 'Unknown error';
            notifications.unshift({
              type: 'commandFailed',
              message: `Command failed on ${deviceData.name || deviceId}: ${errorMessage}`,
              timestamp: Date.now(),
              read: false,
              deviceId: deviceId,
              commandId: commandType
            });
            
            if (notifications.length > 50) {
              notifications.splice(50);
            }
            
            await userRef.update({ notifications });
            
            console.log(`[Command Verify] Failure notification sent to user ${deviceData.ownerId}`);
          }
        }
      }
      
      return { success: true, commandId: commandType, status: commandData.status };
      
    } catch (error: any) {
      console.error(`[Command Verify] Error verifying command ${commandType}:`, error);
      
      // Log error to system logs
      await admin.firestore().collection('systemLogs').add({
        functionName: 'verifyLiveCommand',
        deviceId,
        commandId: commandType,
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
          
          // Iterate through all nodes (ESP32A, ESP32B, ESP32C)
          for (const [nodeId, nodeCommands] of Object.entries(commands) as [string, any][]) {
            if (typeof nodeCommands !== 'object') continue;
            
            // Iterate through all command types (relay1-4, motor, gps, npk)
            for (const [commandType, commandData] of Object.entries(nodeCommands) as [string, any][]) {
              if (typeof commandData !== 'object') continue;
              
              const commandAge = now - (commandData.requestedAt || commandData.timestamp || 0);
              
              // Check if command is still pending and has exceeded timeout
              if (
                commandData.status === 'pending' &&
                commandAge > COMMAND_TIMEOUT
              ) {
                console.log(`[Command Timeout] Command ${nodeId}/${commandType} timed out (${Math.floor(commandAge / 1000)}s)`);
                
                // Update command status to failed
                await database.ref(`/devices/${deviceId}/commands/${nodeId}/${commandType}`).update({
                  status: 'error',
                  error: 'Timeout - no response from device',
                  executedAt: now
                });
                
                // Determine command description
                const isRelay = commandType.startsWith('relay');
                const commandDescription = isRelay 
                  ? `relay${commandData.relay}_${commandData.action?.toUpperCase() || 'UNKNOWN'}`
                  : `${commandType}_${commandData.action || 'unknown'}`;
                
                // Log timeout
                await firestore
                  .collection('devices')
                  .doc(deviceDoc.id)
                  .collection('logs')
                  .add({
                    type: 'live',
                    command: commandDescription,
                    requestedState: commandData.action?.toUpperCase() || 'UNKNOWN',
                    actualState: 'TIMEOUT',
                    success: false,
                    timestamp: Date.now(),
                    commandId: `${nodeId}/${commandType}`,
                    functionTriggered: 'checkCommandTimeouts',
                    userId: deviceData.ownerId,
                    details: {
                      nodeId: nodeId,
                      commandType: commandType,
                      relay: commandData.relay || null,
                      reason: 'Command timeout - no device response',
                      timeoutSeconds: Math.floor(commandAge / 1000)
                    }
                  });
                
                timedOutCount++;
              }
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
