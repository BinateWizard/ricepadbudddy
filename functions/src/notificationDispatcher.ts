/**
 * Notification Dispatcher
 * Sends push notifications and emails to users
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as nodemailer from 'nodemailer';

// Email configuration - use environment variables in production
const EMAIL_USER = functions.config()?.email?.user || process.env.EMAIL_USER || 'noreply@padbuddy.com';
const EMAIL_PASS = functions.config()?.email?.password || process.env.EMAIL_PASSWORD || '';

// Create reusable transporter
let transporter: nodemailer.Transporter | null = null;

function getEmailTransporter() {
  if (!transporter && EMAIL_PASS) {
    transporter = nodemailer.createTransport({
      service: 'gmail', // or 'smtp.gmail.com'
      auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS, // Use App Password for Gmail
      },
    });
  }
  return transporter;
}

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
          const emailTransporter = getEmailTransporter();
          
          if (emailTransporter) {
            const emailSubject = getNotificationTitle(notification.type);
            const emailBody = `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #16a34a;">${emailSubject}</h2>
                <p style="font-size: 16px; color: #333;">${notification.message}</p>
                ${notification.deviceId ? `<p style="color: #666;">Device: ${notification.deviceId}</p>` : ''}
                ${notification.fieldId ? `<p style="color: #666;">Field ID: ${notification.fieldId}</p>` : ''}
                <hr style="margin: 20px 0; border: none; border-top: 1px solid #ddd;">
                <p style="font-size: 12px; color: #999;">This is an automated notification from PadBuddy. <a href="https://padbuddy.app">Open PadBuddy</a></p>
              </div>
            `;
            
            await emailTransporter.sendMail({
              from: `"PadBuddy" <${EMAIL_USER}>`,
              to: userData.email,
              subject: emailSubject,
              html: emailBody,
            });
            
            console.log(`[Dispatch] Email notification sent to: ${userData.email}`);
          } else {
            console.log(`[Dispatch] Email transporter not configured, skipping email to: ${userData.email}`);
          }
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
