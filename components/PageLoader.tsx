'use client';

import { useEffect, useState, useRef } from 'react';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import { useNavigation } from '@/context/NavigationContext';

export default function PageLoader() {
  const [loading, setLoading] = useState(false);
  const pathname = usePathname();
  const isFirstLoad = useRef(true);
  const previousPathname = useRef<string | null>(null);
  const nav = useNavigation();

  useEffect(() => {
    // Skip loader on first mount (PWA initial load) - let the page render naturally
    if (isFirstLoad.current) {
      isFirstLoad.current = false;
      previousPathname.current = pathname;
      return;
    }

    // Only show loader when pathname actually changes (navigation)
    if (previousPathname.current === pathname) {
      return;
    }

    previousPathname.current = pathname;
    setLoading(true);

    // Short timeout for smooth navigation feel
    const timer = setTimeout(() => {
      setLoading(false);
      // clear navigation context if set
      try { nav.setLoading(false); } catch (e) {}
    }, 300);

    return () => clearTimeout(timer);
  }, [pathname]);

  // also show when global navigation context requests loading
  if (!loading && !nav.loading) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-gradient-to-br from-green-400 via-green-500 to-green-600">
      <div className="text-center animate-fade-in">
        <div className="flex justify-center mb-4">
          <div className="relative transform animate-pulse">
            <div className="absolute -inset-8 bg-white/20 rounded-full blur-3xl"></div>
            <Image 
              src="/icons/rice_logo.png" 
              alt="PadBuddy Logo" 
              width={120} 
              height={120}
              className="relative drop-shadow-2xl w-auto h-auto"
              priority
            />
          </div>
        </div>
        <h1 className="text-5xl font-black text-white mb-2 tracking-tight drop-shadow-lg animate-pulse" style={{ fontFamily: "'Courier New', Courier, monospace" }}>
          padbuddy
        </h1>
      </div>
    </div>
  );
}
