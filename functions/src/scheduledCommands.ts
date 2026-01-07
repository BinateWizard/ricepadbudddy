/**
 * Scheduled Commands System
 * 
 * Layer 3: Scheduled Commands (Background execution)
 * - Client creates/edits schedules in Firestore
 * - Function triggers at scheduled time
 * - Function sends command to ESP32 via RTDB
 * - ESP32 executes and sends ACK
 * - Function verifies success/failure and logs to Firestore
 * - Sends notifications if command fails or device is offline
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

export interface ScheduledCommand {
  id: string;
  deviceId: string;
  ownerId: string;
  fieldId?: string;
  type: 'relay' | 'motor' | 'npk';
  action: string;
  params?: Record<string, any>;
  schedule: {
    type: 'once' | 'daily' | 'weekly' | 'monthly';
    datetime?: number; // Unix timestamp for 'once'
    time?: string; // HH:mm for recurring
    dayOfWeek?: number; // 0-6 for weekly
    dayOfMonth?: number; // 1-31 for monthly
    timezone?: string;
  };
  enabled: boolean;
  createdAt: number;
  createdBy: string;
  lastExecuted?: number;
  nextExecution?: number;
  status?: 'pending' | 'executing' | 'completed' | 'failed' | 'timeout';
}

export interface CommandExecution {
  commandId: string;
  deviceId: string;
  scheduledCommandId: string;
  type: string;
  action: string;
  params?: Record<string, any>;
  status: 'pending' | 'sent' | 'acknowledged' | 'completed' | 'failed' | 'timeout';
  sentAt?: number;
  acknowledgedAt?: number;
  completedAt?: number;
  error?: string;
  result?: any;
}

/**
 * Scheduled function: Check and execute scheduled commands
 * Runs every minute to check if any commands need to be executed
 */
export const executeScheduledCommands = functions.pubsub
  .schedule('* * * * *') // Every minute
  .timeZone('Asia/Manila')
  .onRun(async (context) => {
    console.log('[Scheduled Commands] Checking for scheduled commands...');
    
    const firestore = admin.firestore();
    const now = Date.now();
    
    try {
      // Query all enabled scheduled commands that are due
      const scheduledCommandsQuery = await firestore.collectionGroup('scheduledCommands')
        .where('enabled', '==', true)
        .where('nextExecution', '<=', now)
        .get();
      
      if (scheduledCommandsQuery.empty) {
        console.log('[Scheduled Commands] No commands to execute');
        return null;
      }
      
      console.log(`[Scheduled Commands] Found ${scheduledCommandsQuery.size} command(s) to execute`);
      
      const executions: Promise<any>[] = [];
      
      for (const doc of scheduledCommandsQuery.docs) {
        const scheduledCommand = doc.data() as ScheduledCommand;
        
        // Execute command
        executions.push(
          executeCommand(scheduledCommand, doc.ref)
            .catch(error => {
              console.error(`[Scheduled Commands] Error executing command ${doc.id}:`, error);
              return null;
            })
        );
      }
      
      await Promise.all(executions);
      
      console.log('[Scheduled Commands] Execution batch complete');
      return { success: true, executed: executions.length };
      
    } catch (error: any) {
      console.error('[Scheduled Commands] Fatal error:', error);
      throw error;
    }
  });

/**
 * Execute a scheduled command
 */
