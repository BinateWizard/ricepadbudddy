'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

export function PageTransitionLoader() {
  const [isLoading, setIsLoading] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    // Reset loading state when pathname changes (navigation complete)
    setIsLoading(false);
  }, [pathname]);

  // Expose function to trigger loading state
  useEffect(() => {
    // Create global function to trigger loading
    (window as any).__startPageTransition = () => setIsLoading(true);
    (window as any).__stopPageTransition = () => setIsLoading(false);
    
    return () => {
      delete (window as any).__startPageTransition;
      delete (window as any).__stopPageTransition;
    };
  }, []);

  if (!isLoading) return null;

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[9999] flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm mx-4 relative">
        {/* Close button */}
        <button
          onClick={() => setIsLoading(false)}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Cancel"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="flex flex-col items-center">
          {/* Loading spinner */}
          <div className="relative">
            <div className="w-16 h-16 border-4 border-green-200 border-t-green-600 rounded-full animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <svg className="w-8 h-8 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 3.5a1.5 1.5 0 013 0V4a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-.5a1.5 1.5 0 000 3h.5a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-.5a1.5 1.5 0 00-3 0v.5a1 1 0 01-1 1H6a1 1 0 01-1-1v-3a1 1 0 00-1-1h-.5a1.5 1.5 0 010-3H4a1 1 0 001-1V6a1 1 0 011-1h3a1 1 0 001-1v-.5z" />
              </svg>
            </div>
          </div>

          <h3 className="text-xl font-bold text-gray-900 mt-6 mb-2">Loading...</h3>
          <p className="text-sm text-gray-600 text-center">
            Please wait while we prepare your page
          </p>
          
          <button
            onClick={() => setIsLoading(false)}
            className="mt-6 px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// Helper hook to use loading state
export function usePageTransition() {
  const router = useRouter();

  const navigateWithLoading = (path: string) => {
    if (typeof window !== 'undefined' && (window as any).__startPageTransition) {
      (window as any).__startPageTransition();
    }
    router.push(path);
  };

  return { navigateWithLoading };
}
