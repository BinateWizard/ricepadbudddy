/**
 * System Logger & Audit Functions
 * Captures errors, retries, and unexpected events in Functions
 */

import * as admin from 'firebase-admin';

export interface SystemLog {
  functionName: string;
  level: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  timestamp: number | admin.firestore.FieldValue;
  userId?: string;
  deviceId?: string;
  fieldId?: string;
  error?: string;
  stack?: string;
  details?: Record<string, any>;
}

/**
 * Log system event to Firestore
 */
export async function logSystemEvent(log: Omit<SystemLog, 'timestamp'>): Promise<void> {
  try {
    const firestore = admin.firestore();
    
    const logData: SystemLog = {
      ...log,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    };
    
    await firestore.collection('systemLogs').add(logData);
    
    // Also log to console with appropriate level
    const prefix = `[${log.functionName}]`;
    const message = `${prefix} ${log.message}`;
    
    switch (log.level) {
      case 'info':
        console.log(message, log.details || '');
        break;
      case 'warning':
        console.warn(message, log.details || '');
        break;
      case 'error':
      case 'critical':
        console.error(message, log.error || '', log.details || '');
        break;
    }
  } catch (error: any) {
    // Fallback to console if Firestore write fails
    console.error('[System Logger] Failed to log to Firestore:', error);
    console.error('[System Logger] Original log:', log);
  }
}

/**
 * Log info message
 */
export async function logInfo(
  functionName: string,
  message: string,
  details?: Record<string, any>
): Promise<void> {
  await logSystemEvent({
    functionName,
    level: 'info',
    message,
    details
  });
}

/**
 * Log warning message
 */
export async function logWarning(
  functionName: string,
  message: string,
  details?: Record<string, any>
): Promise<void> {
  await logSystemEvent({
    functionName,
    level: 'warning',
    message,
    details
  });
}

/**
 * Log error message
 */
export async function logError(
  functionName: string,
  message: string,
  error: Error,
  details?: Record<string, any>
): Promise<void> {
  await logSystemEvent({
    functionName,
    level: 'error',
    message,
    error: error.message,
    stack: error.stack,
    details
  });
}

/**
 * Log critical error (requires immediate attention)
 */
export async function logCritical(
  functionName: string,
  message: string,
  error: Error,
  details?: Record<string, any>
): Promise<void> {
  await logSystemEvent({
    functionName,
    level: 'critical',
    message,
    error: error.message,
    stack: error.stack,
    details
  });
  
  // TODO: Send alert to admin (email, Slack, etc.)
}

/**
 * Clean up old system logs
 * Runs daily to remove logs older than 30 days
 */
import * as functions from 'firebase-functions';

export const cleanupSystemLogs = functions.pubsub
  .schedule('0 2 * * *')  // Daily at 2 AM
  .timeZone('Asia/Manila')
  .onRun(async (context) => {
    console.log('[System Logger] Starting system logs cleanup...');
    
    try {
      const firestore = admin.firestore();
      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
      
      // Get old logs
      const oldLogsQuery = await firestore
        .collection('systemLogs')
        .where('timestamp', '<', thirtyDaysAgo)
        .limit(500)  // Process in batches
        .get();
      
      if (oldLogsQuery.empty) {
        console.log('[System Logger] No old logs to clean up');
        return { success: true, deleted: 0 };
      }
      
      // Delete in batches
      const batch = firestore.batch();
      let deleteCount = 0;
      
      oldLogsQuery.docs.forEach((doc) => {
        batch.delete(doc.ref);
        deleteCount++;
      });
      
      await batch.commit();
      
      console.log(`[System Logger] Deleted ${deleteCount} old system logs`);
      
      return { success: true, deleted: deleteCount };
      
    } catch (error: any) {
      console.error('[System Logger] Error cleaning up logs:', error);
      return { success: false, error: error.message };
    }
  });

/**
 * Clean up old device logs
 * Runs daily to archive or remove old device command/sensor logs
 */
