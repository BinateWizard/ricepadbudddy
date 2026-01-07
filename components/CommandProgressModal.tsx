'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CheckCircle2, Circle, Loader2, XCircle, AlertCircle, Clock } from 'lucide-react';
import { database } from '@/lib/firebase';
import { ref, onValue, off, remove } from 'firebase/database';

const COMMAND_TIMEOUT = 120000; // 2 minutes in milliseconds

interface CommandStep {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'completed' | 'error';
  message?: string;
}

interface CommandProgressModalProps {
  isOpen: boolean;
  onClose: () => void;
  deviceId: string;
  nodeId: string;
  commandType: string; // relay1-4, motor, gps, npk
  commandAction: string;
}

export function CommandProgressModal({
  isOpen,
  onClose,
  deviceId,
  nodeId,
  commandType,
  commandAction
}: CommandProgressModalProps) {
  const [steps, setSteps] = useState<CommandStep[]>([
    { id: 'validate', label: 'Validating command', status: 'active' },
    { id: 'send', label: 'Sending to device', status: 'pending' },
    { id: 'acknowledge', label: 'Waiting for device acknowledgment', status: 'pending' },
    { id: 'execute', label: 'Executing command', status: 'pending' },
    { id: 'complete', label: 'Completing', status: 'pending' }
  ]);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [timeoutTimer, setTimeoutTimer] = useState<NodeJS.Timeout | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);

  // Cleanup function to cancel command
  const cancelCommand = async () => {
    try {
      const commandPath = `devices/${deviceId}/commands/${nodeId}/${commandType}`;
      const commandRef = ref(database, commandPath);
      await remove(commandRef);
      console.log(`[Command] Cancelled and removed: ${commandPath}`);
    } catch (error) {
      console.error('[Command] Failed to cancel command:', error);
    }
  };

  // Elapsed time counter
  useEffect(() => {
    if (!isOpen || isComplete) return;

    const startTime = Date.now();
    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen, isComplete]);

  useEffect(() => {
    if (!isOpen) return;

    // Set timeout for 2 minutes
    const timeout = setTimeout(async () => {
      // Check if still not completed
      const commandPath = `devices/${deviceId}/commands/${nodeId}/${commandType}`;
      const commandRef = ref(database, commandPath);
      
      setSteps(prev => {
        const newSteps = [...prev];
        // Mark the current active step as error
        const activeIndex = newSteps.findIndex(s => s.status === 'active');
        if (activeIndex !== -1) {
          newSteps[activeIndex].status = 'error';
          newSteps[activeIndex].message = 'Timeout - no response after 2 minutes';
        }
        return newSteps;
      });
      
      setErrorMessage('Command timeout - device did not respond within 2 minutes');
      setIsComplete(true);
      
      // Cancel the command by removing it from RTDB
      await cancelCommand();
    }, COMMAND_TIMEOUT);

    setTimeoutTimer(timeout);

    // Listen to RTDB for command status updates
    const commandPath = `devices/${deviceId}/commands/${nodeId}/${commandType}`;
    const commandRef = ref(database, commandPath);

    const unsubscribe = onValue(commandRef, (snapshot) => {
      if (!snapshot.exists()) return;

      const command = snapshot.val();
      
      // Update steps based on command status
      setSteps(prevSteps => {
        const newSteps = [...prevSteps];

        // Validate completed (command exists in RTDB)
        if (newSteps[0].status !== 'error') {
          newSteps[0].status = 'completed';
        }

        // Send command (mark as active)
        if (command.sentAt && !command.acknowledgedAt) {
          newSteps[1].status = 'completed';
          newSteps[2].status = 'active';
          newSteps[2].message = 'Waiting for device...';
        }

        // Acknowledged
        if (command.acknowledgedAt && !command.executedAt) {
          newSteps[2].status = 'completed';
          newSteps[3].status = 'active';
          newSteps[3].message = 'Device is processing...';
        }

        // Completed
        if (command.status === 'completed' && command.executedAt) {
          newSteps[3].status = 'completed';
          newSteps[4].status = 'completed';
          newSteps[4].message = `${commandAction.toUpperCase()} successful`;
          setIsComplete(true);
          
          // Clear timeout timer
          if (timeoutTimer) {
            clearTimeout(timeoutTimer);
            setTimeoutTimer(null);
          }
          
          // Auto-close after 2 seconds
          setTimeout(() => {
            onClose();
          }, 2000);
        }

        // Error handling
        if (command.status === 'error') {
          const errorStep = command.acknowledgedAt ? 3 : 2; // Error during execution or acknowledgment
          newSteps[errorStep].status = 'error';
          newSteps[errorStep].message = command.error || 'Unknown error';
          setErrorMessage(command.error || 'Command failed');
          setIsComplete(true);
          
          // Clear timeout timer
          if (timeoutTimer) {
            clearTimeout(timeoutTimer);
            setTimeoutTimer(null);
          }
        }

        return newSteps;
      });
    });

    return () => {
      off(commandRef);
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
      }
    };
  }, [isOpen, deviceId, nodeId, commandType, commandAction, onClose, timeoutTimer]);

  // Auto-advance validation step after initial render
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        setSteps(prev => {
          const newSteps = [...prev];
          if (newSteps[0].status === 'active') {
            newSteps[0].status = 'completed';
            newSteps[1].status = 'active';
          }
          return newSteps;
        });
      }, 500);
    }
  }, [isOpen]);

  const getStepIcon = (step: CommandStep) => {
    switch (step.status) {
      case 'completed':
        return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case 'active':
        return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Circle className="w-5 h-5 text-gray-300" />;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && isComplete && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {errorMessage ? (
              <>
          {/* Elapsed Time */}
          {!isComplete && (
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 pt-1">
              <Clock className="w-4 h-4" />
              <span>{elapsedTime}s / 120s</span>
            </div>
          )}
                <AlertCircle className="w-5 h-5 text-red-500" />
                Command Failed
              </>
            ) : isComplete ? (
              <>
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                Command Completed
              </>
            ) : (
              <>
                <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                Processing Command
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Command Info */}
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-sm">
            <div className="font-medium text-gray-900 dark:text-gray-100">
              {nodeId} - {commandType}
            </div>
            <div className="text-gray-600 dark:text-gray-400">
              Action: <span className="font-mono">{commandAction}</span>
            </div>
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-medium text-red-900 dark:text-red-100">
                    Error
                  </div>
                  <div className="text-sm text-red-700 dark:text-red-300">
                    {errorMessage}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Progress Steps */}
          <div className="space-y-3">
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  {getStepIcon(step)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-medium ${
                    step.status === 'error' ? 'text-red-600 dark:text-red-400' :
                    step.status === 'completed' ? 'text-gray-900 dark:text-gray-100' :
                    step.status === 'active' ? 'text-blue-600 dark:text-blue-400' :
                    'text-gray-400 dark:text-gray-600'
                  }`}>
                    {step.label}
                  </div>
                  {step.message && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {step.message}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Close button for errors */}
          {errorMessage && (
            <button
              onClick={onClose}
              className="w-full px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 rounded-lg text-sm font-medium transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
