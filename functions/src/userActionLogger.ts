/**
 * User Action Logger
 * 
 * Logs user actions from the control panel to Firestore
 * Actions are stored under actions/{userId}/userActions
 * Also includes test notification function
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

export interface UserAction {
  deviceId?: string;
  fieldId?: string;
  action: string;
  details?: Record<string, any>;
}

/**
 * HTTPS Callable Function: Log user action
 * 
 * Client calls this function with action details
 * Function writes to actions/{userId}/userActions with server timestamp
 */
export const logUserAction = functions.https.onCall(async (data: UserAction, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'User must be authenticated to log actions'
    );
  }

  const userId = context.auth.uid;
  const { deviceId, fieldId, action, details } = data;

  // Validate required fields
  if (!action) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Action is required'
    );
  }

  try {
    const firestore = admin.firestore();
    const timestamp = Date.now();
    
    const logEntry = {
      deviceId: deviceId || null,
      fieldId: fieldId || null,
      action,
      details: details || {},
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: timestamp
    };
    
    // Store in userActions collection (for Control Panel History tab)
    const actionRef = await firestore
      .collection('actions')
      .doc(userId)
      .collection('userActions')
      .add(logEntry);

    // Also store in deviceActions if deviceId exists (for Field logs via getFieldLogs)
    if (deviceId && fieldId) {
      await firestore
        .collection('users')
        .doc(userId)
        .collection('deviceActions')
        .add(logEntry);
    }

    console.log(`[User Action Logger] Logged action ${actionRef.id} for user ${userId}`);

    return {
      success: true,
      actionId: actionRef.id
    };
  } catch (error) {
    console.error(`[User Action Logger] Error logging action for user ${userId}:`, error);
    throw new functions.https.HttpsError(
      'internal',
      'Failed to log action',
      error
    );
  }
});

/**
 * HTTPS Callable Function: Send Test Push Notification
 * 
 * Client calls this function to test push notifications
 * Function creates a notification document which triggers dispatchNotification
 */
export const sendTestNotification = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'User must be authenticated to send notifications'
    );
  }

  const userId = context.auth.uid;
  const { message, type, deviceId, fieldId } = data;

  try {
    const firestore = admin.firestore();
    
    // Create notification document (this will trigger dispatchNotification)
    await firestore
      .collection('users')
      .doc(userId)
      .collection('notifications')
      .add({
        type: type || 'test',
        message: message || 'Test notification from PadBuddy!',
        deviceId: deviceId || null,
        fieldId: fieldId || null,
        timestamp: Date.now(),
        read: false,
        sent: false
      });

    console.log(`[Test Notification] Created notification for user ${userId}`);

    return {
      success: true,
      message: 'Notification queued for delivery'
    };
  } catch (error) {
    console.error(`[Test Notification] Error creating notification for user ${userId}:`, error);
    throw new functions.https.HttpsError(
      'internal',
      'Failed to send notification',
      error
    );
  }
});