export const cleanupDeviceLogs = functions.pubsub
  .schedule('0 3 * * *')  // Daily at 3 AM
  .timeZone('Asia/Manila')
  .onRun(async (context) => {
    console.log('[Device Logger] Starting device logs cleanup...');
    
    try {
      const firestore = admin.firestore();
      const ninetyDaysAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);  // Keep 90 days
      
      // Get all devices
      const devicesSnapshot = await firestore.collection('devices').get();
      
      let totalDeleted = 0;
      
      for (const deviceDoc of devicesSnapshot.docs) {
        try {
          // Get old logs for this device
          const oldLogsQuery = await deviceDoc.ref
            .collection('logs')
            .where('timestamp', '<', ninetyDaysAgo)
            .limit(100)  // Process in smaller batches per device
            .get();
          
          if (!oldLogsQuery.empty) {
            const batch = firestore.batch();
            
            oldLogsQuery.docs.forEach((logDoc) => {
              batch.delete(logDoc.ref);
            });
            
            await batch.commit();
            
            totalDeleted += oldLogsQuery.size;
            console.log(`[Device Logger] Deleted ${oldLogsQuery.size} logs from device ${deviceDoc.id}`);
          }
        } catch (error: any) {
          console.error(`[Device Logger] Error cleaning logs for device ${deviceDoc.id}:`, error.message);
        }
      }
      
      console.log(`[Device Logger] Cleanup complete: ${totalDeleted} logs deleted`);
      
      return { success: true, deleted: totalDeleted };
      
    } catch (error: any) {
      console.error('[Device Logger] Fatal error during cleanup:', error);
      return { success: false, error: error.message };
    }
  });

/**
 * Generate daily system health report
 * Runs daily to summarize system status
 */
export const generateHealthReport = functions.pubsub
  .schedule('0 8 * * *')  // Daily at 8 AM
  .timeZone('Asia/Manila')
  .onRun(async (context) => {
    console.log('[Health Report] Generating daily system health report...');
    
    try {
      const firestore = admin.firestore();
      const now = Date.now();
      const yesterday = now - (24 * 60 * 60 * 1000);
      
      // Count total devices
      const devicesSnapshot = await firestore.collection('devices').get();
      const totalDevices = devicesSnapshot.size;
      
      // Count online devices
      let onlineDevices = 0;
      let offlineDevices = 0;
      
      for (const deviceDoc of devicesSnapshot.docs) {
        const deviceData = deviceDoc.data();
        if (deviceData.connected) {
          onlineDevices++;
        } else {
          offlineDevices++;
        }
      }
      
      // Count system logs by level (last 24 hours)
      const recentLogsQuery = await firestore
        .collection('systemLogs')
        .where('timestamp', '>=', yesterday)
        .get();
      
      let infoCount = 0, warningCount = 0, errorCount = 0, criticalCount = 0;
      
      recentLogsQuery.docs.forEach((doc) => {
        const logData = doc.data();
        switch (logData.level) {
          case 'info': infoCount++; break;
          case 'warning': warningCount++; break;
          case 'error': errorCount++; break;
          case 'critical': criticalCount++; break;
        }
      });
      
      // Count total users
      const usersSnapshot = await firestore.collection('users').get();
      const totalUsers = usersSnapshot.size;
      
      // Count total fields
      const fieldsSnapshot = await firestore.collection('fields').get();
      const totalFields = fieldsSnapshot.size;
      
      // Generate report
      const report = {
        date: new Date().toISOString().split('T')[0],
        timestamp: now,
        system: {
          status: criticalCount > 0 ? 'critical' : errorCount > 5 ? 'degraded' : 'healthy',
          totalDevices,
          onlineDevices,
          offlineDevices,
          totalUsers,
          totalFields
        },
        logs: {
          info: infoCount,
          warning: warningCount,
          error: errorCount,
          critical: criticalCount,
          total: recentLogsQuery.size
        },
        generatedBy: 'generateHealthReport'
      };
      
      // Store report
      await firestore.collection('healthReports').add(report);
      
      console.log('[Health Report] Report generated:', JSON.stringify(report, null, 2));
      
      // TODO: Send report via email to admins if status is not healthy
      
      return { success: true, report };
      
    } catch (error: any) {
      console.error('[Health Report] Error generating report:', error);
      return { success: false, error: error.message };
    }
  });
