import React, { useState } from 'react';

interface BoundaryMappingModalProps {
  show: boolean;
  polygonCoords: { lat: number; lng: number }[];
  mapCenter: { lat: number; lng: number };
  isSavingBoundary: boolean;
  pointAddedNotification: boolean;
  hasSavedBoundary: boolean;
  onClose: () => void;
  onAddPoint: (lat: number, lng: number) => void;
  onRemovePoint: (index: number) => void;
  onRemoveLastPoint: () => void;
  onClearPolygon: () => void;
  onSaveBoundary: () => Promise<void>;
  calculatePolygonArea: (coords: { lat: number; lng: number }[]) => number;
}

export function BoundaryMappingModal({
  show,
  polygonCoords,
  mapCenter,
  isSavingBoundary,
  pointAddedNotification,
  hasSavedBoundary,
  onClose,
  onAddPoint,
  onRemovePoint,
  onRemoveLastPoint,
  onClearPolygon,
  onSaveBoundary,
  calculatePolygonArea
}: BoundaryMappingModalProps) {
  const [mapMode, setMapMode] = useState<'view' | 'edit'>('view');
  const [inputLat, setInputLat] = useState('');
  const [inputLng, setInputLng] = useState('');

  if (!show) return null;

  const handleAddCoordinateFromInput = () => {
    const lat = parseFloat(inputLat);
    const lng = parseFloat(inputLng);
    
    if (isNaN(lat) || isNaN(lng)) {
      alert('Please enter valid latitude and longitude values');
      return;
    }
    
    if (lat < -90 || lat > 90) {
      alert('Latitude must be between -90 and 90');
      return;
    }
    
    if (lng < -180 || lng > 180) {
      alert('Longitude must be between -180 and 180');
      return;
    }
    
    onAddPoint(lat, lng);
    setInputLat('');
    setInputLng('');
  };

  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white">
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-gray-900">Paddy Boundary Map</h2>
          <p className="text-sm text-gray-600 mt-1">
            {mapMode === 'view' ? 'Viewing saved boundary' : 'Add boundary points by entering coordinates below'}
          </p>
        </div>
        
        {/* Mode Toggle */}
        <div className="flex items-center gap-3 mr-4">
          <button
            onClick={() => setMapMode('view')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              mapMode === 'view'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            👁️ View
          </button>
          <button
            onClick={() => setMapMode('edit')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              mapMode === 'edit'
                ? 'bg-green-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            ✏️ Edit
          </button>
        </div>
        
        <button
          onClick={() => {
            onClose();
            setMapMode('view');
          }}
          disabled={isSavingBoundary}
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      
      {/* Point Added Notification */}
      {pointAddedNotification && polygonCoords.length > 0 && (
        <div className="absolute top-20 left-1/2 transform -translate-x-1/2 z-50 animate-fade-in">
          <div className="bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg">
            <div className="flex items-center gap-2 mb-1">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="font-bold">Point {polygonCoords.length} added!</span>
            </div>
            <div className="text-xs opacity-90">
              {polygonCoords[polygonCoords.length - 1].lat.toFixed(6)}, {polygonCoords[polygonCoords.length - 1].lng.toFixed(6)}
            </div>
          </div>
        </div>
      )}
      
      {/* Map Area */}
      <div className="flex-1 relative overflow-hidden bg-gray-100">
        {/* Google Maps Iframe */}
        <iframe
          width="100%"
          height="100%"
          frameBorder="0"
          className="ui-embed-fill"
          src={`https://www.google.com/maps?q=${mapCenter.lat},${mapCenter.lng}&output=embed&z=18`}
          allowFullScreen
          title="Map View"
        />
        
        {/* Boundary Visualization with SVG */}
        {polygonCoords.length > 0 && (
          <div className="absolute inset-0 pointer-events-none z-[5]">
            <svg className="absolute inset-0 w-full h-full">
              {/* Draw connecting lines */}
              {polygonCoords.length > 1 && (
                <>
                  {polygonCoords.map((coord, idx) => {
                    if (idx === polygonCoords.length - 1) return null;
                    
                    const nextCoord = polygonCoords[idx + 1];
                    const latDiff1 = (coord.lat - mapCenter.lat) * 100000;
                    const lngDiff1 = (coord.lng - mapCenter.lng) * 100000;
                    const latDiff2 = (nextCoord.lat - mapCenter.lat) * 100000;
                    const lngDiff2 = (nextCoord.lng - mapCenter.lng) * 100000;
                    
                    const x1 = 50 + (lngDiff1 / 10);
                    const y1 = 50 - (latDiff1 / 10);
                    const x2 = 50 + (lngDiff2 / 10);
                    const y2 = 50 - (latDiff2 / 10);
                    
                    return (
                      <line
                        key={`line-${idx}`}
                        x1={`${x1}%`}
                        y1={`${y1}%`}
                        x2={`${x2}%`}
                        y2={`${y2}%`}
                        stroke="#3b82f6"
                        strokeWidth="3"
                        opacity="0.8"
                        strokeLinecap="round"
                      />
                    );
                  })}
                  
                  {/* Close polygon with dashed line */}
                  {polygonCoords.length >= 3 && (() => {
                    const lastCoord = polygonCoords[polygonCoords.length - 1];
                    const firstCoord = polygonCoords[0];
                    const latDiffLast = (lastCoord.lat - mapCenter.lat) * 100000;
                    const lngDiffLast = (lastCoord.lng - mapCenter.lng) * 100000;
                    const latDiffFirst = (firstCoord.lat - mapCenter.lat) * 100000;
                    const lngDiffFirst = (firstCoord.lng - mapCenter.lng) * 100000;
                    
                    const xLast = 50 + (lngDiffLast / 10);
                    const yLast = 50 - (latDiffLast / 10);
                    const xFirst = 50 + (lngDiffFirst / 10);
                    const yFirst = 50 - (latDiffFirst / 10);
                    
                    return (
                      <line
                        key="line-close"
                        x1={`${xLast}%`}
                        y1={`${yLast}%`}
                        x2={`${xFirst}%`}
                        y2={`${yFirst}%`}
                        stroke="#3b82f6"
                        strokeWidth="3"
                        strokeDasharray="6,4"
                        opacity="0.6"
                        strokeLinecap="round"
                      />
                    );
                  })()}
                </>
              )}
              
              {/* Draw numbered point markers */}
              {polygonCoords.map((coord, idx) => {
                const latDiff = (coord.lat - mapCenter.lat) * 100000;
                const lngDiff = (coord.lng - mapCenter.lng) * 100000;
                
                const x = 50 + (lngDiff / 10);
                const y = 50 - (latDiff / 10);
                
                return (
                  <g key={`marker-${idx}`}>
                    <circle
                      cx={`${x}%`}
                      cy={`${y}%`}
                      r="12"
                      fill="#3b82f6"
                      stroke="white"
                      strokeWidth="2"
                      opacity="0.95"
                    />
                    <text
                      x={`${x}%`}
                      y={`${y}%`}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="white"
                      fontSize="12"
                      fontWeight="bold"
                      pointerEvents="none"
                    >
                      {idx + 1}
                    </text>
                  </g>
                );
              })}
            </svg>
            
            {/* Area badge overlay */}
            {polygonCoords.length >= 3 && (
              <div className="absolute top-4 right-4 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg font-semibold">
                <p className="text-xs opacity-90">Boundary Area</p>
                <p className="text-base">{(calculatePolygonArea(polygonCoords) / 10000).toFixed(4)} ha</p>
              </div>
            )}
          </div>
        )}
        
        {/* Controls Overlay - Edit Mode */}
        {mapMode === 'edit' && (
          <div className="absolute top-6 left-6 bg-white rounded-lg shadow-lg p-4 max-w-md z-10">
            <h3 className="font-semibold text-gray-900 mb-2">Add Boundary Points</h3>
            <p className="text-xs text-gray-600 mb-3">
              Enter GPS coordinates below to add boundary points. You need at least 3 points to create an area.
            </p>
            
            {/* Point counter */}
            <div className="pb-3 border-b border-gray-200 mb-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-900">Points: {polygonCoords.length}</p>
                {polygonCoords.length >= 3 && (
                  <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded font-semibold">
                    Ready to save
                  </span>
                )}
              </div>
              {polygonCoords.length >= 3 && (
                <p className="text-xs text-green-700 font-medium mt-1">
                  📐 Area: {(calculatePolygonArea(polygonCoords) / 10000).toFixed(4)} hectares
                </p>
              )}
            </div>
            
            {/* Coordinate Input */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-gray-900">Add Coordinates</p>
                {(inputLat || inputLng) && (
                  <button
                    onClick={() => {
                      setInputLat('');
                      setInputLng('');
                    }}
                    className="text-xs text-red-600 hover:text-red-700 font-medium"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="space-y-2">
                <input
                  type="number"
                  placeholder="Latitude"
                  value={inputLat}
                  onChange={(e) => setInputLat(e.target.value)}
                  step="0.000001"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <input
                  type="number"
                  placeholder="Longitude"
                  value={inputLng}
                  onChange={(e) => setInputLng(e.target.value)}
                  step="0.000001"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <button
                onClick={handleAddCoordinateFromInput}
                disabled={!inputLat || !inputLng}
                className="w-full mt-2 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                ➕ Add Point
              </button>
            </div>
            
            {/* Quick Actions */}
            {polygonCoords.length > 0 && (
              <div className="flex gap-2 pt-2 border-t border-gray-200">
                <button
                  onClick={onRemoveLastPoint}
                  className="flex-1 px-3 py-2 bg-yellow-100 text-yellow-700 rounded-lg text-xs font-medium hover:bg-yellow-200 transition-colors"
                >
                  ↶ Undo
                </button>
                <button
                  onClick={onClearPolygon}
                  className="flex-1 px-3 py-2 bg-red-100 text-red-700 rounded-lg text-xs font-medium hover:bg-red-200 transition-colors"
                >
                  Clear All
                </button>
              </div>
            )}
          </div>
        )}
        
        {/* View Mode Info */}
        {mapMode === 'view' && polygonCoords.length > 0 && (
          <div className="absolute top-6 left-6 bg-white rounded-lg shadow-lg p-4 z-10">
            <h3 className="font-semibold text-gray-900 mb-2">Boundary Info</h3>
            <div className="space-y-1 text-sm">
              <p className="text-gray-700">
                <span className="font-medium">Points:</span> {polygonCoords.length}
              </p>
              <p className="text-gray-700">
                <span className="font-medium">Area:</span> {(calculatePolygonArea(polygonCoords) / 10000).toFixed(4)} ha
              </p>
            </div>
            <p className="text-xs text-gray-500 mt-3">
              Switch to Edit mode to modify points
            </p>
          </div>
        )}
        
        {/* No boundary message */}
        {mapMode === 'view' && polygonCoords.length === 0 && (
          <div className="absolute top-6 left-6 bg-white rounded-lg shadow-lg p-4 z-10">
            <p className="text-sm text-gray-700">No boundary saved yet.</p>
            <p className="text-xs text-gray-500 mt-2">
              Switch to Edit mode to add points
            </p>
          </div>
        )}
      </div>
      
      {/* Footer */}
      <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 space-y-4">
        {/* Save Summary */}
        {polygonCoords.length >= 3 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm font-semibold text-blue-900 mb-1">Ready to Save</p>
            <p className="text-xs text-blue-700">
              📍 <strong>{polygonCoords.length}</strong> coordinates | 
              📐 <strong>{(calculatePolygonArea(polygonCoords) / 10000).toFixed(4)}</strong> hectares
            </p>
          </div>
        )}
        
        {/* Coordinates List */}
        {polygonCoords.length > 0 && (
          <div className="max-h-40 overflow-y-auto">
            <p className="font-semibold text-gray-900 mb-2">Boundary Points ({polygonCoords.length}):</p>
            <div className="space-y-2">
              {polygonCoords.map((coord, i) => (
                <div key={i} className="flex items-center justify-between bg-white rounded px-3 py-2 border border-gray-200">
                  <span className="text-xs text-gray-700 font-mono">
                    {i + 1}. {coord.lat.toFixed(6)}, {coord.lng.toFixed(6)}
                  </span>
                  <button
                    onClick={() => onRemovePoint(i)}
                    className="text-red-600 hover:text-red-700 text-xs font-medium hover:bg-red-50 px-2 py-1 rounded"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={isSavingBoundary}
            className="flex-1 px-4 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-semibold transition-colors disabled:bg-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={onSaveBoundary}
            disabled={isSavingBoundary || polygonCoords.length < 3}
            className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 font-bold shadow-lg transition-all disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {isSavingBoundary ? 'Saving...' : 'Save Boundary'}
          </button>
        </div>
      </div>
    </div>
  );
}
