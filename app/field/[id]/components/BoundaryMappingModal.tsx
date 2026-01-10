'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

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

interface BoundaryMappingModalProps {
  show: boolean;
  polygonCoords: { lat: number; lng: number }[];
  mapCenter: { lat: number; lng: number };
  isSavingBoundary: boolean;
  hasSavedBoundary: boolean;
  onClose: () => void;
  onAddPoint: (lat: number, lng: number) => void;
  onRemovePoint: (index: number) => void;
  onRemoveLastPoint: () => void;
  onClearPolygon: () => void;
  onSaveBoundary: () => Promise<void>;
  calculatePolygonArea: (coords: { lat: number; lng: number }[]) => number;
  referencePolygon?: { lat: number; lng: number }[];
}

export function BoundaryMappingModal({
  show,
  polygonCoords,
  mapCenter,
  isSavingBoundary,
  hasSavedBoundary,
  onClose,
  onAddPoint,
  onRemovePoint,
  onRemoveLastPoint,
  onClearPolygon,
  onSaveBoundary,
  calculatePolygonArea,
  referencePolygon
}: BoundaryMappingModalProps) {
  // Configuration constants
  const MIN_POINT_DISTANCE_METERS = 0.5;
  const SNAP_TOLERANCE_METERS = 0.3;
  const DEFAULT_FALLBACK_LOCATION = { lat: 14.5995, lng: 120.9842 };
  const DEFAULT_ZOOM = 18;
  const MAX_ZOOM = 18;
  const MIN_POINTS = 3;
  const MAX_POINTS = 10;

  const [mapMode, setMapMode] = useState<'view' | 'edit'>('view');
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

  useEffect(() => {
    setIsMounted(true);
    setIsMapReady(true);
  }, []);

  useEffect(() => {
    if (!show || !isMounted) return;

    setIsLocating(true);

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const deviceLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          setCurrentCenter(deviceLocation);
          setIsLocating(false);
        },
        (error) => {
          const fallback = mapCenter || DEFAULT_FALLBACK_LOCATION;
          setCurrentCenter(fallback);
          setIsLocating(false);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    } else {
      setCurrentCenter(mapCenter || DEFAULT_FALLBACK_LOCATION);
      setIsLocating(false);
    }
  }, [show, mapCenter, isMounted]);

  useEffect(() => {
    if (!show || !isMounted || !currentCenter || !mapDivRef.current || mapRef.current) return;
    
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

    // Create a pane for labels so they render above imagery but below UI controls
    try {
      map.createPane('labels');
      const labelsPane = map.getPane('labels');
      if (labelsPane) {
        labelsPane.style.zIndex = '650';
        labelsPane.style.pointerEvents = 'none';
      }

      // Esri reference layer (places / boundaries) - provides place names
      L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
        {
          attribution: '&copy; Esri',
          pane: 'labels',
          maxZoom: MAX_ZOOM,
        }
      ).addTo(map);
    } catch (e) {
      console.warn('Labels pane creation or labels layer failed', e);
    }

    overlayGroupRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    
    // Force map to resize after initialization
    setTimeout(() => {
      if (mapRef.current) {
        mapRef.current.invalidateSize();
      }
    }, 100);
  }, [show, isMounted, currentCenter]);

  // Cleanup map when modal closes
  useEffect(() => {
    if (!show && mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
      overlayGroupRef.current = null;
    }
  }, [show]);

  useEffect(() => {
    if (!mapRef.current) return;

    const map = mapRef.current;

    if (mapClickHandlerRef.current) {
      map.off('click', mapClickHandlerRef.current);
    }

    const clickHandler = (e: any) => {
      if (mapMode !== 'edit') return;
      const { lat, lng } = e.latlng;

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

  useEffect(() => {
    if (!mapRef.current || !overlayGroupRef.current) return;
    
    const L = require('leaflet');
    const group = overlayGroupRef.current;
    group.clearLayers();

    if (currentCenter) {
      L.circleMarker([currentCenter.lat, currentCenter.lng], {
        radius: 10,
        color: '#3b82f6',
        fillColor: '#3b82f6',
        fillOpacity: 0.6,
        weight: 3,
      }).addTo(group);
    }

    // Reference polygon (device boundaries) - semi-transparent overlay
    if (referencePolygon && referencePolygon.length >= 3) {
      L.polygon(referencePolygon.map((c) => [c.lat, c.lng]), {
        color: '#8b5cf6',
        fillColor: '#8b5cf6',
        fillOpacity: 0.1,
        weight: 2,
        dashArray: '5, 5',
        className: 'reference-polygon'
      }).addTo(group);
    }

    polygonCoords.forEach((coord) => {
      L.circleMarker([coord.lat, coord.lng], {
        radius: 8,
        color: '#ef4444',
        fillColor: '#ef4444',
        fillOpacity: 0.8,
        weight: 2,
      }).addTo(group);
    });

    if (polygonCoords.length >= 3) {
      L.polygon(polygonCoords.map((c) => [c.lat, c.lng]), {
        color: '#3b82f6',
        fillColor: '#3b82f6',
        fillOpacity: 0.2,
        weight: 3,
      }).addTo(group);
    }
  }, [polygonCoords, currentCenter, referencePolygon]);

  if (!show || !isMounted || typeof window === 'undefined') return null;

  const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 6371e3;
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

  const isPointTooClose = (lat: number, lng: number): boolean => {
    return polygonCoords.some(coord => 
      calculateDistance(lat, lng, coord.lat, coord.lng) < MIN_POINT_DISTANCE_METERS
    );
  };

  const snapPoint = (lat: number, lng: number): { lat: number; lng: number } => {
    for (const coord of polygonCoords) {
      const distance = calculateDistance(lat, lng, coord.lat, coord.lng);
      if (distance < SNAP_TOLERANCE_METERS && distance > 0) {
        return { lat: coord.lat, lng: coord.lng };
      }
    }
    return { lat, lng };
  };

  const wouldCreateSelfIntersection = (newLat: number, newLng: number): boolean => {
    if (polygonCoords.length < 3) return false;

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

  const handleRemovePoint = (index: number) => {
    if (index !== polygonCoords.length - 1) {
      setValidationError('You can only remove the most recent point. Use "Undo" to remove the last point.');
      return;
    }
    
    onRemovePoint(index);
    setValidationError(null);
  };

  const handleSaveBoundary = async () => {
    await onSaveBoundary();
    setIsLocked(true);
    setMapMode('view');
  };

  const getPointLabel = (index: number): string => {
    return String.fromCharCode(65 + index);
  };

  if (!show || !isMounted || typeof window === 'undefined') return null;

  const modalContent = (
    <div className="fixed inset-0 z-[9999] h-screen w-screen flex flex-col bg-gray-900 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white shrink-0">
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
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Field Boundary Map</h2>
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
            <span className="text-xs bg-green-100 text-green-800 px-3 py-1 rounded-full font-semibold">
              🔒 Saved
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
      
      {/* Map Area */}
      <div className="flex-1 relative overflow-hidden bg-transparent">
        <div ref={mapDivRef} style={{ height: '100%', width: '100%', backgroundColor: 'transparent' }} />
        
        {/* Loading overlay - shows on top while loading */}
        {(!isMounted || !isMapReady || isLocating || !currentCenter) && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-[2000]">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-sm text-gray-600 font-semibold">
                {!isMounted || !isMapReady ? 'Loading map...' : 'Getting your location...'}
              </p>
            </div>
          </div>
        )}
        
        {/* Area badge */}
        {polygonCoords.length >= 3 && (
          <div className="absolute top-4 right-4 bg-green-600 text-white px-4 py-2 rounded-lg shadow-md font-semibold z-[1000]">
            <p className="text-xs opacity-90">Boundary Area</p>
            <p className="text-base">{(calculatePolygonArea(polygonCoords) / 10000).toFixed(4)} ha</p>
          </div>
        )}
        
        {/* Controls Overlay - Edit Mode */}
        {mapMode === 'edit' && (
          <div className="absolute top-6 left-6 bg-white rounded-lg shadow-md p-4 max-w-md z-[1000]">
            <h3 className="font-semibold text-gray-900 mb-2">✏️ Add Points</h3>
            <p className="text-xs text-gray-600 mb-3">
              Click on the map to add boundary points
            </p>
            
            {validationError && (
              <div className="mb-3 bg-red-50 border border-red-300 rounded-lg p-3">
                <p className="text-xs text-red-800 font-semibold">⚠️ {validationError}</p>
              </div>
            )}
            
            <div className="pb-3 border-b border-gray-200 mb-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-900">
                  📍 Points: <span className="text-blue-600">{polygonCoords.length}</span> / {MAX_POINTS}
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
        
        {mapMode === 'view' && polygonCoords.length === 0 && (
          <div className="absolute top-6 left-6 bg-white rounded-lg shadow-md p-4 z-[1000]">
            <p className="text-sm text-gray-700">No boundary saved yet.</p>
            <p className="text-xs text-gray-500 mt-2">
              Switch to Edit mode to add points
            </p>
          </div>
        )}
      </div>
      
      {/* Footer - Only show in Edit mode */}
      {mapMode === 'edit' && (
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 space-y-4 shrink-0">
          {polygonCoords.length > 0 && (
            <div className="max-h-[200px] overflow-y-auto">
              <p className="font-semibold text-gray-900 mb-2">📍 Boundary Points ({polygonCoords.length}):</p>
              <div className="space-y-2">
                {polygonCoords.map((coord, i) => (
                  <div key={i} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-gray-200">
                    <div className="flex-1">
                      <span className="text-sm font-semibold text-gray-900">Point {i + 1}</span>
                      <span className="text-xs text-gray-600 font-mono ml-3">
                        {coord.lat.toFixed(6)}, {coord.lng.toFixed(6)}
                      </span>
                    </div>
                    <button
                      onClick={() => handleRemovePoint(i)}
                      disabled={i !== polygonCoords.length - 1}
                      className={`ml-2 px-2 py-1 rounded text-sm transition-colors ${
                        i === polygonCoords.length - 1
                          ? 'text-red-600 hover:bg-red-50'
                          : 'text-gray-400 cursor-not-allowed'
                      }`}
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
              onClick={handleSaveBoundary}
              disabled={isSavingBoundary || polygonCoords.length < MIN_POINTS}
              className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 font-bold shadow-lg transition-all disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {isSavingBoundary ? 'Saving...' : 'Save Boundary'}
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return createPortal(modalContent, document.body);
}
