'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

interface DeviceLoadingModalProps {
  isOpen: boolean;
  deviceId: string;
  onCancel: () => void;
  onError?: (error: string) => void;
}

export function DeviceLoadingModal({ isOpen, deviceId, onCancel, onError }: DeviceLoadingModalProps) {
  const [loadingStage, setLoadingStage] = useState<string>('Initializing...');
  const [progress, setProgress] = useState(0);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setLoadingStage('Initializing...');
      setProgress(0);
      setHasError(false);
      setErrorMessage('');
      return;
    }

    // Simulate loading stages
    const stages = [
      { label: 'Connecting to device...', duration: 300 },
      { label: 'Loading device information...', duration: 400 },
      { label: 'Fetching sensor data...', duration: 400 },
      { label: 'Loading historical logs...', duration: 500 },
      { label: 'Retrieving GPS coordinates...', duration: 300 },
      { label: 'Finalizing...', duration: 200 }
    ];

    let currentStageIndex = 0;
    let currentProgress = 0;

    const updateStage = () => {
      if (currentStageIndex < stages.length) {
        const stage = stages[currentStageIndex];
        setLoadingStage(stage.label);
        currentProgress += (100 / stages.length);
        setProgress(Math.min(currentProgress, 95)); // Never reach 100% until navigation completes
        currentStageIndex++;
      }
    };

    // Start first stage immediately
    updateStage();

    // Progress through stages
    const intervals: NodeJS.Timeout[] = [];
    let totalDuration = 0;

    stages.forEach((stage, index) => {
      if (index > 0) { // Skip first since we did it immediately
        totalDuration += stages[index - 1].duration;
        const timeout = setTimeout(() => {
          updateStage();
        }, totalDuration);
        intervals.push(timeout);
      }
    });

    // Timeout after 10 seconds
    const errorTimeout = setTimeout(() => {
      setHasError(true);
      setErrorMessage('Loading is taking longer than expected. The device may be offline or experiencing connectivity issues.');
      onError?.('Timeout loading device data');
    }, 10000);

    return () => {
      intervals.forEach(clearTimeout);
      clearTimeout(errorTimeout);
    };
  }, [isOpen, onError]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop with blur */}
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onCancel}
      />
      
      {/* Modal */}
      <div className="relative bg-white/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/20 p-8 max-w-md w-full animate-scale-in">
        {/* Close button */}
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 p-2 rounded-lg hover:bg-gray-100/50 transition-colors"
          title="Cancel"
        >
          <X className="w-5 h-5 text-gray-600" />
        </button>

        {/* Content */}
        <div className="text-center">
          {!hasError ? (
            <>
              {/* Loading spinner */}
              <div className="mb-6 flex justify-center">
                <div className="relative w-20 h-20">
                  {/* Outer ring */}
                  <div className="absolute inset-0 border-4 border-gray-200 rounded-full"></div>
                  {/* Animated ring */}
                  <div className="absolute inset-0 border-4 border-green-500 rounded-full border-t-transparent animate-spin"></div>
                  {/* Inner pulse */}
                  <div className="absolute inset-2 bg-green-100 rounded-full animate-pulse"></div>
                </div>
              </div>

              {/* Device ID */}
              <h3 className="text-xl font-bold text-gray-900 mb-2">
                Loading Device
              </h3>
              <p className="text-sm text-gray-600 font-mono mb-6">
                {deviceId}
              </p>

              {/* Loading stage label */}
              <div className="mb-4">
                <p className="text-sm font-medium text-gray-700 mb-2">
                  {loadingStage}
                </p>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-gray-200 rounded-full h-2 mb-4 overflow-hidden">
                <div 
                  className="bg-gradient-to-r from-green-500 to-emerald-500 h-full rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>

              {/* Cancel button */}
              <button
                onClick={onCancel}
                className="mt-4 px-6 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100/50 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              {/* Error state */}
              <div className="mb-6 flex justify-center">
                <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center">
                  <svg className="w-10 h-10 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
              </div>

              <h3 className="text-xl font-bold text-gray-900 mb-2">
                Loading Failed
              </h3>
              <p className="text-sm text-gray-600 mb-6">
                {errorMessage}
              </p>

              <div className="flex gap-3 justify-center">
                <button
                  onClick={onCancel}
                  className="px-6 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                >
                  Close
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes scale-in {
          from {
            opacity: 0;
            transform: scale(0.9);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        .animate-scale-in {
          animation: scale-in 0.2s ease-out;
        }
      `}</style>
    </div>
  );
}
