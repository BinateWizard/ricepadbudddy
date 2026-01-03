/**
 * Device Registration & Onboarding Functions
 * Handles new devices added by users
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

/**
 * Register Device
 * Trigger: Firestore /devices/{deviceDocId} onCreate
 * 
 * When a new device is created:
 * - Initializes default fields
 * - Assigns to field if fieldId provided
 * - Notifies owner
 * - Sets up RTDB structure
 */
export const registerDevice = functions.firestore
  .document('devices/{deviceDocId}')
  .onCreate(async (snapshot, context) => {
    const deviceDocId = context.params.deviceDocId;
    const deviceData = snapshot.data();
    
    console.log(`[Device Register] New device registered: ${deviceData.deviceId}`);
    
    try {
      const firestore = admin.firestore();
      const database = admin.database();
      
      // Initialize device with defaults if not set
      const updates: any = {};
      
      if (deviceData.connected === undefined) {
        updates.connected = false;
      }
      
      if (!deviceData.lastHeartbeat) {
        updates.lastHeartbeat = Date.now();
      }
      
      if (Object.keys(updates).length > 0) {
        await snapshot.ref.update(updates);
      }
      
      // Initialize RTDB structure for the device
      const rtdbDeviceRef = database.ref(`/devices/${deviceData.deviceId}`);
      
      // Check if device exists in RTDB
      const rtdbSnap = await rtdbDeviceRef.once('value');
      
      if (!rtdbSnap.exists()) {
        // Create initial RTDB structure
        await rtdbDeviceRef.set({
          ownedBy: deviceData.ownerId,
          connectedTo: deviceData.ownerId,
          fieldId: deviceData.fieldId || null,
          status: 'registered',
          connectedAt: new Date().toISOString(),
          heartbeat: {
            lastSeen: Date.now(),
            status: 'offline',
            deviceName: deviceData.name
          }
        });
        
        console.log(`[Device Register] Created RTDB structure for ${deviceData.deviceId}`);
      } else {
        // Update existing RTDB entry
        await rtdbDeviceRef.update({
          ownedBy: deviceData.ownerId,
          connectedTo: deviceData.ownerId,
          fieldId: deviceData.fieldId || null,
          status: 'connected'
        });
      }
      
      // If fieldId provided, add device to field's devices array
      if (deviceData.fieldId) {
        try {
          const fieldRef = firestore.collection('fields').doc(deviceData.fieldId);
          const fieldDoc = await fieldRef.get();
          
          if (fieldDoc.exists) {
            const fieldData = fieldDoc.data();
            const devices = fieldData?.devices || [];
            
            if (!devices.includes(deviceData.deviceId)) {
              devices.push(deviceData.deviceId);
              await fieldRef.update({ devices });
              
              console.log(`[Device Register] Added device ${deviceData.deviceId} to field ${deviceData.fieldId}`);
            }
          }
        } catch (error: any) {
          console.error(`[Device Register] Error adding device to field:`, error.message);
        }
      }
      
      // Update user's devicesOwned array
      try {
        const userRef = firestore.collection('users').doc(deviceData.ownerId);
        const userDoc = await userRef.get();
        
        if (userDoc.exists) {
          const userData = userDoc.data();
          const devicesOwned = userData?.devicesOwned || [];
          
          if (!devicesOwned.includes(deviceData.deviceId)) {
            devicesOwned.push(deviceData.deviceId);
            
            await userRef.update({
              devicesOwned: devicesOwned,
              'statistics.totalDevices': devicesOwned.length
            });
            
            console.log(`[Device Register] Updated user ${deviceData.ownerId} devicesOwned`);
          }
          
          // Add registration notification
          const notifications = userData?.notifications || [];
          
          notifications.unshift({
            type: 'system',
            message: `New device registered: ${deviceData.name || deviceData.deviceId}`,
            timestamp: Date.now(),
            read: false,
            deviceId: deviceData.deviceId
          });
          
          if (notifications.length > 50) {
            notifications.splice(50);
          }
          
          await userRef.update({ notifications });
        }
      } catch (error: any) {
        console.error(`[Device Register] Error updating user:`, error.message);
      }
      
      // Log registration event
      await snapshot.ref.collection('logs').add({
        type: 'system',
        command: 'device_registered',
        requestedState: 'REGISTERED',
        actualState: 'REGISTERED',
        success: true,
        timestamp: Date.now(),
        commandId: `register_${Date.now()}`,
        functionTriggered: 'registerDevice',
        userId: deviceData.ownerId,
        details: {
          deviceId: deviceData.deviceId,
          deviceType: deviceData.deviceType,
          fieldId: deviceData.fieldId || null
        }
      });
      
      console.log(`[Device Register] Device ${deviceData.deviceId} registration complete`);
      
      return { success: true, deviceId: deviceData.deviceId };
      
    } catch (error: any) {
      console.error(`[Device Register] Error registering device ${deviceData.deviceId}:`, error);
      
      // Log error to system logs
      await admin.firestore().collection('systemLogs').add({
        functionName: 'registerDevice',
        deviceDocId,
        deviceId: deviceData.deviceId,
        error: error.message,
        stack: error.stack,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
      
      return null;
    }
  });

/**
 * Update Device Assignment
 * Trigger: Firestore /devices/{deviceDocId} onUpdate
 * 
 * When device is reassigned to a different field:
 * - Updates field's devices arrays (remove from old, add to new)
 * - Updates RTDB fieldId
 * - Logs the change
 */
export const updateDeviceAssignment = functions.firestore
  .document('devices/{deviceDocId}')
  .onUpdate(async (change, context) => {
    const deviceDocId = context.params.deviceDocId;
    const before = change.before.data();
    const after = change.after.data();
    
    // Check if fieldId changed
    if (before.fieldId === after.fieldId) {
      return null;
    }
    
    console.log(`[Device Assignment] Device ${after.deviceId} reassigned from ${before.fieldId || 'none'} to ${after.fieldId || 'none'}`);
    
    try {
      const firestore = admin.firestore();
      const database = admin.database();
      
      // Remove from old field
      if (before.fieldId) {
        try {
          const oldFieldRef = firestore.collection('fields').doc(before.fieldId);
          const oldFieldDoc = await oldFieldRef.get();
          
          if (oldFieldDoc.exists) {
            const oldFieldData = oldFieldDoc.data();
            const devices = oldFieldData?.devices || [];
            const index = devices.indexOf(after.deviceId);
            
            if (index > -1) {
              devices.splice(index, 1);
              await oldFieldRef.update({ devices });
              
              console.log(`[Device Assignment] Removed device ${after.deviceId} from field ${before.fieldId}`);
            }
          }
        } catch (error: any) {
          console.error(`[Device Assignment] Error removing from old field:`, error.message);
        }
      }
      
      // Add to new field
      if (after.fieldId) {
        try {
          const newFieldRef = firestore.collection('fields').doc(after.fieldId);
          const newFieldDoc = await newFieldRef.get();
          
          if (newFieldDoc.exists) {
            const newFieldData = newFieldDoc.data();
            const devices = newFieldData?.devices || [];
            
            if (!devices.includes(after.deviceId)) {
              devices.push(after.deviceId);
              await newFieldRef.update({ devices });
              
              console.log(`[Device Assignment] Added device ${after.deviceId} to field ${after.fieldId}`);
            }
          }
        } catch (error: any) {
          console.error(`[Device Assignment] Error adding to new field:`, error.message);
        }
      }
      
      // Update RTDB
      await database.ref(`/devices/${after.deviceId}`).update({
        fieldId: after.fieldId || null
      });
      
      // Log the change
      await change.after.ref.collection('logs').add({
        type: 'system',
        command: 'device_reassigned',
        requestedState: after.fieldId || 'UNASSIGNED',
        actualState: after.fieldId || 'UNASSIGNED',
        success: true,
        timestamp: Date.now(),
        commandId: `reassign_${Date.now()}`,
        functionTriggered: 'updateDeviceAssignment',
        userId: after.ownerId,
        details: {
          deviceId: after.deviceId,
          oldFieldId: before.fieldId || null,
          newFieldId: after.fieldId || null
        }
      });
      
      return { success: true, deviceId: after.deviceId, newFieldId: after.fieldId };
      
    } catch (error: any) {
      console.error(`[Device Assignment] Error updating assignment:`, error);
      
      await admin.firestore().collection('systemLogs').add({
        functionName: 'updateDeviceAssignment',
        deviceDocId,
        error: error.message,
        stack: error.stack,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
      
      return null;
    }
  });
