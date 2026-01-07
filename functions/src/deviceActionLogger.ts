/**
 * Device Action Logger
 * 
 * Logs all device actions (relay control, motor control, NPK scans, etc.)
 * Stores in Firestore: devices/{deviceId}/logs and users/{userId}/deviceActions
 * Provides high-level logging for audit and monitoring
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

export interface DeviceAction {
  deviceId: string;
  userId: string;
  fieldId?: string;
  nodeId: 'ESP32A' | 'ESP32B' | 'ESP32C';
  action: string;
  actionType: 'relay' | 'motor' | 'npk' | 'gps' | 'system';
  params?: Record<string, any>;
  result?: 'success' | 'failed' | 'timeout' | 'pending';
  details?: any;
  error?: string;
}

/**
 * HTTPS Callable Function: Log Device Action
 * 
 * Client calls this to log device control actions
 * Stores in both device logs and user action logs
 * 
 * Note: onCall functions handle CORS automatically
 */
export const logDeviceAction = functions.https.onCall(async (data: DeviceAction, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'User must be authenticated to log device actions'
    );
  }

  const userId = context.auth.uid;
  const { deviceId, fieldId, nodeId, action, actionType, params, result, details, error } = data;

  // Validate required fields
  if (!deviceId || !action || !actionType) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'deviceId, action, and actionType are required'
    );
  }

  try {
    const firestore = admin.firestore();
    const timestamp = Date.now();
    
    const logEntry = {
      deviceId,
      userId,
      fieldId: fieldId || null,
      nodeId: nodeId || null,
      action,
      actionType,
      params: params || {},
      result: result || 'pending',
      details: details || {},
      error: error || null,
      timestamp,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };

    // Store in device logs
    const deviceLogRef = await firestore
      .collection('devices')
      .doc(deviceId)
      .collection('logs')
      .add(logEntry);

    // Also store in user's device actions for easy querying
    await firestore
      .collection('users')
      .doc(userId)
      .collection('deviceActions')
      .add(logEntry);

    console.log(`[Device Action Logger] Logged action ${deviceLogRef.id} for device ${deviceId} by user ${userId}`);

    return {
      success: true,
      logId: deviceLogRef.id,
      timestamp
    };
  } catch (error) {
    console.error(`[Device Action Logger] Error logging action for device ${deviceId}:`, error);
    throw new functions.https.HttpsError(
      'internal',
      'Failed to log device action',
      error
    );
  }
});

/**
 * HTTPS Callable Function: Get Device Logs
 * 
 * Fetch logs for a specific device with pagination
 */
export const getDeviceLogs = functions.https.onCall(async (data: { deviceId: string; limit?: number; startAfter?: number }, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'User must be authenticated to view logs'
    );
  }

  const { deviceId, limit = 50, startAfter } = data;

  if (!deviceId) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'deviceId is required'
    );
  }

  try {
    const firestore = admin.firestore();
    
    let query = firestore
      .collection('devices')
      .doc(deviceId)
      .collection('logs')
      .orderBy('timestamp', 'desc')
      .limit(limit);

    if (startAfter) {
      query = query.where('timestamp', '<', startAfter);
    }

    const snapshot = await query.get();
    
    const logs = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return {
      success: true,
      logs,
      hasMore: snapshot.docs.length === limit
    };
  } catch (error) {
    console.error(`[Device Action Logger] Error fetching logs for device ${deviceId}:`, error);
    throw new functions.https.HttpsError(
      'internal',
      'Failed to fetch device logs',
      error
    );
  }
});

/**
 * HTTPS Callable Function: Get Field Logs
 * 
 * Fetch all logs for devices in a field
 */
export const getFieldLogs = functions.https.onCall(async (data: { fieldId: string; limit?: number }, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'User must be authenticated to view logs'
    );
  }

  const userId = context.auth.uid;
  const { fieldId, limit = 100 } = data;

  if (!fieldId) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'fieldId is required'
    );
  }

  try {
    const firestore = admin.firestore();
    
    // Get logs from user's deviceActions where fieldId matches
    const snapshot = await firestore
      .collection('users')
      .doc(userId)
      .collection('deviceActions')
      .where('fieldId', '==', fieldId)
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .get();

    const logs = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return {
      success: true,
      logs
    };
  } catch (error) {
    console.error(`[Device Action Logger] Error fetching logs for field ${fieldId}:`, error);
    throw new functions.https.HttpsError(
      'internal',
      'Failed to fetch field logs',
      error
    );
  }
});
