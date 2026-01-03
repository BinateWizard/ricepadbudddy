import React from 'react';

interface LocationModalProps {
  show: boolean;
  deviceId: string;
  gpsData: any;
  loadingGps: boolean;
  onClose: () => void;
  formatTimestamp: (ts: number) => string;
}

export function LocationModal({
  show,
  deviceId,
  gpsData,
  loadingGps,
  onClose,
  formatTimestamp
}: LocationModalProps) {
  if (!show) return null;

  return (
    <>
      {/* Glassmorphism Overlay */}
      <div 
        onClick={onClose}
        className="fixed inset-0 backdrop-blur-sm bg-black/20 z-40 transition-all"
      />
      
      {/* Location Modal */}
      <div className="fixed inset-x-0 bottom-0 z-50 animate-slide-up">
        <div className="bg-white rounded-t-3xl shadow-2xl max-h-[85vh] flex flex-col border-t-4 border-green-500">
          {/* Handle Bar */}
          <div className="flex justify-center pt-3 pb-4">
            <div className="w-12 h-1.5 bg-green-300 rounded-full" />
          </div>
          
          {/* Modal Header */}
          <div className="px-6 pb-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">GPS Location</h2>
                <p className="text-sm text-gray-600 mt-1">Device: {deviceId}</p>
              </div>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          
          {/* GPS Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {loadingGps ? (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mb-4"></div>
                <p className="text-gray-600">Fetching GPS data...</p>
              </div>
            ) : gpsData ? (
              <div className="space-y-6">
                {/* Map */}
                {gpsData.lat && gpsData.lng && (
                  <div className="bg-gray-100 rounded-xl overflow-hidden ui-map-container">
                    <iframe
                      width="100%"
                      height="100%"
                      frameBorder="0"
                      className="ui-iframe-reset"
                      src={`https://www.google.com/maps?q=${gpsData.lat},${gpsData.lng}&output=embed&zoom=15`}
                      allowFullScreen
                    />
                  </div>
                )}

                {/* GPS Details */}
                <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-6 border border-green-200">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                    </svg>
                    GPS Information
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-white rounded-lg p-4 border border-green-100">
                      <p className="text-xs font-medium text-gray-500 mb-1">Latitude</p>
                      <p className="text-lg font-bold text-gray-900">{gpsData.lat?.toFixed(7) || 'N/A'}</p>
                    </div>
                    <div className="bg-white rounded-lg p-4 border border-green-100">
                      <p className="text-xs font-medium text-gray-500 mb-1">Longitude</p>
                      <p className="text-lg font-bold text-gray-900">{gpsData.lng?.toFixed(7) || 'N/A'}</p>
                    </div>
                    <div className="bg-white rounded-lg p-4 border border-green-100">
                      <p className="text-xs font-medium text-gray-500 mb-1">Altitude</p>
                      <p className="text-lg font-bold text-gray-900">{gpsData.alt ? `${gpsData.alt.toFixed(1)} m` : 'N/A'}</p>
                    </div>
                    <div className="bg-white rounded-lg p-4 border border-green-100">
                      <p className="text-xs font-medium text-gray-500 mb-1">HDOP</p>
                      <p className="text-lg font-bold text-gray-900">{gpsData.hdop?.toFixed(2) || 'N/A'}</p>
                      <p className="text-xs text-gray-500 mt-1">Horizontal Dilution of Precision</p>
                    </div>
                    <div className="bg-white rounded-lg p-4 border border-green-100">
                      <p className="text-xs font-medium text-gray-500 mb-1">Satellites</p>
                      <p className="text-lg font-bold text-gray-900">{gpsData.sats || 'N/A'}</p>
                      <p className="text-xs text-gray-500 mt-1">Satellites in view</p>
                    </div>
                    <div className="bg-white rounded-lg p-4 border border-green-100">
                      <p className="text-xs font-medium text-gray-500 mb-1">Timestamp</p>
                      <p className="text-lg font-bold text-gray-900">{formatTimestamp(gpsData.ts)}</p>
                    </div>
                  </div>

                  {/* Google Maps Link */}
                  {gpsData.lat && gpsData.lng && (
                    <div className="mt-4">
                      <a
                        href={`https://www.google.com/maps?q=${gpsData.lat},${gpsData.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        Open in Google Maps
                      </a>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mb-4">
                  <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <p className="text-lg font-medium text-gray-900 mb-2">No GPS data available</p>
                <p className="text-sm text-gray-600 text-center max-w-sm">
                  GPS coordinates have not been received from this device yet. The device may need to initialize its GPS module.
                </p>
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
