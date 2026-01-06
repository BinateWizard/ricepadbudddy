'use client';

interface FieldTabNavigationProps {
  activeTab: 'overview' | 'paddies' | 'statistics' | 'information' | 'control-panel';
  onTabChange: (tab: 'overview' | 'paddies' | 'statistics' | 'information' | 'control-panel') => void;
  hasDevices: boolean;
}

export function FieldTabNavigation({ activeTab, onTabChange, hasDevices }: FieldTabNavigationProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-gray-300 shadow-lg z-50 safe-area-bottom">
      <nav className="max-w-lg mx-auto flex justify-around items-center h-16 px-2">
        {/* Overview Tab - Blue */}
        <button
          onClick={() => onTabChange('overview')}
          className={`relative flex flex-col items-center justify-center w-16 h-14 rounded-xl transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white ${
            activeTab === 'overview'
              ? 'text-blue-600'
              : 'text-gray-500 hover:text-blue-600'
          }`}
        >
          {/* Active Indicator */}
          <div className={`absolute -top-1 left-1/2 -translate-x-1/2 w-8 h-1 rounded-full transition-all duration-300 ${
            activeTab === 'overview' ? 'bg-blue-600' : 'bg-transparent'
          }`} />
          <svg className={`w-6 h-6 transition-transform duration-300 ${activeTab === 'overview' ? 'scale-110' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={activeTab === 'overview' ? 2 : 1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {/* Label - only show when active */}
          <span className={`text-[10px] font-semibold mt-0.5 transition-all duration-300 ${
            activeTab === 'overview' ? 'opacity-100' : 'opacity-0 h-0'
          }`}>Overview</span>
        </button>

        {/* Paddies Tab - Green */}
        <button
          onClick={() => onTabChange('paddies')}
          className={`relative flex flex-col items-center justify-center w-16 h-14 rounded-xl transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white ${
            activeTab === 'paddies'
              ? 'text-green-600'
              : 'text-gray-500 hover:text-green-600'
          }`}
        >
          <div className={`absolute -top-1 left-1/2 -translate-x-1/2 w-8 h-1 rounded-full transition-all duration-300 ${
            activeTab === 'paddies' ? 'bg-green-600' : 'bg-transparent'
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

        {/* Statistics Tab - Purple (always visible; disabled if no devices) */}
        <button
          onClick={() => {
            if (!hasDevices) return;
            onTabChange('statistics');
          }}
          disabled={!hasDevices}
          className={`relative flex flex-col items-center justify-center w-16 h-14 rounded-xl transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white ${
            activeTab === 'statistics'
              ? 'text-purple-600'
              : hasDevices
                ? 'text-gray-500 hover:text-purple-600'
                : 'text-gray-300 cursor-not-allowed'
          }`}
        >
          <div className={`absolute -top-1 left-1/2 -translate-x-1/2 w-8 h-1 rounded-full transition-all duration-300 ${
            activeTab === 'statistics' ? 'bg-purple-600' : 'bg-transparent'
          }`} />
          <svg className={`w-6 h-6 transition-transform duration-300 ${activeTab === 'statistics' ? 'scale-110' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={activeTab === 'statistics' ? 2 : 1.5} d="M7 16V10M12 16V7M17 16V13" />
          </svg>
          <span className={`text-[10px] font-semibold mt-0.5 transition-all duration-300 ${
            activeTab === 'statistics' ? 'opacity-100' : 'opacity-0 h-0'
          }`}>Stats</span>
        </button>

        {/* Information Tab - Orange */}
        <button
          onClick={() => onTabChange('information')}
          className={`relative flex flex-col items-center justify-center w-16 h-14 rounded-xl transition-all duration-300 ${
            activeTab === 'information'
              ? 'text-orange-600'
              : 'text-gray-500 hover:text-orange-600'
          }`}
        >
          <div className={`absolute -top-1 left-1/2 -translate-x-1/2 w-8 h-1 rounded-full transition-all duration-300 ${
            activeTab === 'information' ? 'bg-orange-600' : 'bg-transparent'
          }`} />
          <svg className={`w-6 h-6 transition-transform duration-300 ${activeTab === 'information' ? 'scale-110' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={activeTab === 'information' ? 2 : 1.5} d="M13 16H9v-4h4v4zm-8-8h4V4H5v4zm8-4v4h4V4h-4z" />
          </svg>
          <span className={`text-[10px] font-semibold mt-0.5 transition-all duration-300 ${
            activeTab === 'information' ? 'opacity-100' : 'opacity-0 h-0'
          }`}>Info</span>
        </button>

        {/* Control Panel Tab - Amber */}
        <button
          onClick={() => onTabChange('control-panel')}
          className={`relative flex flex-col items-center justify-center w-16 h-14 rounded-xl transition-all duration-300 ${
            activeTab === 'control-panel'
              ? 'text-amber-600 bg-amber-50'
              : 'text-gray-500 hover:text-amber-600 hover:bg-gray-100'
          }`}
        >
          <div className={`absolute -top-1 left-1/2 -translate-x-1/2 w-8 h-1 rounded-full transition-all duration-300 ${
            activeTab === 'control-panel' ? 'bg-amber-600' : 'bg-transparent'
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
