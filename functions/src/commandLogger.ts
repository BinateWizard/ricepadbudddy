/**
 * Centralized Logging System
 * 
 * Layer 4: Logs / Audit Trail
 * - Logs all commands (live or scheduled)
 * - Includes status: success / failure / timeout / offline
 * - Timestamp, device ID, command type, user ID
 * - Provides audit trail for compliance and debugging
 */

import * as admin from "firebase-admin";

export interface CommandLog {
  id?: string;
  deviceId: string;
  commandType: 'relay' | 'motor' | 'npk' | 'scan' | 'restart' | 'other';
  action: string;
  source: 'live' | 'scheduled' | 'system';
  status: 'pending' | 'sent' | 'acknowledged' | 'completed' | 'failed' | 'timeout' | 'offline';
  requestedBy: string; // User ID or 'system'
  requestedAt: number;
  sentAt?: number;
  acknowledgedAt?: number;
  completedAt?: number;
  params?: Record<string, any>;
  result?: any;
  error?: string;
  nodeId?: string;
  ownerId?: string;
  fieldId?: string;
  scheduledCommandId?: string;
}

/**
 * Log a command to Firestore
 */
export async function logCommand(log: CommandLog): Promise<string> {
  const firestore = admin.firestore();
  
  const logData = {
    ...log,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    createdAt: log.requestedAt || Date.now()
  };
  
  const docRef = await firestore.collection('commandLogs').add(logData);
  
  console.log(`[Command Logger] Logged command ${docRef.id} for device ${log.deviceId}`);
  
  return docRef.id;
}

/**
 * Update command log status
 */
export async function updateCommandLog(
  logId: string,
  updates: Partial<CommandLog>
): Promise<void> {
  const firestore = admin.firestore();
  
  await firestore.collection('commandLogs').doc(logId).update({
    ...updates,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  
  console.log(`[Command Logger] Updated log ${logId} with status: ${updates.status}`);
}

/**
 * Get command logs for a device
 */
export async function getDeviceCommandLogs(
  deviceId: string,
  limit: number = 50
): Promise<CommandLog[]> {
  const firestore = admin.firestore();
  
  const snapshot = await firestore.collection('commandLogs')
    .where('deviceId', '==', deviceId)
    .orderBy('requestedAt', 'desc')
    .limit(limit)
    .get();
  
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  } as CommandLog));
}

/**
 * Get command logs for a user
 */
export async function getUserCommandLogs(
  userId: string,
  limit: number = 100
): Promise<CommandLog[]> {
  const firestore = admin.firestore();
  
  const snapshot = await firestore.collection('commandLogs')
    .where('requestedBy', '==', userId)
    .orderBy('requestedAt', 'desc')
    .limit(limit)
    .get();
  
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  } as CommandLog));
}

/**
 * Log device error
 */
export async function logDeviceError(
  deviceId: string,
  errorType: string,
  severity: 'info' | 'warning' | 'error' | 'critical',
  message: string,
  details?: Record<string, any>
): Promise<string> {
  const firestore = admin.firestore();
  
  const errorData = {
    deviceId,
    type: errorType,
    severity,
    message,
    details: details || {},
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    resolved: false,
    notified: false
  };
  
  const docRef = await firestore.collection('errors').add(errorData);
  
  console.log(`[Error Logger] Logged ${severity} error for device ${deviceId}: ${message}`);
  
  return docRef.id;
}

/**
 * Resolve device error
 */
export async function resolveDeviceError(
  errorId: string,
  resolvedBy?: string
): Promise<void> {
  const firestore = admin.firestore();
  
  await firestore.collection('errors').doc(errorId).update({
    resolved: true,
    resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
    resolvedBy: resolvedBy || 'system'
  });
  
  console.log(`[Error Logger] Resolved error ${errorId}`);
}

/**
 * Get unresolved errors for a device
 */
export async function getDeviceErrors(
  deviceId: string,
  resolvedFilter?: boolean
): Promise<any[]> {
  const firestore = admin.firestore();
  
  let query = firestore.collection('errors')
    .where('deviceId', '==', deviceId);
  
  if (resolvedFilter !== undefined) {
    query = query.where('resolved', '==', resolvedFilter);
  }
  
  const snapshot = await query
    .orderBy('timestamp', 'desc')
    .limit(50)
    .get();
  
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}

/**
 * Log system event
 */
export async function logSystemEvent(
  eventType: string,
  message: string,
  details?: Record<string, any>
): Promise<void> {
  const firestore = admin.firestore();
  
  await firestore.collection('system_logs').add({
    type: eventType,
    message,
    details: details || {},
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  });
  
  console.log(`[System Logger] ${eventType}: ${message}`);
}

/**
 * Clean up old logs (for maintenance)
 */
export async function cleanupOldLogs(daysToKeep: number = 90): Promise<number> {
  const firestore = admin.firestore();
  const cutoffDate = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
  
  // Query old command logs
  const oldLogs = await firestore.collection('commandLogs')
    .where('requestedAt', '<', cutoffDate)
    .limit(500)
    .get();
  
  if (oldLogs.empty) {
    console.log('[Cleanup] No old logs to clean up');
    return 0;
  }
  
  // Delete in batches
  const batch = firestore.batch();
  oldLogs.docs.forEach(doc => {
    batch.delete(doc.ref);
  });
  
  await batch.commit();
  
  console.log(`[Cleanup] Deleted ${oldLogs.size} old command logs`);
  
  return oldLogs.size;
}

/**
 * Get command statistics for a device
 */
export async function getDeviceCommandStats(
  deviceId: string,
  days: number = 30
): Promise<{
  total: number;
  successful: number;
  failed: number;
  timeout: number;
  averageResponseTime: number;
}> {
  const firestore = admin.firestore();
  const cutoffDate = Date.now() - (days * 24 * 60 * 60 * 1000);
  
  const snapshot = await firestore.collection('commandLogs')
    .where('deviceId', '==', deviceId)
    .where('requestedAt', '>=', cutoffDate)
    .get();
  
  let total = 0;
  let successful = 0;
  let failed = 0;
  let timeout = 0;
  let totalResponseTime = 0;
  let responseCount = 0;
  
  snapshot.docs.forEach(doc => {
    const log = doc.data() as CommandLog;
    total++;
    
    if (log.status === 'completed') {
      successful++;
      if (log.completedAt && log.requestedAt) {
        totalResponseTime += (log.completedAt - log.requestedAt);
        responseCount++;
      }
    } else if (log.status === 'failed' || log.status === 'offline') {
      failed++;
    } else if (log.status === 'timeout') {
      timeout++;
    }
  });
  
  return {
    total,
    successful,
    failed,
    timeout,
    averageResponseTime: responseCount > 0 ? totalResponseTime / responseCount : 0
  };
}
