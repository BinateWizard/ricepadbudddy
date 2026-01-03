/**
 * Notification Dispatcher
 * Sends push notifications and emails to users
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

/**
 * Dispatch Notification
 * Trigger: Firestore /users/{userId}/notifications onCreate
 * 
 * When a new notification is created:
 * - Sends push notification to user's device
 * - Sends optional email if configured
 * - Updates notification with sent status
 * - Optionally logs to device logs
 */
export const dispatchNotification = functions.firestore
  .document('users/{userId}/notifications')
  .onCreate(async (snapshot, context) => {
    const userId = context.params.userId;
    const notification = snapshot.data();
    
    console.log(`[Dispatch] New notification for user ${userId}: ${notification.message}`);
    
    try {
      const firestore = admin.firestore();
      
      // Get user document for FCM tokens and email
      const userDoc = await firestore.collection('users').doc(userId).get();
      
      if (!userDoc.exists) {
        console.warn(`[Dispatch] User ${userId} not found`);
        return null;
      }
      
      const userData = userDoc.data();
      
      // Prepare notification payload
      const notificationPayload = {
        notification: {
          title: getNotificationTitle(notification.type),
          body: notification.message,
          icon: 'notification_icon'
        },
        data: {
          type: notification.type,
          deviceId: notification.deviceId || '',
          fieldId: notification.fieldId || '',
          timestamp: String(notification.timestamp)
        }
      };
      
      let sentCount = 0;
      
      // Send push notification via FCM
      if (userData?.fcmTokens && Array.isArray(userData.fcmTokens)) {
        for (const token of userData.fcmTokens) {
          try {
            await admin.messaging().send({
              token: token,
              ...notificationPayload
            });
            sentCount++;
            console.log(`[Dispatch] Push notification sent to token: ${token.substring(0, 20)}...`);
          } catch (error: any) {
            console.error(`[Dispatch] Error sending to token ${token.substring(0, 20)}:`, error.message);
            
            // Remove invalid token
            if (error.code === 'messaging/invalid-registration-token' ||
                error.code === 'messaging/registration-token-not-registered') {
              const tokens = userData.fcmTokens.filter((t: string) => t !== token);
              await userDoc.ref.update({ fcmTokens: tokens });
              console.log(`[Dispatch] Removed invalid token`);
            }
          }
        }
      }
      
      // Send email notification (optional)
      if (userData?.email && userData?.emailNotifications !== false) {
        try {
          // TODO: Implement email sending via SendGrid, Firebase Extensions, or similar
          // For now, just log
          console.log(`[Dispatch] Email notification would be sent to: ${userData.email}`);
          
          // Example with SendGrid:
          // await sendGridClient.send({
          //   to: userData.email,
          //   from: 'notifications@padbuddy.com',
          //   subject: getNotificationTitle(notification.type),
          //   text: notification.message
          // });
        } catch (error: any) {
          console.error(`[Dispatch] Error sending email:`, error.message);
        }
      }
      
      // Update notification document
      await snapshot.ref.update({
        sent: true,
        sentAt: Date.now(),
        sentCount: sentCount
      });
      
      // Optionally log to device logs if device-related
      if (notification.deviceId) {
        try {
          const devicesQuery = await firestore
            .collection('devices')
            .where('deviceId', '==', notification.deviceId)
            .limit(1)
            .get();
          
          if (!devicesQuery.empty) {
            const deviceDoc = devicesQuery.docs[0];
            
            await deviceDoc.ref.collection('logs').add({
              type: 'system',
              command: 'notification_sent',
              requestedState: null,
              actualState: 'success',
              success: true,
              timestamp: Date.now(),
              commandId: `notification_${snapshot.id}`,
              functionTriggered: 'dispatchNotification',
              userId: userId,
              details: {
                notificationType: notification.type,
                message: notification.message,
                sentCount: sentCount
              }
            });
            
            console.log(`[Dispatch] Logged notification send to device ${notification.deviceId}`);
          }
        } catch (error: any) {
          console.error(`[Dispatch] Error logging to device:`, error.message);
        }
      }
      
      console.log(`[Dispatch] Notification dispatched successfully (${sentCount} push sent)`);
      
      return { success: true, userId, sentCount };
      
    } catch (error: any) {
      console.error(`[Dispatch] Error dispatching notification:`, error);
      
      // Log error to system logs
      await admin.firestore().collection('systemLogs').add({
        functionName: 'dispatchNotification',
        userId,
        error: error.message,
        stack: error.stack,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
      
      return null;
    }
  });

/**
 * Get notification title based on type
 */
function getNotificationTitle(type: string): string {
  switch (type) {
    case 'offline':
      return 'Device Offline';
    case 'commandFailed':
      return 'Command Failed';
    case 'system':
      return 'System Notification';
    default:
      return 'PadBuddy Notification';
  }
}
