/**
 * Device Command Utilities
 * 
 * Handles sending commands to ESP32 nodes directly to RTDB
 * ESP32 uses stream listeners for instant response
 */

import { database } from '@/lib/firebase';
import { ref, get, update } from 'firebase/database';

export interface DeviceCommand {
  nodeId: 'ESP32A' | 'ESP32B' | 'ESP32C';
  role: 'relay' | 'motor' | 'npk';
  action: string;
  relay?: number;
  params?: Record<string, any>;
  status?: string; // 'pending' | 'completed' | 'error'
  requestedAt: number;
  executedAt?: number;
  error?: string;
}

export interface CommandResult {
  success: boolean;
  message: string;
  status?: string;
  executedAt?: number;
}

/**
 * Send command to device node directly to RTDB
 * 
 * Layer 1: Live Control (Foreground Only)
 * - Client sends live command via RTDB
 * - ESP32 responds with ACK
 * - Client shows waiting state during execution
 * - Timeout if no response (offline detection handled by Functions)
 * 
 * @param deviceId - Device identifier (e.g., "DEVICE_0001")
 * @param nodeId - ESP32 node (ESP32A, ESP32B, ESP32C)
 * @param role - Node role (relay, motor, npk)
 * @param action - Command action
 * @param params - Command parameters
 * @param userId - User executing the command
 */
