'use client';

interface FieldTabNavigationProps {
  activeTab: 'overview' | 'paddies' | 'statistics' | 'information' | 'control-panel';
  onTabChange: (tab: 'overview' | 'paddies' | 'statistics' | 'information' | 'control-panel') => void;
  hasDevices: boolean;
}

export function FieldTabNavigation({ activeTab, onTabChange, hasDevices }: FieldTabNavigationProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-50 safe-area-bottom">
      <nav className="max-w-lg mx-auto flex justify-around items-center h-16 px-2">
        {/* Overview Tab */}
        <button
          onClick={() => onTabChange('overview')}
          className={`relative flex flex-col items-center justify-center w-16 h-14 rounded-xl transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white ${
            activeTab === 'overview'
              ? 'text-emerald-600'
              : 'text-gray-400 hover:text-emerald-600'
          }`}
        >
          {/* Active Indicator */}
          <div className={`absolute -top-1 left-1/2 -translate-x-1/2 w-8 h-1 rounded-full transition-all duration-300 ${
            activeTab === 'overview' ? 'bg-emerald-600' : 'bg-transparent'
          }`} />
          <svg className={`w-6 h-6 transition-transform duration-300 ${activeTab === 'overview' ? 'scale-110' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={activeTab === 'overview' ? 2 : 1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {/* Label - only show when active */}
          <span className={`text-[10px] font-semibold mt-0.5 transition-all duration-300 ${
            activeTab === 'overview' ? 'opacity-100' : 'opacity-0 h-0'
          }`}>Overview</span>
        </button>

        {/* Paddies Tab */}
        <button
          onClick={() => onTabChange('paddies')}
          className={`relative flex flex-col items-center justify-center w-16 h-14 rounded-xl transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white ${
            activeTab === 'paddies'
              ? 'text-emerald-600'
              : 'text-gray-400 hover:text-emerald-600'
          }`}
        >
          <div className={`absolute -top-1 left-1/2 -translate-x-1/2 w-8 h-1 rounded-full transition-all duration-300 ${
            activeTab === 'paddies' ? 'bg-emerald-600' : 'bg-transparent'
          }`} />
          <svg className={`w-6 h-6 transition-transform duration-300 ${activeTab === 'paddies' ? 'scale-110' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <rect x="3" y="3" width="7" height="7" strokeLinecap="round" strokeLinejoin="round" strokeWidth={activeTab === 'paddies' ? 2 : 1.5} />
            <rect x="14" y="3" width="7" height="7" strokeLinecap="round" strokeLinejoin="round" strokeWidth={activeTab === 'paddies' ? 2 : 1.5} />
            <rect x="3" y="14" width="7" height="7" strokeLinecap="round" strokeLinejoin="round" strokeWidth={activeTab === 'paddies' ? 2 : 1.5} />
            <rect x="14" y="14" width="7" height="7" strokeLinecap="round" strokeLinejoin="round" strokeWidth={activeTab === 'paddies' ? 2 : 1.5} />
          </svg>
          <span className={`text-[10px] font-semibold mt-0.5 transition-all duration-300 ${
            activeTab === 'paddies' ? 'opacity-100' : 'opacity-0 h-0'
          }`}>Paddies</span>
        </button>

        {/* Statistics Tab (always visible; disabled if no devices) */}
        <button
          onClick={() => {
            if (!hasDevices) return;
            onTabChange('statistics');
          }}
          disabled={!hasDevices}
          className={`relative flex flex-col items-center justify-center w-16 h-14 rounded-xl transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white ${
            activeTab === 'statistics'
              ? 'text-emerald-600'
              : hasDevices
                ? 'text-gray-400 hover:text-emerald-600'
                : 'text-gray-300 cursor-not-allowed'
          }`}
        >
          <div className={`absolute -top-1 left-1/2 -translate-x-1/2 w-8 h-1 rounded-full transition-all duration-300 ${
            activeTab === 'statistics' ? 'bg-emerald-600' : 'bg-transparent'
          }`} />
          <svg className={`w-6 h-6 transition-transform duration-300 ${activeTab === 'statistics' ? 'scale-110' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={activeTab === 'statistics' ? 2 : 1.5} d="M7 16V10M12 16V7M17 16V13" />
          </svg>
          <span className={`text-[10px] font-semibold mt-0.5 transition-all duration-300 ${
            activeTab === 'statistics' ? 'opacity-100' : 'opacity-0 h-0'
          }`}>Stats</span>
        </button>

        {/* Information Tab */}
        <button
          onClick={() => onTabChange('information')}
          className={`relative flex flex-col items-center justify-center w-16 h-14 rounded-xl transition-all duration-300 ${
            activeTab === 'information'
              ? 'text-emerald-600'
              : 'text-gray-400 hover:text-emerald-600'
          }`}
        >
          <div className={`absolute -top-1 left-1/2 -translate-x-1/2 w-8 h-1 rounded-full transition-all duration-300 ${
            activeTab === 'information' ? 'bg-emerald-600' : 'bg-transparent'
          }`} />
          <svg className={`w-6 h-6 transition-transform duration-300 ${activeTab === 'information' ? 'scale-110' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={activeTab === 'information' ? 2 : 1.5} d="M13 16H9v-4h4v4zm-8-8h4V4H5v4zm8-4v4h4V4h-4z" />
          </svg>
          <span className={`text-[10px] font-semibold mt-0.5 transition-all duration-300 ${
            activeTab === 'information' ? 'opacity-100' : 'opacity-0 h-0'
          }`}>Info</span>
        </button>

        {/* Control Panel Tab */}
        <button
          onClick={() => onTabChange('control-panel')}
          className={`relative flex flex-col items-center justify-center w-16 h-14 rounded-xl transition-all duration-300 ${
            activeTab === 'control-panel'
              ? 'text-emerald-600 bg-emerald-100'
              : 'text-gray-400 hover:text-emerald-600 hover:bg-gray-100'
          }`}
        >
          <div className={`absolute -top-1 left-1/2 -translate-x-1/2 w-8 h-1 rounded-full transition-all duration-300 ${
            activeTab === 'control-panel' ? 'bg-emerald-600' : 'bg-transparent'
          }`} />
          <svg className={`w-6 h-6 transition-transform duration-300 ${activeTab === 'control-panel' ? 'scale-110' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={activeTab === 'control-panel' ? 2 : 1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5a4 4 0 100-8 4 4 0 000 8z" />
          </svg>
          <span className={`text-[10px] font-semibold mt-0.5 transition-all duration-300 ${
            activeTab === 'control-panel' ? 'opacity-100' : 'opacity-0 h-0'
          }`}>Control</span>
        </button>
      </nav>
    </div>
  );
}
