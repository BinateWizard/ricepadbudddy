'use client';

import { useState, useEffect } from 'react';
import { WifiOff, Wifi, CloudOff } from 'lucide-react';

export default function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(true);
  const [showIndicator, setShowIndicator] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return; // Don't run on server
    
    // Set initial online status
    setIsOnline(navigator.onLine);
    setShowIndicator(!navigator.onLine);

    // Listen for online/offline events
    const handleOnline = () => {
      setIsOnline(true);
      setShowIndicator(true);
      // Hide after 3 seconds when coming back online
      setTimeout(() => {
        setShowIndicator(false);
      }, 3000);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowIndicator(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [mounted]);

  // Don't render until mounted
  if (!mounted || !showIndicator) return null;

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-[100] transition-all duration-300 ${
        showIndicator
          ? 'animate-slide-down'
          : 'translate-y-[-100%]'
      }`}
    >
      <div
        className={`mx-4 mt-4 rounded-xl shadow-lg p-3 flex items-center gap-3 ${
          isOnline
            ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white'
            : 'bg-gradient-to-r from-amber-500 to-orange-500 text-white'
        }`}
      >
        {isOnline ? (
          <>
            <Wifi className="h-5 w-5 flex-shrink-0" />
            <div className="flex-1">
              <span className="text-sm font-semibold">Back online!</span>
              <span className="text-xs opacity-90 ml-2">Syncing data...</span>
            </div>
          </>
        ) : (
          <>
            <CloudOff className="h-5 w-5 flex-shrink-0" />
            <div className="flex-1">
              <span className="text-sm font-semibold">You&apos;re offline</span>
              <span className="text-xs opacity-90 ml-2">Cached pages available</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}


