'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Image from 'next/image';

export default function PageLoader() {
  const [loading, setLoading] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => {
      setLoading(false);
    }, 500);

    return () => clearTimeout(timer);
  }, [pathname]);

  if (!loading) return null;

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
              className="relative drop-shadow-2xl"
            />
          </div>
        </div>
        <h1 className="text-5xl font-black text-white mb-2 tracking-tight drop-shadow-lg animate-pulse">
          padbuddy
        </h1>
      </div>
    </div>
  );
}
