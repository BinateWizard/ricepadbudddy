/**
 * Device Action Logger
 * 
 * Logs all device actions (relay control, motor control, NPK scans, etc.)
 * Stores in Firestore: devices/{deviceId}/logs and users/{userId}/deviceActions
 * Provides high-level logging for audit and monitoring
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// Ensure this module uses the same regionalFunctions configuration as index.ts
const regionalFunctions = functions.region(process.env.FUNCTIONS_REGION || 'us-central1');

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
export const logDeviceAction = regionalFunctions.https.onCall(async (data: DeviceAction, context) => {
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
  } catch (error: any) {
    console.error(`[Device Action Logger] Error logging action for device ${deviceId}:`, error);
    return { success: false, message: 'Failed to log device action', error: error?.message || String(error) };
  }
});

/**
 * HTTPS Callable Function: Get Device Logs
 * 
 * Fetch logs for a specific device with pagination
 */
export const getDeviceLogs = regionalFunctions.https.onCall(async (data: { deviceId: string; limit?: number; startAfter?: number }, context) => {
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
  } catch (error: any) {
    console.error(`[Device Action Logger] Error fetching logs for device ${deviceId}:`, error);
    return { success: false, logs: [], message: 'Failed to fetch device logs', error: error?.message || String(error) };
  }
});

/**
 * HTTPS Callable Function: Get Field Logs
 * 
 * Fetch all logs for devices in a field
 */
export const getFieldLogs = regionalFunctions.https.onCall(async (data: { fieldId: string; limit?: number }, context) => {
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
    
    // NOTE: avoid composite-index requirements by reading the user's deviceActions
    // collection and performing filter+sort in memory. This trades read cost for
    // predictable behaviour without requiring index creation during development.
    const colRef = firestore.collection('users').doc(userId).collection('deviceActions');
    const snapshot = await colRef.get();

    const allLogs = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));

    // Filter by fieldId and sort by timestamp descending
    const filtered = allLogs
      .filter((entry) => entry.fieldId === fieldId)
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      .slice(0, limit);

    return {
      success: true,
      logs: filtered
    };
  } catch (error: any) {
    console.error(`[Device Action Logger] Error fetching logs for field ${fieldId}:`, error);
    return { success: false, logs: [], message: 'Failed to fetch field logs', error: error?.message || String(error) };
  }
});