export async function sendDeviceCommand(
  deviceId: string,
  nodeId: 'ESP32A' | 'ESP32B' | 'ESP32C',
  role: 'relay' | 'motor' | 'npk',
  action: string,
  params: Record<string, any> = {},
  userId: string
): Promise<CommandResult> {
  const now = Date.now();
  let logId: string | null = null;
  
  try {
    // Build command data
    const commandData: any = {
      nodeId,
      role,
      action,
      status: 'pending',
      requestedAt: now,
      requestedBy: userId,
      source: 'live' // Mark as live command (not scheduled)
    };

    // Add relay number for relay commands
    if (role === 'relay' && params.relay) {
      commandData.relay = params.relay;
    }

    // Add other params
    if (Object.keys(params).length > 0) {
      commandData.params = params;
    }

    // Write directly to RTDB
    const deviceRef = ref(database, `devices/${deviceId}`);
    await update(deviceRef, {
      [`commands/${nodeId}`]: commandData,
      [`audit/lastCommand`]: action,
      [`audit/lastCommandBy`]: userId,
      [`audit/lastCommandAt`]: now
    });

    console.log(`[Live Command] Sent to ${deviceId}/${nodeId}: ${action}`, commandData);

    // Log command to Firestore for audit trail
    try {
      const { collection, addDoc, serverTimestamp } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');
      const logDoc = await addDoc(collection(db, 'commandLogs'), {
        deviceId,
        nodeId,
        commandType: role,
        action,
        source: 'live',
        status: 'sent',
        requestedBy: userId,
        requestedAt: now,
        sentAt: now,
        params,
        timestamp: serverTimestamp()
      });
      logId = logDoc.id;
    } catch (logError) {
      console.warn('[Live Command] Failed to log command:', logError);
      // Continue even if logging fails
    }

    // Wait for ESP32 to complete the command (up to 30 seconds)
    // This shows "waiting" state in UI
    const completionResult = await waitForCommandComplete(deviceId, nodeId, 30000);

    if (completionResult.completed) {
      // Success - update log
      if (logId) {
        try {
          const { doc: firestoreDoc, updateDoc, serverTimestamp } = await import('firebase/firestore');
          const { db } = await import('@/lib/firebase');
          await updateDoc(firestoreDoc(db, 'commandLogs', logId), {
            status: 'completed',
            completedAt: completionResult.executedAt,
            updatedAt: serverTimestamp()
          });
        } catch (updateError) {
          console.warn('[Live Command] Failed to update log:', updateError);
        }
      }
      
      return {
        success: true,
        message: `✓ ${role} command "${action}" executed`,
        status: 'completed',
        executedAt: completionResult.executedAt
      };
    } else if (completionResult.error) {
      // Error - update log
      if (logId) {
        try {
          const { doc: firestoreDoc, updateDoc, serverTimestamp } = await import('firebase/firestore');
          const { db } = await import('@/lib/firebase');
          await updateDoc(firestoreDoc(db, 'commandLogs', logId), {
            status: 'failed',
            error: completionResult.error,
            updatedAt: serverTimestamp()
          });
        } catch (updateError) {
          console.warn('[Live Command] Failed to update log:', updateError);
        }
      }
      
      return {
        success: false,
        message: `✗ Command failed: ${completionResult.error}`,
        status: 'error'
      };
    } else {
      // Timeout - update log
      // Note: Official "device offline" detection is handled by heartbeat monitor (Functions)
      // Client just reports timeout
      if (logId) {
        try {
          const { doc: firestoreDoc, updateDoc, serverTimestamp } = await import('firebase/firestore');
          const { db } = await import('@/lib/firebase');
          await updateDoc(firestoreDoc(db, 'commandLogs', logId), {
            status: 'timeout',
            error: 'Device did not respond within 30 seconds',
            updatedAt: serverTimestamp()
          });
        } catch (updateError) {
          console.warn('[Live Command] Failed to update log:', updateError);
        }
      }
      
      return {
        success: false,
        message: `⏱️ Command timeout - device may be offline or busy`,
        status: 'timeout'
      };
    }
  } catch (error) {
    console.error('[Live Command] Error sending command:', error);
    
    // Log error
    if (logId) {
      try {
        const { doc: firestoreDoc, updateDoc, serverTimestamp } = await import('firebase/firestore');
        const { db } = await import('@/lib/firebase');
        await updateDoc(firestoreDoc(db, 'commandLogs', logId), {
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
          updatedAt: serverTimestamp()
        });
      } catch (updateError) {
        console.warn('[Live Command] Failed to update log:', updateError);
      }
    }
    
    return {
      success: false,
      message: `✗ Failed to send command: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Wait for ESP32 to complete command execution
 * ESP32 will update the command with status: "completed" and executedAt timestamp
 * @param deviceId - Device identifier
 * @param nodeId - Node that should complete the command
 * @param timeout - Maximum time to wait (ms)
 */
async function waitForCommandComplete(
  deviceId: string,
  nodeId: 'ESP32A' | 'ESP32B' | 'ESP32C',
  timeout: number
): Promise<{ completed: boolean; executedAt?: number; error?: string }> {
  const startTime = Date.now();
  const pollInterval = 500; // Check every 500ms

  while (Date.now() - startTime < timeout) {
    try {
      const commandRef = ref(database, `devices/${deviceId}/commands/${nodeId}`);
      const snapshot = await get(commandRef);

      if (snapshot.exists()) {
        const command = snapshot.val();
        
        // ESP32 sets status to "completed" when done
        if (command.status === 'completed' && command.executedAt) {
          console.log(`[Command] Completed by ${deviceId}/${nodeId}`, command);
          return { completed: true, executedAt: command.executedAt };
        }
        
        // Check for error status
        if (command.status === 'error') {
          console.error(`[Command] Error from ${deviceId}/${nodeId}`, command);
          return { completed: false, error: command.error || 'Unknown error' };
        }
      }
    } catch (error) {
      console.error('Error checking command completion:', error);
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  console.warn(`[Command] Timeout waiting for ${deviceId}/${nodeId}`);
  return { completed: false };
}

/**
 * Motor control commands
 */
export const motorCommands = {
  extend: async (
    deviceId: string,
    durationMs: number,
    userId: string
  ): Promise<CommandResult> => {
    return sendDeviceCommand(
      deviceId,
      'ESP32B',
      'motor',
      'extend',
      { direction: 'extend', duration: durationMs },
      userId
    );
  },

  retract: async (
    deviceId: string,
    durationMs: number,
    userId: string
  ): Promise<CommandResult> => {
    return sendDeviceCommand(
      deviceId,
      'ESP32B',
      'motor',
      'retract',
      { direction: 'retract', duration: durationMs },
      userId
    );
  },

  stop: async (
    deviceId: string,
    userId: string
  ): Promise<CommandResult> => {
    return sendDeviceCommand(
      deviceId,
      'ESP32B',
      'motor',
      'stop',
      { direction: 'none', duration: 0 },
      userId
    );
  }
};

/**
 * NPK sensor control commands
 */
export const npkCommands = {
  start: async (
    deviceId: string,
    durationMs: number,
    userId: string
  ): Promise<CommandResult> => {
    return sendDeviceCommand(
      deviceId,
      'ESP32C',
      'npk',
      'start',
      { duration: durationMs },
      userId
    );
  },

  scan: async (
    deviceId: string,
    durationMs: number,
    userId: string
  ): Promise<CommandResult> => {
    return sendDeviceCommand(
      deviceId,
      'ESP32C',
      'npk',
      'scan',
      { duration: durationMs },
      userId
    );
  },

  stop: async (
    deviceId: string,
    userId: string
  ): Promise<CommandResult> => {
    return sendDeviceCommand(
      deviceId,
      'ESP32C',
      'npk',
      'stop',
      { duration: 0 },
      userId
    );
  }
};

/**
 * Relay control commands
 */
export const relayCommands = {
  set: async (
    deviceId: string,
    relay1: boolean,
    relay2: boolean,
    userId: string
  ): Promise<CommandResult> => {
    return sendDeviceCommand(
      deviceId,
      'ESP32A',
      'relay',
      'set',
      { relay1, relay2 },
      userId
    );
  },

  toggleRelay1: async (
    deviceId: string,
    currentState: boolean,
    relay2State: boolean,
    userId: string
  ): Promise<CommandResult> => {
    return relayCommands.set(
      deviceId,
      !currentState,
      relay2State,
      userId
    );
  },

  toggleRelay2: async (
    deviceId: string,
    relay1State: boolean,
    currentState: boolean,
    userId: string
  ): Promise<CommandResult> => {
    return relayCommands.set(
      deviceId,
      relay1State,
      !currentState,
      userId
    );
  }
};

/**
 * Get command status from RTDB
 */
export async function getCommandStatus(
  deviceId: string,
  nodeId: 'ESP32A' | 'ESP32B' | 'ESP32C'
): Promise<DeviceCommand | null> {
  try {
    const commandRef = ref(database, `devices/${deviceId}/commands/${nodeId}`);
    const snapshot = await get(commandRef);

    if (snapshot.exists()) {
      return snapshot.val();
    }
    return null;
  } catch (error) {
    console.error('Error getting command status:', error);
    return null;
  }
}

/**
 * Get node status
 */
export async function getNodeStatus(
  deviceId: string,
  nodeId: 'ESP32A' | 'ESP32B' | 'ESP32C'
): Promise<{ status: string; lastSeen: number } | null> {
  try {
    const nodeRef = ref(database, `devices/${deviceId}/nodes/${nodeId}`);
    const snapshot = await get(nodeRef);

    if (snapshot.exists()) {
      const node = snapshot.val();
      return {
        status: node.status,
        lastSeen: node.lastSeen
      };
    }
    return null;
  } catch (error) {
    console.error('Error getting node status:', error);
    return null;
  }
}

/**
 * Check if node is online (last seen within X seconds)
 */
export function isNodeOnline(lastSeen: number, timeoutSeconds: number = 60): boolean {
  const now = Date.now();
  const secondsSinceLastSeen = (now - lastSeen) / 1000;
  return secondsSinceLastSeen <= timeoutSeconds;
}
