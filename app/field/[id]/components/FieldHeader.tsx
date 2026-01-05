'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

interface FieldHeaderProps {
  field: any;
}

export function FieldHeader({ field }: FieldHeaderProps) {
  const router = useRouter();

  if (!field) return null;

  return (
    <nav className="bg-gradient-to-r from-green-500 via-emerald-500 to-teal-500 sticky top-0 z-40 shadow-lg">
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/')}
              className="inline-flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white p-1 mr-1 transition-colors"
              aria-label="Back to home"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-white truncate max-w-[200px] sm:max-w-none">
                {field.fieldName}
              </h1>
              <p className="text-xs text-green-100">{field.riceVariety}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {field.status === 'active' && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                ✅ Active
              </span>
            )}
            {field.status === 'concluded' && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                🔚 Season Ended
              </span>
            )}
          </div>
        </div>
        {/* Field Status badges moved to tab - no header scan UI */}
      </div>
    </nav>
  );
}
