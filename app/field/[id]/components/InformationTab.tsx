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
import { BoundaryMappingModal } from './BoundaryMappingModal';

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
  const [deviceBoundaries, setDeviceBoundaries] = useState<{ lat: number; lng: number }[] | null>(null);
  
  if (!field) return null;

  const variety = getVarietyByName(field.riceVariety);
  const daysSincePlanting = getDaysSincePlanting(field.startDay);
  const expectedHarvest = variety ? getExpectedHarvestDate(field.startDay, variety) : null;
  const isCompleted = daysSincePlanting >= (variety?.maturityDays?.max || 130);
  const fieldStatus = field.status || 'active';

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
    
    setShowMapBoundaryModal(true);
    
    // Load device boundaries from paddies in this field (async, non-blocking)
    const loadDeviceBoundaries = async () => {
      if (user && field.id) {
        try {
          const paddiesRef = collection(db, `users/${user.uid}/fields/${field.id}/paddies`);
          const paddiesSnapshot = await getDocs(paddiesRef);
          
          // Collect all device boundaries
          const allDeviceBoundaries: { lat: number; lng: number }[] = [];
          for (const paddyDoc of paddiesSnapshot.docs) {
            const paddyData = paddyDoc.data();
            if (paddyData.boundary && paddyData.boundary.coordinates && Array.isArray(paddyData.boundary.coordinates)) {
              allDeviceBoundaries.push(...paddyData.boundary.coordinates);
            }
          }
          
          // If we have device boundaries, use the first one as reference
          if (allDeviceBoundaries.length >= 3) {
            setDeviceBoundaries(allDeviceBoundaries);
          } else {
            setDeviceBoundaries(null);
          }
        } catch (error) {
          console.error('Error loading device boundaries:', error);
          setDeviceBoundaries(null);
        }
      }
    };
    
    loadDeviceBoundaries();
    
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
  };

  const handleAddPoint = (lat: number, lng: number) => {
    setPolygonCoords(prev => [...prev, { lat, lng }]);
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

      {/* Boundary Mapping Modal */}
      <BoundaryMappingModal
        show={showMapBoundaryModal}
        polygonCoords={polygonCoords}
        mapCenter={mapCenter}
        isSavingBoundary={isSavingBoundary}
        hasSavedBoundary={!!field.boundary}
        onClose={() => setShowMapBoundaryModal(false)}
        onAddPoint={handleAddPoint}
        onRemovePoint={handleRemovePoint}
        onRemoveLastPoint={handleRemoveLastPoint}
        onClearPolygon={handleClearPolygon}
        onSaveBoundary={handleSaveBoundary}
        calculatePolygonArea={calculatePolygonArea}
        referencePolygon={deviceBoundaries}
      />
    </div>
  );
}