async function executeCommand(
  scheduledCommand: ScheduledCommand,
  commandRef: admin.firestore.DocumentReference
): Promise<void> {
  const firestore = admin.firestore();
  const database = admin.database();
  const now = Date.now();
  
  console.log(`[Scheduled Commands] Executing command ${scheduledCommand.id} for device ${scheduledCommand.deviceId}`);
  
  // Create execution log
  const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const execution: CommandExecution = {
    commandId: executionId,
    deviceId: scheduledCommand.deviceId,
    scheduledCommandId: scheduledCommand.id,
    type: scheduledCommand.type,
    action: scheduledCommand.action,
    params: scheduledCommand.params,
    status: 'pending',
    sentAt: now
  };
  
  // Log execution to Firestore
  const executionRef = await firestore.collection('commandExecutions').add(execution);
  
  try {
    // Check if device is online
    const deviceStatus = await checkDeviceStatus(scheduledCommand.deviceId, scheduledCommand.ownerId, scheduledCommand.fieldId);
    
    if (!deviceStatus.online) {
      throw new Error(`Device is offline (last seen ${Math.round(deviceStatus.timeSinceHeartbeat / 60000)} minutes ago)`);
    }
    
    // Send command to RTDB
    const commandData: any = {
      nodeId: getNodeIdForType(scheduledCommand.type),
      role: scheduledCommand.type,
      action: scheduledCommand.action,
      status: 'pending',
      requestedAt: now,
      requestedBy: 'system_scheduled',
      scheduledCommandId: scheduledCommand.id,
      executionId
    };
    
    if (scheduledCommand.params) {
      commandData.params = scheduledCommand.params;
    }
    
    // Write to RTDB
    const devicePath = scheduledCommand.fieldId
      ? `owners/${scheduledCommand.ownerId}/fields/${scheduledCommand.fieldId}/devices/${scheduledCommand.deviceId}`
      : `devices/${scheduledCommand.deviceId}`;
    
    await database.ref(`${devicePath}/commands/${commandData.nodeId}`).set(commandData);
    
    // Update execution status
    await executionRef.update({
      status: 'sent',
      sentAt: now
    });
    
    console.log(`[Scheduled Commands] Command sent to device ${scheduledCommand.deviceId}`);
    
    // Wait for ESP32 acknowledgment and completion (with timeout)
    const result = await waitForCommandCompletion(
      scheduledCommand.deviceId,
      commandData.nodeId,
      scheduledCommand.ownerId,
      scheduledCommand.fieldId,
      30000, // 30 second timeout
      commandData.role,
      commandData.relay
    );
    
    if (result.completed) {
      // Command completed successfully
      await executionRef.update({
        status: 'completed',
        completedAt: result.completedAt,
        result: result.result
      });
      
      console.log(`[Scheduled Commands] Command ${scheduledCommand.id} completed successfully`);
      
      // Log success to device audit trail
      await logCommandSuccess(scheduledCommand, result);
      
    } else if (result.acknowledged) {
      // Command was acknowledged but not completed in time
      await executionRef.update({
        status: 'timeout',
        acknowledgedAt: result.acknowledgedAt,
        error: 'Command acknowledged but timed out waiting for completion'
      });
      
      console.warn(`[Scheduled Commands] Command ${scheduledCommand.id} timed out`);
      
      // Send timeout notification
      await sendCommandNotification(scheduledCommand, 'timeout', 'Command timed out');
      
    } else {
      // Command was not acknowledged
      throw new Error('Device did not acknowledge command');
    }
    
    // Update next execution time
    await updateNextExecution(commandRef, scheduledCommand);
    
  } catch (error: any) {
    console.error(`[Scheduled Commands] Command ${scheduledCommand.id} failed:`, error);
    
    // Update execution status
    await executionRef.update({
      status: 'failed',
      error: error.message
    });
    
    // Log failure to Firestore
    await firestore.collection('errors').add({
      deviceId: scheduledCommand.deviceId,
      type: 'scheduled_command_failed',
      severity: 'warning',
      message: `Scheduled command ${scheduledCommand.id} failed: ${error.message}`,
      details: {
        commandId: scheduledCommand.id,
        commandType: scheduledCommand.type,
        action: scheduledCommand.action,
        error: error.message
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      resolved: false,
      notified: false
    });
    
    // Send failure notification
    await sendCommandNotification(scheduledCommand, 'failed', error.message);
  }
}

/**
 * Check if device is online via heartbeat
 */
async function checkDeviceStatus(
  deviceId: string,
  ownerId: string,
  fieldId?: string
): Promise<{ online: boolean; timeSinceHeartbeat: number }> {
  const database = admin.database();
  const HEARTBEAT_TIMEOUT = 10 * 60 * 1000; // 10 minutes
  
  // Try new hierarchy first
  let devicePath = fieldId
    ? `owners/${ownerId}/fields/${fieldId}/devices/${deviceId}`
    : `devices/${deviceId}`;
  
  const deviceSnapshot = await database.ref(devicePath).once('value');
  
  if (!deviceSnapshot.exists()) {
    // Try legacy path
    devicePath = `devices/${deviceId}`;
    const legacySnapshot = await database.ref(devicePath).once('value');
    if (!legacySnapshot.exists()) {
      return { online: false, timeSinceHeartbeat: Infinity };
    }
  }
  
  const deviceData = deviceSnapshot.val();
  const heartbeat = deviceData.status?.heartbeat || deviceData.heartbeat || 0;
  const now = Date.now();
  const timeSinceHeartbeat = now - heartbeat;
  
  return {
    online: timeSinceHeartbeat < HEARTBEAT_TIMEOUT,
    timeSinceHeartbeat
  };
}

/**
 * Get ESP32 node ID for command type
 */
function getNodeIdForType(type: string): 'ESP32A' | 'ESP32B' | 'ESP32C' {
  switch (type) {
    case 'relay':
      return 'ESP32A';
    case 'motor':
      return 'ESP32B';
    case 'npk':
      return 'ESP32C';
    default:
      return 'ESP32A';
  }
}

/**
 * Wait for command completion from ESP32
 */
async function waitForCommandCompletion(
  deviceId: string,
  nodeId: string,
  ownerId: string,
  fieldId: string | undefined,
  timeout: number,
  commandType?: string,
  relayNumber?: number
): Promise<{ completed: boolean; acknowledged: boolean; completedAt?: number; acknowledgedAt?: number; result?: any }> {
  const database = admin.database();
  const startTime = Date.now();
  const pollInterval = 500; // Check every 500ms
  
  const devicePath = fieldId
    ? `owners/${ownerId}/fields/${fieldId}/devices/${deviceId}`
    : `devices/${deviceId}`;
  
  let acknowledged = false;
  let acknowledgedAt: number | undefined;
  
  while (Date.now() - startTime < timeout) {
    // For relay commands, check the specific relay path
    const commandPath = (commandType === 'relay' && relayNumber)
      ? `${devicePath}/commands/${nodeId}/relay${relayNumber}`
      : `${devicePath}/commands/${nodeId}`;
    const commandSnapshot = await database.ref(commandPath).once('value');
    
    if (commandSnapshot.exists()) {
      const command = commandSnapshot.val();
      
      // Check for acknowledgment
      if (command.acknowledgedAt && !acknowledged) {
        acknowledged = true;
        acknowledgedAt = command.acknowledgedAt;
        console.log(`[Scheduled Commands] Device ${deviceId} acknowledged command`);
      }
      
      // Check for completion
      if (command.status === 'completed' && command.executedAt) {
        return {
          completed: true,
          acknowledged: true,
          completedAt: command.executedAt,
          acknowledgedAt: acknowledgedAt || command.acknowledgedAt,
          result: command.result
        };
      }
      
      // Check for error
      if (command.status === 'error' || command.status === 'failed') {
        throw new Error(command.error || 'Command execution failed');
      }
    }
    
    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
  
  // Timeout reached
  return {
    completed: false,
    acknowledged,
    acknowledgedAt
  };
}

/**
 * Update next execution time based on schedule
 */
async function updateNextExecution(
  commandRef: admin.firestore.DocumentReference,
  scheduledCommand: ScheduledCommand
): Promise<void> {
  const now = Date.now();
  
  let nextExecution: number | null = null;
  
  switch (scheduledCommand.schedule.type) {
    case 'once':
      // One-time command - disable after execution
      await commandRef.update({
        enabled: false,
        lastExecuted: now,
        nextExecution: null
      });
      return;
      
    case 'daily':
      // Execute daily at specified time
      nextExecution = calculateNextDailyExecution(scheduledCommand.schedule.time!);
      break;
      
    case 'weekly':
      // Execute weekly on specified day
      nextExecution = calculateNextWeeklyExecution(
        scheduledCommand.schedule.dayOfWeek!,
        scheduledCommand.schedule.time!
      );
      break;
      
    case 'monthly':
      // Execute monthly on specified day
      nextExecution = calculateNextMonthlyExecution(
        scheduledCommand.schedule.dayOfMonth!,
        scheduledCommand.schedule.time!
      );
      break;
  }
  
  if (nextExecution) {
    await commandRef.update({
      lastExecuted: now,
      nextExecution
    });
  }
}

/**
 * Calculate next daily execution time
 */
function calculateNextDailyExecution(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0);
  
  // If time has passed today, schedule for tomorrow
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  
  return next.getTime();
}

/**
 * Calculate next weekly execution time
 */
function calculateNextWeeklyExecution(dayOfWeek: number, time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  const now = new Date();
  const currentDay = now.getDay();
  
  let daysUntilNext = dayOfWeek - currentDay;
  if (daysUntilNext < 0 || (daysUntilNext === 0 && now.getHours() * 60 + now.getMinutes() >= hours * 60 + minutes)) {
    daysUntilNext += 7;
  }
  
  const next = new Date(now);
  next.setDate(next.getDate() + daysUntilNext);
  next.setHours(hours, minutes, 0, 0);
  
  return next.getTime();
}

/**
 * Calculate next monthly execution time
 */
function calculateNextMonthlyExecution(dayOfMonth: number, time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  const now = new Date();
  
  let next = new Date(now.getFullYear(), now.getMonth(), dayOfMonth, hours, minutes, 0, 0);
  
  // If date has passed this month, schedule for next month
  if (next.getTime() <= now.getTime()) {
    next.setMonth(next.getMonth() + 1);
  }
  
  // Handle invalid dates (e.g., Feb 31)
  if (next.getDate() !== dayOfMonth) {
    next = new Date(next.getFullYear(), next.getMonth() + 1, 0, hours, minutes, 0, 0); // Last day of month
  }
  
  return next.getTime();
}

/**
 * Log command success to Firestore
 */
async function logCommandSuccess(
  scheduledCommand: ScheduledCommand,
  result: any
): Promise<void> {
  const firestore = admin.firestore();
  
  await firestore.collection('commandLogs').add({
    deviceId: scheduledCommand.deviceId,
    commandId: scheduledCommand.id,
    type: scheduledCommand.type,
    action: scheduledCommand.action,
    status: 'success',
    executedAt: admin.firestore.FieldValue.serverTimestamp(),
    result: result.result,
    source: 'scheduled'
  });
}

/**
 * Send command notification
 */
async function sendCommandNotification(
  scheduledCommand: ScheduledCommand,
  status: 'success' | 'failed' | 'timeout',
  message: string
): Promise<void> {
  try {
    const firestore = admin.firestore();
    const messaging = admin.messaging();
    
    // Get user's FCM tokens
    const userDoc = await firestore.collection('users').doc(scheduledCommand.ownerId).get();
    if (!userDoc.exists) return;
    
    const userData = userDoc.data();
    const fcmTokens = userData?.fcmTokens || [];
    
    if (fcmTokens.length === 0) return;
    
    const title = status === 'success' 
      ? '✓ Scheduled Command Executed'
      : '⚠️ Scheduled Command Failed';
    
    const body = `Device ${scheduledCommand.deviceId}: ${message}`;
    
    const notification = {
      notification: { title, body },
      data: {
        type: 'scheduled_command',
        status,
        deviceId: scheduledCommand.deviceId,
        commandId: scheduledCommand.id
      },
      tokens: fcmTokens
    };
    
    await messaging.sendEachForMulticast(notification);
    console.log(`[Scheduled Commands] Sent notification to user ${scheduledCommand.ownerId}`);
    
  } catch (error) {
    console.error('[Scheduled Commands] Error sending notification:', error);
  }
}
