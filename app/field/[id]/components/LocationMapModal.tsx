'use client';

import { getTimeAgo } from '@/lib/utils/fieldHelpers';

interface LocationMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedPaddy: any;
  loadingLocation: boolean;
  locationData: { lat: number; lng: number; timestamp?: number } | null;
  otherDevicesHaveLocation: boolean;
}

export function LocationMapModal({
  isOpen,
  onClose,
  selectedPaddy,
  loadingLocation,
  locationData,
  otherDevicesHaveLocation
}: LocationMapModalProps) {
  if (!isOpen) return null;

  return (
    <>
      {/* Glassmorphism Overlay */}
      <div 
        onClick={onClose}
        className="fixed inset-0 backdrop-blur-sm bg-black/20 z-40 transition-all"
      />
      
      {/* Map Modal */}
      <div className="fixed inset-x-0 bottom-0 z-50 animate-slide-up">
        <div className="bg-white rounded-t-3xl shadow-2xl h-[80vh] flex flex-col border-t-4 border-green-500">
          {/* Handle Bar */}
          <div className="flex justify-center pt-3 pb-4">
            <div className="w-12 h-1.5 bg-green-300 rounded-full" />
          </div>
          
          {/* Modal Header */}
          <div className="px-6 pb-4 border-b border-gray-200">
            <h2 className="text-2xl font-bold text-gray-900">{selectedPaddy?.paddyName}</h2>
            <p className="text-sm text-gray-600 mt-1">Device: {selectedPaddy?.deviceId}</p>
          </div>
          
          {/* Map Content */}
          <div className="flex-1 relative">
            {loadingLocation ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mb-4"></div>
                <p className="text-gray-600">Fetching location...</p>
              </div>
            ) : locationData ? (
              <div className="absolute inset-0">
                {/* Map Container */}
                <iframe
                  width="100%"
                  height="100%"
                  frameBorder="0"
                  style={{ border: 0 }}
                  src={`https://www.google.com/maps?q=${locationData.lat},${locationData.lng}&output=embed`}
                  allowFullScreen
                />
                
                {/* Last Location Info Overlay */}
                <div className="absolute top-4 left-4 right-4 bg-white rounded-lg shadow-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-2">
                      <svg className="w-5 h-5 text-green-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <div>
                        <p className="text-sm font-medium text-gray-900">Last location</p>
                        <p className="text-xs text-gray-600 mt-0.5">{locationData.timestamp ? getTimeAgo(locationData.timestamp) : 'Unknown'}</p>
                      </div>
                    </div>
                    <button
                      onClick={onClose}
                      className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6">
                <div className="max-w-sm w-full bg-yellow-50 border border-yellow-200 rounded-lg p-6">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-start gap-3">
                      <svg className="w-6 h-6 text-yellow-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <div>
                        <p className="font-medium text-gray-900">
                          {otherDevicesHaveLocation ? "This device doesn't have a location" : "Location isn't initialized"}
                        </p>
                        <p className="text-sm text-gray-600 mt-1">
                          GPS coordinates have not been received from this device yet.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={onClose}
                      className="text-gray-400 hover:text-gray-600 transition-colors ml-2"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
          
          {/* Close Button */}
          <div className="px-6 py-4 border-t border-gray-200">
            <button
              onClick={onClose}
              className="w-full px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
