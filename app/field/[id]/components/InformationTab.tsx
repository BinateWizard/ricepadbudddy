'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { doc, updateDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';
import { db, database } from '@/lib/firebase';
import { getVarietyByName } from '@/lib/utils/varietyHelpers';
import { 
  getDaysSincePlanting, 
  getExpectedHarvestDate 
} from '@/lib/utils/stageCalculator';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface InformationTabProps {
  field: any;
  onFieldUpdate: () => void;
}

export function InformationTab({ field, onFieldUpdate }: InformationTabProps) {
  const { user } = useAuth();
  const router = useRouter();
  const [isConcluding, setIsConcluding] = useState(false);
  const [isEditingFieldName, setIsEditingFieldName] = useState(false);
  const [fieldNameValue, setFieldNameValue] = useState('');
  const [isSavingFieldName, setIsSavingFieldName] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showMapBoundaryModal, setShowMapBoundaryModal] = useState(false);
  const [mapCenter, setMapCenter] = useState({ lat: 14.5995, lng: 120.9842 }); // Default: Philippines
  const [polygonCoords, setPolygonCoords] = useState<{lat: number; lng: number}[]>([]);
  const [isSavingBoundary, setIsSavingBoundary] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [inputLat, setInputLat] = useState('');
  const [inputLng, setInputLng] = useState('');
  const [showCoordsForm, setShowCoordsForm] = useState(false);
  
  if (!field) return null;

  const variety = getVarietyByName(field.riceVariety);
  const daysSincePlanting = getDaysSincePlanting(field.startDay);
  const expectedHarvest = variety ? getExpectedHarvestDate(field.startDay, variety) : null;
  const isCompleted = daysSincePlanting >= (variety?.maturityDays?.max || 130);
  const fieldStatus = field.status || 'active';

  // Map canvas ref
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapZoomRef = useRef(18);

  // Handle map click to add points
  const handleMapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!mapContainerRef.current) return;

    const rect = mapContainerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Convert pixel coordinates to lat/lng
    // Simple mercator projection approximation
    const width = rect.width;
    const height = rect.height;
    
    const zoom = mapZoomRef.current;
    const scale = Math.pow(2, zoom);
    
    // Convert pixel to tile coordinates
    const tileX = (mapCenter.lng + 180) / 360 * scale + (x - width / 2) / (256 * scale / 360);
    const tileY = (90 - mapCenter.lat) / 180 * scale + (y - height / 2) / (256 * scale / 180);
    
    const lat = 90 - (tileY / scale) * 180;
    const lng = (tileX / scale) * 360 - 180;

    handleAddPoint(lat, lng);
  };

  const handleConcludeField = async () => {
    if (!user || !field.id) return;

    const action = isCompleted ? 'harvest' : 'conclude';
    const confirmMessage = isCompleted
      ? 'Mark this field as harvested? This indicates the season has been completed successfully.'
      : 'End this field season early? You can mark it as concluded if you need to stop tracking before maturity.';

    if (!confirm(confirmMessage)) return;

    setIsConcluding(true);
    try {
      const fieldRef = doc(db, `users/${user.uid}/fields/${field.id}`);
      await updateDoc(fieldRef, {
        status: isCompleted ? 'harvested' : 'concluded',
        concludedAt: new Date().toISOString(),
        concludedDay: daysSincePlanting,
      });

      alert(isCompleted ? '🌾 Field marked as harvested!' : '✓ Field season concluded');
      onFieldUpdate();
    } catch (error) {
      console.error('Error concluding field:', error);
      alert('Failed to update field status');
    } finally {
      setIsConcluding(false);
    }
  };

  const handleReopenField = async () => {
    if (!user || !field.id) return;
    if (!confirm('Reopen this field? This will mark it as active again.')) return;

    setIsConcluding(true);
    try {
      const fieldRef = doc(db, `users/${user.uid}/fields/${field.id}`);
      await updateDoc(fieldRef, {
        status: 'active',
        reopenedAt: new Date().toISOString(),
      });

      alert('✓ Field reopened successfully');
      onFieldUpdate();
    } catch (error) {
      console.error('Error reopening field:', error);
      alert('Failed to reopen field');
    } finally {
      setIsConcluding(false);
    }
  };

  const handleStartEditFieldName = () => {
    setFieldNameValue(field.fieldName || '');
    setIsEditingFieldName(true);
  };

  const handleCancelEditFieldName = () => {
    setIsEditingFieldName(false);
    setFieldNameValue('');
  };

  const handleSaveFieldName = async () => {
    if (!user || !field.id) return;
    
    const trimmedName = fieldNameValue.trim();
    if (!trimmedName) {
      alert('Field name cannot be empty');
      return;
    }

    if (trimmedName === field.fieldName) {
      setIsEditingFieldName(false);
      return;
    }

    setIsSavingFieldName(true);
    try {
      const fieldRef = doc(db, `users/${user.uid}/fields/${field.id}`);
      await updateDoc(fieldRef, {
        fieldName: trimmedName,
      });

      setIsEditingFieldName(false);
      onFieldUpdate();
    } catch (error) {
      console.error('Error updating field name:', error);
      alert('Failed to update field name');
    } finally {
      setIsSavingFieldName(false);
    }
  };

  const handleOpenMapBoundary = () => {
    // If field already has boundary, load it
    if (field.boundary && field.boundary.coordinates) {
      setPolygonCoords(field.boundary.coordinates);
    } else {
      setPolygonCoords([]);
    }
    
    // Try to get user's location for map center
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setMapCenter({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (error) => {
          console.log('Geolocation error:', error);
          // Keep default center
        }
      );
    }
    
    setIsDrawing(false);
    setShowCoordsForm(false);
    setShowMapBoundaryModal(true);
  };

  const handleAddPoint = (lat: number, lng: number) => {
    setPolygonCoords(prev => [...prev, { lat, lng }]);
  };

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
    
    handleAddPoint(lat, lng);
    setInputLat('');
    setInputLng('');
  };

  const handleRemovePoint = (index: number) => {
    setPolygonCoords(prev => prev.filter((_, i) => i !== index));
  };

  const handleRemoveLastPoint = () => {
    setPolygonCoords(prev => prev.slice(0, -1));
  };

  const handleClearPolygon = () => {
    setPolygonCoords([]);
  };

  const handleSaveBoundary = async () => {
    if (!user || !field.id) return;
    
    if (polygonCoords.length < 3) {
      alert('Please draw at least 3 points to create a boundary area');
      return;
    }

    setIsSavingBoundary(true);
    try {
      const fieldRef = doc(db, `users/${user.uid}/fields/${field.id}`);
      
      // Calculate area (approximate using spherical Earth)
      const area = calculatePolygonArea(polygonCoords);
      
      await updateDoc(fieldRef, {
        boundary: {
          coordinates: polygonCoords,
          area: area, // in square meters
          updatedAt: new Date().toISOString()
        }
      });

      alert(`✓ Field boundary saved! Area: ${(area / 10000).toFixed(2)} hectares`);
      setShowMapBoundaryModal(false);
      onFieldUpdate();
    } catch (error) {
      console.error('Error saving boundary:', error);
      alert('Failed to save field boundary');
    } finally {
      setIsSavingBoundary(false);
    }
  };

  const handleRemoveBoundary = async () => {
    if (!user || !field.id) return;
    if (!confirm('Remove the field boundary? This will delete the mapped area.')) return;

    setIsSavingBoundary(true);
    try {
      const fieldRef = doc(db, `users/${user.uid}/fields/${field.id}`);
      await updateDoc(fieldRef, {
        boundary: null
      });

      alert('✓ Field boundary removed');
      setShowMapBoundaryModal(false);
      onFieldUpdate();
    } catch (error) {
      console.error('Error removing boundary:', error);
      alert('Failed to remove field boundary');
    } finally {
      setIsSavingBoundary(false);
    }
  };

  // Calculate polygon area using Shoelace formula (approximation for small areas)
  const calculatePolygonArea = (coords: {lat: number; lng: number}[]) => {
    if (coords.length < 3) return 0;
    
    // Convert to meters (approximate at equator: 1 degree ≈ 111km)
    const R = 6371000; // Earth radius in meters
    let area = 0;
    
    for (let i = 0; i < coords.length; i++) {
      const j = (i + 1) % coords.length;
      const lat1 = coords[i].lat * Math.PI / 180;
      const lat2 = coords[j].lat * Math.PI / 180;
      const lng1 = coords[i].lng * Math.PI / 180;
      const lng2 = coords[j].lng * Math.PI / 180;
      
      area += (lng2 - lng1) * (2 + Math.sin(lat1) + Math.sin(lat2));
    }
    
    area = Math.abs(area * R * R / 2);
    return area;
  };

  const handleDeleteField = async () => {
    if (!user || !field.id) return;

    const confirmMessage = `Are you sure you want to delete "${field.fieldName}"?\n\nThis will permanently delete:\n- The field and all its data\n- All paddies and their logs\n- All task records\n\nThis action cannot be undone.`;
    
    if (!confirm(confirmMessage)) return;

    setIsDeleting(true);
    try {
      const paddiesRef = collection(db, `users/${user.uid}/fields/${field.id}/paddies`);
      const paddiesSnapshot = await getDocs(paddiesRef);
      
      const { ref, update: rtdbUpdate } = await import('firebase/database');
      for (const paddyDoc of paddiesSnapshot.docs) {
        const paddyData = paddyDoc.data();
        if (paddyData.deviceId) {
          try {
            const deviceRef = ref(database, `devices/${paddyData.deviceId}`);
            await rtdbUpdate(deviceRef, {
              ownedBy: null,
              connectedTo: null,
              connectedAt: null,
              fieldId: null,
              paddyName: null,
              status: 'available'
            });
          } catch (error) {
            console.error(`Error cleaning up device ${paddyData.deviceId}:`, error);
          }
        }
      }
      
      for (const paddyDoc of paddiesSnapshot.docs) {
        const logsRef = collection(db, `users/${user.uid}/fields/${field.id}/paddies/${paddyDoc.id}/logs`);
        const logsSnapshot = await getDocs(logsRef);
        for (const logDoc of logsSnapshot.docs) {
          await deleteDoc(doc(db, `users/${user.uid}/fields/${field.id}/paddies/${paddyDoc.id}/logs/${logDoc.id}`));
        }
        await deleteDoc(doc(db, `users/${user.uid}/fields/${field.id}/paddies/${paddyDoc.id}`));
      }

      const tasksRef = collection(db, `users/${user.uid}/fields/${field.id}/tasks`);
      const tasksSnapshot = await getDocs(tasksRef);
      for (const taskDoc of tasksSnapshot.docs) {
        await deleteDoc(doc(db, `users/${user.uid}/fields/${field.id}/tasks/${taskDoc.id}`));
      }

      const fieldRef = doc(db, `users/${user.uid}/fields/${field.id}`);
      await deleteDoc(fieldRef);

      alert('✓ Field deleted successfully');
      router.push('/');
    } catch (error) {
      console.error('Error deleting field:', error);
      alert('Failed to delete field. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6 -mx-1 sm:mx-0">
      <div className="bg-white rounded-xl shadow-md p-4 sm:p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900">Field Information</h2>
          {fieldStatus !== 'active' && (
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              fieldStatus === 'harvested' 
                ? 'bg-green-100 text-green-800' 
                : 'bg-gray-100 text-gray-800'
            }`}>
              {fieldStatus === 'harvested' ? '🌾 Harvested' : '🔚 Season Ended'}
            </span>
          )}
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm text-gray-600">Field Name</p>
              {!isEditingFieldName && (
                <button
                  onClick={handleStartEditFieldName}
                  className="text-green-600 hover:text-green-700 text-sm font-medium"
                  title="Edit field name"
                >
                  ✏️ Edit
                </button>
              )}
            </div>
            {isEditingFieldName ? (
              <div className="space-y-2">
                <Input
                  type="text"
                  value={fieldNameValue}
                  onChange={(e) => setFieldNameValue(e.target.value)}
                  className="text-lg font-medium"
                  placeholder="Enter field name"
                  disabled={isSavingFieldName}
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button
                    onClick={handleSaveFieldName}
                    disabled={isSavingFieldName}
                    className="flex-1 bg-green-600 hover:bg-green-700"
                  >
                    {isSavingFieldName ? 'Saving...' : 'Save'}
                  </Button>
                  <Button
                    onClick={handleCancelEditFieldName}
                    disabled={isSavingFieldName}
                    variant="outline"
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-lg font-medium text-gray-900">{field.fieldName}</p>
            )}
          </div>
          <div>
            <p className="text-sm text-gray-600 mb-1">Rice Variety</p>
            <p className="text-lg font-medium text-gray-900">{field.riceVariety}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600 mb-1">Planting Method</p>
            <p className="text-lg font-medium text-gray-900 capitalize">
              {field.plantingMethod === 'transplant' ? 'Transplant' : 
               field.plantingMethod === 'direct-planting' ? 'Direct Planting' :
               variety?.plantingMethod ? variety.plantingMethod.map((m: string) => m.replace('-', ' ')).join(' / ') :
               'Not specified'}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600 mb-1">Start Date (Day 0)</p>
            <p className="text-lg font-medium text-gray-900">
              {new Date(field.startDay).toLocaleDateString()}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600 mb-1">Current Day</p>
            <p className="text-lg font-medium text-gray-900">
              Day {daysSincePlanting}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600 mb-1">Expected Harvest</p>
            <p className="text-lg font-medium text-gray-900">
              {expectedHarvest ? new Date(expectedHarvest).toLocaleDateString() : 'N/A'}
            </p>
          </div>
          {field.concludedAt && (
            <div>
              <p className="text-sm text-gray-600 mb-1">
                {fieldStatus === 'harvested' ? 'Harvested On' : 'Concluded On'}
              </p>
              <p className="text-lg font-medium text-gray-900">
                {new Date(field.concludedAt).toLocaleDateString()} (Day {field.concludedDay})
              </p>
            </div>
          )}
          <div>
            <p className="text-sm text-gray-600 mb-1">Created</p>
            <p className="text-lg font-medium text-gray-900">
              {field.createdAt?.toDate ? new Date(field.createdAt.toDate()).toLocaleDateString() : 'N/A'}
            </p>
          </div>
          {field.description && (
            <div className="md:col-span-2">
              <p className="text-sm text-gray-600 mb-1">Description</p>
              <p className="text-gray-900">{field.description}</p>
            </div>
          )}
        </div>
      </div>

      {fieldStatus === 'active' && (
        <div className="bg-gradient-to-r from-yellow-50 to-orange-50 border border-orange-200 rounded-xl p-4 sm:p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {isCompleted ? '🌾 Ready for Harvest' : '⏸️ End Season Early'}
          </h3>
          <p className="text-sm text-gray-700 mb-4">
            {isCompleted
              ? 'Your rice has reached maturity. Mark this field as harvested to complete the season.'
              : `This field is currently on Day ${daysSincePlanting}. You can conclude this season early if needed.`}
          </p>
          <button
            onClick={handleConcludeField}
            disabled={isConcluding}
            className={`px-6 py-3 rounded-lg font-medium transition-all ${
              isCompleted
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : 'bg-orange-600 hover:bg-orange-700 text-white'
            } disabled:bg-gray-400 disabled:cursor-not-allowed`}
          >
            {isConcluding ? 'Processing...' : isCompleted ? '🌾 Mark as Harvested' : '🔚 Conclude Field'}
          </button>
        </div>
      )}

      {fieldStatus !== 'active' && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 sm:p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Field is {fieldStatus === 'harvested' ? 'Harvested' : 'Concluded'}
          </h3>
          <p className="text-sm text-gray-700 mb-4">
            This field season has ended. You can reopen it if you need to continue tracking.
          </p>
          <button
            onClick={handleReopenField}
            disabled={isConcluding}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-all disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {isConcluding ? 'Processing...' : '↻ Reopen Field'}
          </button>
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 sm:p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          🗺️ Field Boundary
        </h3>
        <p className="text-sm text-gray-700 mb-4">
          {field.boundary 
            ? `Mapped area: ${(field.boundary.area / 10000).toFixed(2)} hectares (${field.boundary.coordinates?.length || 0} points)`
            : 'Map the physical boundaries of your field for better visualization and area calculation.'}
        </p>
        <div className="flex gap-3">
          <button
            onClick={handleOpenMapBoundary}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-all"
          >
            {field.boundary ? '✏️ Edit Boundary' : '🗺️ Map Field Area'}
          </button>
          {field.boundary && (
            <button
              onClick={handleRemoveBoundary}
              disabled={isSavingBoundary}
              className="px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition-all disabled:bg-gray-400"
            >
              Remove Boundary
            </button>
          )}
        </div>
      </div>

      <div className="bg-red-50 border border-red-200 rounded-xl p-4 sm:p-6">
        <h3 className="text-lg font-semibold text-red-900 mb-2">
          🗑️ Delete Field
        </h3>
        <p className="text-sm text-red-700 mb-4">
          Permanently delete this field and all associated data including paddies, logs, and task records. This action cannot be undone.
        </p>
        <button
          onClick={handleDeleteField}
          disabled={isDeleting}
          className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-all disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {isDeleting ? 'Deleting...' : '🗑️ Delete Field'}
        </button>
      </div>

      {/* Map Boundary Full Page */}
      {showMapBoundaryModal && (
        <div className="fixed inset-0 bg-white z-50 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Boundary Map</h2>
              <p className="text-sm text-gray-600 mt-1">
                Tap the map to add points (min 3).
              </p>
            </div>
            <button
              onClick={() => setShowMapBoundaryModal(false)}
              disabled={isSavingBoundary}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          {/* Map Area */}
          <div 
            ref={mapContainerRef}
            onClick={handleMapClick}
            className="flex-1 relative overflow-hidden cursor-crosshair bg-gray-100"
            style={{
              backgroundImage: `url('https://maps.googleapis.com/maps/api/staticmap?center=${mapCenter.lat},${mapCenter.lng}&zoom=18&size=1200x800&style=feature:all|element:labels|visibility:off&maptype=roadmap&key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}')`,
              backgroundSize: 'cover',
              backgroundPosition: 'center'
            }}
          >
            {/* Points overlay */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none">
              {/* Draw polyline connecting points */}
              {polygonCoords.length > 1 && (
                <polyline
                  points={polygonCoords.map((coord, idx) => {
                    // Approximate conversion of lat/lng to pixel coordinates
                    const x = (coord.lng - mapCenter.lng) * 100 + 50;
                    const y = (coord.lat - mapCenter.lat) * -100 + 50;
                    return `${x}%, ${y}%`;
                  }).join(' ')}
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="2"
                  strokeDasharray="5,5"
                  opacity="0.7"
                />
              )}
              
              {/* Draw point markers */}
              {polygonCoords.map((coord, idx) => {
                const x = (coord.lng - mapCenter.lng) * 100 + 50;
                const y = (coord.lat - mapCenter.lat) * -100 + 50;
                return (
                  <g key={idx}>
                    <circle
                      cx={`${x}%`}
                      cy={`${y}%`}
                      r="8"
                      fill="#3b82f6"
                      stroke="#1e40af"
                      strokeWidth="2"
                      opacity="0.8"
                    />
                    <text
                      x={`${x}%`}
                      y={`${y}%`}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="white"
                      fontSize="10"
                      fontWeight="bold"
                      pointerEvents="none"
                    >
                      {idx + 1}
                    </text>
                  </g>
                );
              })}
            </svg>
            
            {/* Controls Overlay */}
            <div className="absolute top-6 left-6 bg-white rounded-lg shadow-lg p-3 sm:p-4 max-w-[90%] sm:max-w-md">
              <div className="mb-4">
                <p className="text-sm font-medium text-gray-900">
                  Points: {polygonCoords.length}
                </p>
                {polygonCoords.length >= 3 && (
                  <p className="text-xs text-gray-600">
                    Area ~{(calculatePolygonArea(polygonCoords) / 10000).toFixed(2)} ha
                  </p>
                )}
              </div>
              
              {/* Coordinate Input Toggle + Form */}
              <div className="space-y-3 mb-4 pb-4 border-b border-gray-200">
                <button
                  onClick={() => setShowCoordsForm((v) => !v)}
                  className="w-full px-3 py-2 border border-gray-300 text-gray-700 text-sm rounded-lg font-medium hover:bg-gray-50"
                >
                  {showCoordsForm ? 'Hide Coordinates' : 'Add Coordinates'}
                </button>
                {showCoordsForm && (
                  <>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        placeholder="Latitude"
                        value={inputLat}
                        onChange={(e) => setInputLat(e.target.value)}
                        step="0.0001"
                        className="flex-1 px-2 py-2 text-sm border border-gray-300 rounded bg-white text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      <input
                        type="number"
                        placeholder="Longitude"
                        value={inputLng}
                        onChange={(e) => setInputLng(e.target.value)}
                        step="0.0001"
                        className="flex-1 px-2 py-2 text-sm border border-gray-300 rounded bg-white text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <button
                      onClick={handleAddCoordinateFromInput}
                      disabled={!inputLat || !inputLng}
                      className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg font-medium transition-all disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                      ➕ Add Point
                    </button>
                  </>
                )}
              </div>
              
              <div className="flex flex-wrap gap-2">
                {polygonCoords.length > 0 && (
                  <>
                    <button
                      onClick={handleRemoveLastPoint}
                      disabled={isSavingBoundary}
                      className="px-3 py-2 text-sm bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium transition-all disabled:bg-gray-400"
                    >
                      ↶ Undo Last
                    </button>
                    <button
                      onClick={handleClearPolygon}
                      disabled={isSavingBoundary}
                      className="px-3 py-2 text-sm bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition-all disabled:bg-gray-400"
                    >
                      Clear All
                    </button>
                  </>
                )}
              </div>

            </div>

            {/* Info Note */}
            <div className="absolute bottom-6 left-6 right-6 bg-yellow-50 border border-yellow-200 rounded-lg p-3 sm:p-4 max-w-sm">
              <p className="text-sm text-yellow-800">
                <strong>Tip:</strong> For precision, add coordinates or use GPS.
              </p>
            </div>
          </div>
          
          {/* Footer with Coordinates and Actions */}
          <div className="px-6 py-4 border-t border-gray-200 bg-white space-y-4">
            {polygonCoords.length > 0 && (
              <div className="max-h-40 overflow-y-auto">
                <p className="font-semibold text-gray-900 mb-2">Points ({polygonCoords.length}):</p>
                <div className="space-y-2">
                  {polygonCoords.map((coord, i) => (
                    <div key={i} className="flex items-center justify-between bg-gray-50 p-3 rounded border border-gray-200">
                      <div className="flex-1">
                        <div className="text-sm font-semibold text-gray-900">Point {i + 1}</div>
                        <div className="text-xs text-gray-600">
                          <span className="font-mono">{coord.lat.toFixed(6)}</span>
                          <span className="mx-2">•</span>
                          <span className="font-mono">{coord.lng.toFixed(6)}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemovePoint(i)}
                        disabled={isSavingBoundary}
                        className="ml-2 px-2 py-1 text-xs bg-red-100 hover:bg-red-200 text-red-700 rounded transition-colors disabled:bg-gray-300 disabled:text-gray-500"
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
                onClick={() => setShowMapBoundaryModal(false)}
                disabled={isSavingBoundary}
                className="flex-1 px-4 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-semibold transition-colors disabled:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveBoundary}
                disabled={isSavingBoundary || polygonCoords.length < 3}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 font-bold shadow-lg transition-all disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {isSavingBoundary ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
