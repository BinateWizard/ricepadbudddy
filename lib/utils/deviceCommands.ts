/**
 * Device Command Utilities
 * 
 * Handles sending commands to ESP32 nodes and managing their responses
 */

import { database } from '@/lib/firebase';
import { ref, update, get } from 'firebase/database';
import { getDeviceRef } from '@/lib/utils/rtdbHelper';

export interface DeviceCommand {
  nodeId: 'ESP32A' | 'ESP32B' | 'ESP32C';
  role: 'relay' | 'motor' | 'npk';
  action: string;
  params: Record<string, any>;
  ack: boolean;
  requestedAt: number;
  executedAt: number;
}

export interface CommandResult {
  success: boolean;
  message: string;
  ack?: boolean;
  executedAt?: number;
}

/**
 * Send command to device node
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
  try {
    const result = await getDeviceRef(deviceId);
    if (!result) {
      return { success: false, message: `Could not get ref for ${deviceId}` };
    }
    const { ref: deviceRef } = result;

    const now = Date.now();

    // Send command
    await update(deviceRef, {
      [`commands/${nodeId}`]: {
        nodeId,
        role,
        action,
        params,
        ack: false,
        requestedAt: now,
        executedAt: 0
      },
      [`audit/lastCommand`]: action,
      [`audit/lastCommandBy`]: userId,
      [`audit/lastCommandAt`]: now
    });

    // Wait for acknowledgment (up to 30 seconds)
    const ackResult = await waitForAcknowledgment(deviceId, nodeId, 30000);

    if (ackResult.acked) {
      return {
        success: true,
        message: `✓ ${role} command "${action}" executed`,
        ack: true,
        executedAt: ackResult.executedAt
      };
    } else {
      return {
        success: true,
        message: `⏱️ Command sent but no acknowledgment received (device may be offline)`,
        ack: false
      };
    }
  } catch (error) {
    console.error('Error sending device command:', error);
    return {
      success: false,
      message: `✗ Failed to send command: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Wait for ESP32 to acknowledge command execution
 * @param deviceId - Device identifier
 * @param nodeId - Node that should acknowledge
 * @param timeout - Maximum time to wait (ms)
 */
async function waitForAcknowledgment(
  deviceId: string,
  nodeId: 'ESP32A' | 'ESP32B' | 'ESP32C',
  timeout: number
): Promise<{ acked: boolean; executedAt?: number }> {
  const startTime = Date.now();
  const pollInterval = 500; // Check every 500ms

  while (Date.now() - startTime < timeout) {
    try {
      const result = await getDeviceRef(deviceId, `commands/${nodeId}`);
      if (!result) {
        throw new Error(`Could not get ref for ${deviceId}`);
      }
      const { ref: commandRef } = result;
      const snapshot = await get(commandRef);

      if (snapshot.exists()) {
        const command = snapshot.val();
        if (command.ack === true && command.executedAt > 0) {
          return { acked: true, executedAt: command.executedAt };
        }
      }
    } catch (error) {
      console.error('Error checking acknowledgment:', error);
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  return { acked: false };
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
    const result = await getDeviceRef(deviceId, `commands/${nodeId}`);
    if (!result) return null;
    const { ref: commandRef } = result;
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
    const result = await getDeviceRef(deviceId, `nodes/${nodeId}`);
    if (!result) return null;
    const { ref: nodeRef } = result;
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
