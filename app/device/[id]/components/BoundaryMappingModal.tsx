'use client';

import React, { useState, useEffect, useRef } from 'react';

// Import Leaflet CSS
import 'leaflet/dist/leaflet.css';

// Fix Leaflet default marker icon issue with webpack/next.js
if (typeof window !== 'undefined') {
  const L = require('leaflet');
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  });
}

// We will render the map using Leaflet directly to avoid
// potential compatibility issues with React 19 + react-leaflet.

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
  // Configuration constants
  const MIN_POINT_DISTANCE_METERS = 0.5; // Minimum distance between points (meters)
  const SNAP_TOLERANCE_METERS = 0.3; // Snapping tolerance for point alignment
  const COORD_DECIMAL_PRECISION = 6; // Decimal places for coordinates
  const DEFAULT_FALLBACK_LOCATION = { lat: 14.5995, lng: 120.9842 }; // Manila fallback
  const DEFAULT_ZOOM = 18; // Field-level zoom
  const MAX_ZOOM = 18; // Maximum zoom level (Esri satellite tiles limit)
  const MIN_POINTS = 3; // Minimum points for a valid boundary
  const MAX_POINTS = 10; // Maximum points allowed

  const [mapMode, setMapMode] = useState<'view' | 'edit'>('view');
  const [inputLat, setInputLat] = useState('');
  const [inputLng, setInputLng] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [currentCenter, setCurrentCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [isLocating, setIsLocating] = useState(true);
  const [isMapReady, setIsMapReady] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const mapRef = useRef<any | null>(null);
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const overlayGroupRef = useRef<any | null>(null);
  const mapClickHandlerRef = useRef<any | null>(null);

  // Ensure we're on client side
  useEffect(() => {
    setIsMounted(true);
    setIsMapReady(true);
  }, []);

  // Request device geolocation on mount
  useEffect(() => {
    if (!show || !isMounted) return;

    setIsLocating(true);

    if ('geolocation' in navigator) {
      console.log('🗺️ Requesting device location...');
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const deviceLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          console.log('✅ Location obtained:', deviceLocation);
          setCurrentCenter(deviceLocation);
          setIsLocating(false);
        },
        (error) => {
          console.warn('⚠️ Geolocation error:', error.message);
          // Fall back to default or passed mapCenter
          const fallback = mapCenter || DEFAULT_FALLBACK_LOCATION;
          console.log('📍 Using fallback location:', fallback);
          setCurrentCenter(fallback);
          setIsLocating(false);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    } else {
      // Geolocation not supported
      console.warn('Geolocation not supported by browser');
      setCurrentCenter(mapCenter || DEFAULT_FALLBACK_LOCATION);
      setIsLocating(false);
    }
  }, [show, mapCenter, isMounted]);

  // Initialize map when ready
  useEffect(() => {
    if (!show || !isMounted || !currentCenter || !mapDivRef.current || mapRef.current) return;

    console.log('🗺️ Initializing Leaflet map...');
    
    const L = require('leaflet');
    
    const map = L.map(mapDivRef.current, {
      zoomControl: true,
    }).setView([currentCenter.lat, currentCenter.lng], DEFAULT_ZOOM);

    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        attribution: '&copy; Esri',
        maxZoom: MAX_ZOOM,
      }
    ).addTo(map);

    overlayGroupRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    
    console.log('✅ Map initialized successfully');
  }, [show, isMounted, currentCenter]);

  // Update click handler when mapMode or polygonCoords changes
  useEffect(() => {
    if (!mapRef.current) return;

    const map = mapRef.current;

    // Remove old handler
    if (mapClickHandlerRef.current) {
      map.off('click', mapClickHandlerRef.current);
    }

    // Add new handler
    const clickHandler = (e: any) => {
      if (mapMode !== 'edit') return;
      const { lat, lng } = e.latlng;

      console.log('Map clicked in edit mode:', lat, lng);

      if (polygonCoords.length >= MAX_POINTS) {
        setValidationError(`Maximum ${MAX_POINTS} points allowed`);
        return;
      }
      if (isPointTooClose(lat, lng)) {
        setValidationError(`Point too close to existing point (min ${MIN_POINT_DISTANCE_METERS}m apart)`);
        return;
      }
      if (wouldCreateSelfIntersection(lat, lng)) {
        setValidationError('This point would create a self-intersecting boundary');
        return;
      }
      const snapped = snapPoint(lat, lng);
      onAddPoint(snapped.lat, snapped.lng);
      setValidationError(null);
    };

    map.on('click', clickHandler);
    mapClickHandlerRef.current = clickHandler;

    return () => {
      if (mapClickHandlerRef.current) {
        map.off('click', mapClickHandlerRef.current);
      }
    };
  }, [mapMode, polygonCoords, onAddPoint]);

  // Render markers and polygon whenever polygonCoords changes
  useEffect(() => {
    if (!mapRef.current || !overlayGroupRef.current) return;
    
    const L = require('leaflet');
    const group = overlayGroupRef.current;
    group.clearLayers();

    // Current location marker
    if (currentCenter) {
      L.circleMarker([currentCenter.lat, currentCenter.lng], {
        radius: 10,
        color: '#3b82f6',
        fillColor: '#3b82f6',
        fillOpacity: 0.6,
        weight: 3,
      }).addTo(group);
    }

    // Point markers
    polygonCoords.forEach((coord) => {
      L.circleMarker([coord.lat, coord.lng], {
        radius: 8,
        color: '#ef4444',
        fillColor: '#ef4444',
        fillOpacity: 0.8,
        weight: 2,
      }).addTo(group);
    });

    // Polygon
    if (polygonCoords.length >= 3) {
      L.polygon(polygonCoords.map((c) => [c.lat, c.lng]), {
        color: '#3b82f6',
        fillColor: '#3b82f6',
        fillOpacity: 0.2,
        weight: 3,
      }).addTo(group);
    }
  }, [polygonCoords, currentCenter]);

  if (!show) return null;
  
  // Don't render until mounted on client
  if (!isMounted) return null;
  
  // Extra safety: ensure we're in browser environment
  if (typeof window === 'undefined') return null;

  // Utility: Calculate distance between two lat/lng points in meters (Haversine formula)
  const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lng2 - lng1) * Math.PI / 180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
  };

  // Utility: Check if point is too close to existing points
  const isPointTooClose = (lat: number, lng: number): boolean => {
    return polygonCoords.some(coord => 
      calculateDistance(lat, lng, coord.lat, coord.lng) < MIN_POINT_DISTANCE_METERS
    );
  };

  // Utility: Snap point to nearby points if within tolerance
  const snapPoint = (lat: number, lng: number): { lat: number; lng: number } => {
    for (const coord of polygonCoords) {
      const distance = calculateDistance(lat, lng, coord.lat, coord.lng);
      if (distance < SNAP_TOLERANCE_METERS && distance > 0) {
        return { lat: coord.lat, lng: coord.lng };
      }
    }
    return { lat, lng };
  };

  // Utility: Check if adding a new point would create self-intersecting polygon
  const wouldCreateSelfIntersection = (newLat: number, newLng: number): boolean => {
    if (polygonCoords.length < 3) return false;

    // Check if the new edge would intersect any existing edges
    const newPoint = { lat: newLat, lng: newLng };
    const lastPoint = polygonCoords[polygonCoords.length - 1];

    for (let i = 0; i < polygonCoords.length - 2; i++) {
      const p1 = polygonCoords[i];
      const p2 = polygonCoords[i + 1];
      
      if (doLinesIntersect(lastPoint, newPoint, p1, p2)) {
        return true;
      }
    }

    return false;
  };

  // Utility: Check if two line segments intersect
  const doLinesIntersect = (
    a1: { lat: number; lng: number },
    a2: { lat: number; lng: number },
    b1: { lat: number; lng: number },
    b2: { lat: number; lng: number }
  ): boolean => {
    const det = (a2.lng - a1.lng) * (b2.lat - b1.lat) - (b2.lng - b1.lng) * (a2.lat - a1.lat);
    if (det === 0) return false;

    const lambda = ((b2.lat - b1.lat) * (b2.lng - a1.lng) + (b1.lng - b2.lng) * (b2.lat - a1.lat)) / det;
    const gamma = ((a1.lat - a2.lat) * (b2.lng - a1.lng) + (a2.lng - a1.lng) * (b2.lat - a1.lat)) / det;

    return (0 < lambda && lambda < 1) && (0 < gamma && gamma < 1);
  };

  const handleAddCoordinateFromInput = () => {
    setValidationError(null);

    const lat = parseFloat(inputLat);
    const lng = parseFloat(inputLng);
    
    if (isNaN(lat) || isNaN(lng)) {
      setValidationError('Please enter valid latitude and longitude values');
      return;
    }
    
    if (lat < -90 || lat > 90) {
      setValidationError('Latitude must be between -90 and 90');
      return;
    }
    
    if (lng < -180 || lng > 180) {
      setValidationError('Longitude must be between -180 and 180');
      return;
    }

    // Check maximum points limit
    if (polygonCoords.length >= MAX_POINTS) {
      setValidationError(`Maximum ${MAX_POINTS} points allowed`);
      return;
    }

    // Check for duplicate/too close points
    if (isPointTooClose(lat, lng)) {
      setValidationError(`Point too close to existing point (min ${MIN_POINT_DISTANCE_METERS}m apart)`);
      return;
    }

    // Check for self-intersection
    if (wouldCreateSelfIntersection(lat, lng)) {
      setValidationError('This point would create a self-intersecting boundary');
      return;
    }

    // Apply snapping if close to existing points
    const snapped = snapPoint(lat, lng);
    
    onAddPoint(snapped.lat, snapped.lng);
    setInputLat('');
    setInputLng('');
    setValidationError(null);
  };

  // Stack-based point removal: only allow removing the last point
  const handleRemovePoint = (index: number) => {
    if (index !== polygonCoords.length - 1) {
      setValidationError('You can only remove the most recent point. Use "Undo" to remove the last point.');
      return;
    }
    
    onRemovePoint(index);
    setValidationError(null);
  };

  // Enhanced save handler that locks the boundary
  const handleSaveBoundary = async () => {
    await onSaveBoundary();
    setIsLocked(true);
    setMapMode('view');
  };

  // Convert index to letter (0 = A, 1 = B, 2 = C, etc.)
  const getPointLabel = (index: number): string => {
    return String.fromCharCode(65 + index);
  };

  return (
    <div className="h-screen flex flex-col bg-white">
      {/* Header - Desktop */}
      <div className="hidden md:flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-4 flex-1">
          <button
            onClick={() => {
              onClose();
              setMapMode('view');
            }}
            disabled={isSavingBoundary}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Paddy Boundary Map</h2>
            <p className="text-sm text-gray-600 mt-1">
              {mapMode === 'view' 
                ? '👁️ View the saved boundary' 
                : '✏️ Edit mode: Click map → Add points → Save boundary'}
            </p>
          </div>
        </div>
        
        {/* Mode Toggle */}
        <div className="flex items-center gap-3">
          {isLocked && hasSavedBoundary && (
            <span className="text-xs bg-red-100 text-red-800 px-3 py-1 rounded-full font-semibold">
              🔒 Locked
            </span>
          )}
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
            onClick={() => {
              if (polygonCoords.length > 0) {
                if (confirm('You have existing points. Do you want to clear them and start fresh?')) {
                  onClearPolygon();
                }
              }
              setMapMode('edit');
              if (isLocked) {
                setIsLocked(false);
              }
            }}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              mapMode === 'edit'
                ? 'bg-green-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            ✏️ Edit
          </button>
        </div>
      </div>

      {/* Header - Mobile */}
      <div className="md:hidden flex items-center justify-between px-3 py-2 border-b border-gray-200 bg-white">
        <button
          onClick={() => {
            onClose();
            setMapMode('view');
          }}
          disabled={isSavingBoundary}
          className="text-gray-400 hover:text-gray-600"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        <h2 className="text-base font-bold text-gray-900">Boundary</h2>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMapMode('view')}
            className={`px-2 py-1 rounded text-xs font-medium ${
              mapMode === 'view' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'
            }`}
          >
            View
          </button>
          <button
            onClick={() => {
              if (polygonCoords.length > 0) {
                if (confirm('You have existing points. Do you want to clear them and start fresh?')) {
                  onClearPolygon();
                }
              }
              setMapMode('edit');
              if (isLocked) {
                setIsLocked(false);
              }
            }}
            className={`px-2 py-1 rounded text-xs font-medium ${
              mapMode === 'edit' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700'
            }`}
          >
            Edit
          </button>
        </div>
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
      <div className="flex-1 relative overflow-hidden">
        {!isMounted || !isMapReady || isLocating || !currentCenter ? (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-sm text-gray-600 font-semibold">
                {!isMounted || !isMapReady ? 'Loading map...' : 'Getting your location...'}
              </p>
              {isMounted && isMapReady && isLocating && (
                <p className="text-xs text-gray-500 mt-2">Allow location access for accurate positioning</p>
              )}
            </div>
          </div>
        ) : (
          <div ref={mapDivRef} style={{ height: '100%', width: '100%' }} />
        )}
        
        {/* Area badge overlay - Desktop */}
        {polygonCoords.length >= 3 && (
          <div className="hidden md:block absolute top-4 right-4 bg-green-600 text-white px-4 py-2 rounded-lg shadow-md font-semibold z-[1000]">
            <p className="text-xs opacity-90">Boundary Area</p>
            <p className="text-base">{(calculatePolygonArea(polygonCoords) / 10000).toFixed(4)} ha</p>
          </div>
        )}
        
        {/* Area badge overlay - Mobile (compact) */}
        {polygonCoords.length >= 3 && (
          <div className="md:hidden absolute top-2 right-2 bg-green-600 text-white px-2 py-1 rounded shadow-md text-xs font-semibold z-[1000]">
            {(calculatePolygonArea(polygonCoords) / 10000).toFixed(3)} ha
          </div>
        )}
        
        {/* Controls Overlay - Desktop Edit Mode */}
        {mapMode === 'edit' && (
          <div className="hidden md:block absolute top-6 left-6 bg-white rounded-lg shadow-md p-4 max-w-md z-[1000]">
            <h3 className="font-semibold text-gray-900 mb-2">✏️ Add Points</h3>
            <p className="text-xs text-gray-600 mb-3">
              🖱️ Click anywhere on the map to add a point
              <br />
              📍 Points appear instantly (no need to click "Add Point")
              <br />
              💾 Click "Save Boundary" when done
            </p>
            
            {/* Validation Error Display */}
            {validationError && (
              <div className="mb-3 bg-red-50 border border-red-300 rounded-lg p-3">
                <p className="text-xs text-red-800 font-semibold">⚠️ {validationError}</p>
              </div>
            )}
            
            {/* Point counter */}
            <div className="pb-3 border-b border-gray-200 mb-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-900">
                  📍 Points Added: <span className="text-blue-600">{polygonCoords.length}</span> / {MAX_POINTS}
                </p>
                {polygonCoords.length >= MIN_POINTS && (
                  <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded font-semibold">
                    ✅ Ready
                  </span>
                )}
              </div>
              {polygonCoords.length >= MIN_POINTS && (
                <p className="text-xs text-green-700 font-medium mt-1">
                  📐 Area: {(calculatePolygonArea(polygonCoords) / 10000).toFixed(4)} hectares
                </p>
              )}
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
        
        {/* Controls Overlay - Mobile Edit Mode (minimal) */}
        {mapMode === 'edit' && (
          <div className="md:hidden absolute top-2 left-2 bg-white rounded shadow-md px-2 py-1 z-[1000]">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-900">
                {polygonCoords.length}/{MAX_POINTS}
              </span>
              {polygonCoords.length >= MIN_POINTS && (
                <span className="text-xs bg-green-100 text-green-800 px-1 rounded font-semibold">✓</span>
              )}
            </div>
          </div>
        )}
        
        {/* No boundary message */}
        {mapMode === 'view' && polygonCoords.length === 0 && (
          <div className="absolute top-6 left-6 bg-white rounded-lg shadow-md p-4 z-[1000]">
            <p className="text-sm text-gray-700">No boundary saved yet.</p>
            <p className="text-xs text-gray-500 mt-2">
              Switch to Edit mode to add points
            </p>
          </div>
        )}
      </div>
      
      {/* Footer - Desktop */}
      <div className="hidden md:flex px-6 py-4 border-t border-gray-200 bg-gray-50 space-y-4 h-[300px] flex-col">
        {/* Paddy Specifications */}
        {polygonCoords.length > 0 && (
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-lg text-blue-900">Paddy A</h3>
              {isLocked && (
                <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full font-semibold">
                  ✓ Saved
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-blue-600 font-medium">Points</p>
                <p className="text-blue-900 font-bold text-lg">{polygonCoords.length}</p>
              </div>
              <div>
                <p className="text-blue-600 font-medium">Area</p>
                <p className="text-blue-900 font-bold text-lg">{(calculatePolygonArea(polygonCoords) / 10000).toFixed(4)} ha</p>
              </div>
            </div>
          </div>
        )}

        {/* Status Message */}
        {!isLocked && polygonCoords.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-sm text-amber-800">
              ℹ️ <strong>Points are stored temporarily.</strong> Click "Save Boundary" to save to database.
            </p>
          </div>
        )}
        
        {/* Coordinates List */}
        {polygonCoords.length > 0 && (
          <div className="flex-1 overflow-y-auto">
            <p className="font-semibold text-gray-900 mb-2">📍 Boundary Points ({polygonCoords.length}):</p>
            <div className="space-y-2">
              {polygonCoords.map((coord, i) => (
                <div key={i} className="flex items-center justify-between bg-white rounded-lg px-3 py-3 border border-gray-200 hover:border-blue-300 transition-colors">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold">
                        {getPointLabel(i)}
                      </span>
                      <span className="text-sm font-semibold text-gray-900">Point {getPointLabel(i)}</span>
                    </div>
                    <span className="text-xs text-gray-600 font-mono ml-8">
                      {coord.lat.toFixed(6)}, {coord.lng.toFixed(6)}
                    </span>
                  </div>
                  <button
                    onClick={() => handleRemovePoint(i)}
                    disabled={i !== polygonCoords.length - 1}
                    className={`ml-2 px-2 py-1 rounded text-sm font-medium transition-colors ${
                      i === polygonCoords.length - 1
                        ? 'text-red-600 hover:text-red-700 hover:bg-red-50'
                        : 'text-gray-400 cursor-not-allowed'
                    }`}
                    title={i === polygonCoords.length - 1 ? `Remove Point ${getPointLabel(i)}` : 'Only the last point can be removed'}
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
            {isLocked ? 'Close' : 'Cancel'}
          </button>
          {!isLocked && (
            <button
              onClick={handleSaveBoundary}
              disabled={isSavingBoundary || polygonCoords.length < MIN_POINTS}
              className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 font-bold shadow-lg transition-all disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {isSavingBoundary ? 'Saving...' : 'Save Boundary'}
            </button>
          )}
        </div>
      </div>

      {/* Footer - Mobile (compact bottom bar) */}
      <div className="md:hidden px-3 py-2 border-t border-gray-200 bg-white">
        {polygonCoords.length > 0 && (
          <div className="flex items-center justify-between mb-2 text-xs">
            <div>
              <span className="font-bold text-gray-900">{polygonCoords.length} pts</span>
              {polygonCoords.length >= 3 && (
                <span className="text-gray-600 ml-2">
                  {(calculatePolygonArea(polygonCoords) / 10000).toFixed(3)} ha
                </span>
              )}
            </div>
            {polygonCoords.length > 0 && mapMode === 'edit' && (
              <div className="flex gap-2">
                <button
                  onClick={onRemoveLastPoint}
                  className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-xs font-medium"
                >
                  Undo
                </button>
                <button
                  onClick={onClearPolygon}
                  className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-medium"
                >
                  Clear
                </button>
              </div>
            )}
          </div>
        )}
        
        {validationError && (
          <div className="mb-2 bg-red-50 border border-red-200 rounded px-2 py-1">
            <p className="text-xs text-red-800">{validationError}</p>
          </div>
        )}
        
        <div className="flex gap-2">
          <button
            onClick={onClose}
            disabled={isSavingBoundary}
            className="flex-1 px-3 py-2 border border-gray-300 text-gray-700 rounded font-medium text-sm"
          >
            {isLocked ? 'Close' : 'Cancel'}
          </button>
          {!isLocked && (
            <button
              onClick={handleSaveBoundary}
              disabled={isSavingBoundary || polygonCoords.length < MIN_POINTS}
              className="flex-1 px-3 py-2 bg-blue-600 text-white rounded font-bold text-sm disabled:bg-gray-400"
            >
              {isSavingBoundary ? 'Saving...' : 'Save'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
