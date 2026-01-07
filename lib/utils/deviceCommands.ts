/**
 * Device Command Utilities
 * 
 * Handles sending commands to ESP32 nodes via Cloud Function
 * Cloud Function validates, logs, then writes to RTDB
 * ESP32 polls RTDB for commands
 */

import { database, functions } from '@/lib/firebase';
import { ref, get } from 'firebase/database';
import { httpsCallable } from 'firebase/functions';

export interface DeviceCommand {
  nodeId: 'ESP32A' | 'ESP32B' | 'ESP32C';
  role: 'relay' | 'motor' | 'npk' | 'gps';
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
  role: 'relay' | 'motor' | 'npk' | 'gps',
  action: string,
  params: Record<string, any> = {},
  userId: string
): Promise<CommandResult> {
  try {
    // Call Cloud Function to validate and send command
    const sendCommand = httpsCallable(functions, 'sendDeviceCommand');
    const result = await sendCommand({
      deviceId,
      nodeId,
      role,
      action,
      params
    });

    const data = result.data as any;
    console.log(`[Live Command] Sent via Cloud Function to ${deviceId}: ${action}`, data);

    if (!data.success) {
      return {
        success: false,
        message: data.message || 'Failed to send command'
      };
    }

    // Return success immediately - command sent to RTDB
    // ESP32 will poll and execute asynchronously
    // Use real-time listeners in UI to show completion status
    return {
      success: true,
      message: `✓ Command sent to ${nodeId}`,
      status: 'pending'
    };
  } catch (error: any) {
    console.error('[Live Command] Error sending command:', error);
    
    // Extract error message from Cloud Function error
    const errorMessage = error?.message || error?.details || 'Unknown error';
    
    return {
      success: false,
      message: `✗ Failed to send command: ${errorMessage}`
    };
  }
}

/**
 * Wait for ESP32 to complete command execution
 * ESP32 will update the command with status: "completed" and executedAt timestamp
 * @param deviceId - Device identifier
 * @param nodeId - Node that should complete the command
 * @param timeout - Maximum time to wait (ms)
 * @param commandType - Command type (relay1-4, motor, gps, npk)
 */
async function waitForCommandComplete(
  deviceId: string,
  nodeId: 'ESP32A' | 'ESP32B' | 'ESP32C',
  timeout: number,
  commandType: string
): Promise<{ completed: boolean; executedAt?: number; error?: string }> {
  const startTime = Date.now();
  const pollInterval = 500; // Check every 500ms

  while (Date.now() - startTime < timeout) {
    try {
      const commandPath = `devices/${deviceId}/commands/${nodeId}/${commandType}`;
      const commandRef = ref(database, commandPath);
      const snapshot = await get(commandRef);

      if (snapshot.exists()) {
        const command = snapshot.val();
        
        // ESP32 sets status to "completed" when done
        if (command.status === 'completed' && command.executedAt) {
          console.log(`[Command] Completed by ${deviceId}/${nodeId}/${commandType}`, command);
          return { completed: true, executedAt: command.executedAt };
        }
        
        // Check for error status
        if (command.status === 'error') {
          console.error(`[Command] Error from ${deviceId}/${nodeId}/${commandType}`, command);
          return { completed: false, error: command.error || 'Unknown error' };
        }
      }
    } catch (error) {
      console.error('Error checking command completion:', error);
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  console.warn(`[Command] Timeout waiting for ${deviceId}/${nodeId}/${commandType}`);
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
  nodeId: 'ESP32A' | 'ESP32B' | 'ESP32C',
  relayNumber?: number
): Promise<DeviceCommand | null> {
  try {
    const commandPath = relayNumber 
      ? `devices/${deviceId}/commands/${nodeId}/relay${relayNumber}`
      : `devices/${deviceId}/commands/${nodeId}`;
    const commandRef = ref(database, commandPath);
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
