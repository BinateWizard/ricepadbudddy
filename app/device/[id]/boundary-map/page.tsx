'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc, collection, getDocs } from 'firebase/firestore';
import { BoundaryMappingModal } from '../components/BoundaryMappingModal';

export default function BoundaryMapPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const deviceId = params.id as string;

  const [polygonCoords, setPolygonCoords] = useState<{ lat: number; lng: number }[]>([]);
  const [mapCenter, setMapCenter] = useState({ lat: 14.5995, lng: 120.9842 });
  const [isSavingBoundary, setIsSavingBoundary] = useState(false);
  const [pointAddedNotification, setPointAddedNotification] = useState(false);
  const [hasSavedBoundary, setHasSavedBoundary] = useState(false);
  const [fieldBoundary, setFieldBoundary] = useState<{ lat: number; lng: number }[] | null>(null);
  const [fieldInfo, setFieldInfo] = useState<any>(null);
  const [paddyInfo, setPaddyInfo] = useState<any>(null);

  // Find which paddy this device belongs to, and load field boundary
  useEffect(() => {
    const loadFieldInfo = async () => {
      if (!user) return;
      
      try {
        // Find which field/paddy this device belongs to
        const fieldsRef = collection(db, `users/${user.uid}/fields`);
        const fieldsSnapshot = await getDocs(fieldsRef);
        
        for (const fieldDoc of fieldsSnapshot.docs) {
          const paddiesRef = collection(db, `users/${user.uid}/fields/${fieldDoc.id}/paddies`);
          const paddiesSnapshot = await getDocs(paddiesRef);
          
          for (const paddyDoc of paddiesSnapshot.docs) {
            const paddyData = paddyDoc.data();
            if (paddyData.deviceId === deviceId) {
              // Found the paddy!
              const field = { id: fieldDoc.id, ...fieldDoc.data() };
              const paddy = { id: paddyDoc.id, ...paddyData };
              
              setFieldInfo(field);
              setPaddyInfo(paddy);
              
              // Load field boundary
              const fieldRef = doc(db, `users/${user.uid}/fields/${fieldDoc.id}`);
              const fieldSnap = await getDoc(fieldRef);
              if (fieldSnap.exists()) {
                const fieldData = fieldSnap.data();
                if (fieldData.boundary && fieldData.boundary.coordinates) {
                  setFieldBoundary(fieldData.boundary.coordinates);
                  // Center map on field boundary if device doesn't have one yet
                  if (fieldData.boundary.coordinates.length > 0 && polygonCoords.length === 0) {
                    setMapCenter(fieldData.boundary.coordinates[0]);
                  }
                }
              }
              return;
            }
          }
        }
      } catch (error) {
        console.error('Error loading field info:', error);
      }
    };
    
    loadFieldInfo();
  }, [user, deviceId, polygonCoords.length]);

  // Load existing boundary data
  useEffect(() => {
    const loadBoundaryData = async () => {
      try {
        const deviceRef = doc(db, 'devices', deviceId);
        const deviceSnap = await getDoc(deviceRef);
        
        if (deviceSnap.exists()) {
          const data = deviceSnap.data();
          
          if (data.boundaryCoordinates && Array.isArray(data.boundaryCoordinates)) {
            setPolygonCoords(data.boundaryCoordinates);
            setHasSavedBoundary(true);
            
            if (data.boundaryCoordinates.length > 0) {
              const firstPoint = data.boundaryCoordinates[0];
              setMapCenter(firstPoint);
            }
          }
        }
      } catch (error) {
        console.error('Error loading boundary data:', error);
      }
    };

    loadBoundaryData();
  }, [deviceId]);

  const handleAddPoint = (lat: number, lng: number) => {
    setPolygonCoords(prev => [...prev, { lat, lng }]);
    setPointAddedNotification(true);
    setTimeout(() => setPointAddedNotification(false), 2000);
  };

  const handleRemovePoint = (index: number) => {
    setPolygonCoords(prev => prev.filter((_, i) => i !== index));
  };

  const handleRemoveLastPoint = () => {
    setPolygonCoords(prev => prev.slice(0, -1));
  };

  const handleClearPolygon = () => {
    if (confirm('Are you sure you want to clear all boundary points?')) {
      setPolygonCoords([]);
    }
  };

  const handleSaveBoundary = async () => {
    if (polygonCoords.length < 3) {
      alert('You need at least 3 points to create a boundary.');
      return;
    }

    setIsSavingBoundary(true);
    try {
      const deviceRef = doc(db, 'devices', deviceId);
      await updateDoc(deviceRef, {
        boundaryCoordinates: polygonCoords,
        boundaryArea: calculatePolygonArea(polygonCoords),
        lastBoundaryUpdate: new Date().toISOString()
      });
      
      setHasSavedBoundary(true);
      alert('Boundary saved successfully!');
    } catch (error) {
      console.error('Error saving boundary:', error);
      alert('Failed to save boundary. Please try again.');
    } finally {
      setIsSavingBoundary(false);
    }
  };

  const calculatePolygonArea = (coords: { lat: number; lng: number }[]): number => {
    if (coords.length < 3) return 0;
    
    let area = 0;
    const numPoints = coords.length;
    
    for (let i = 0; i < numPoints; i++) {
      const j = (i + 1) % numPoints;
      const xi = coords[i].lng * Math.PI / 180;
      const yi = coords[i].lat * Math.PI / 180;
      const xj = coords[j].lng * Math.PI / 180;
      const yj = coords[j].lat * Math.PI / 180;
      
      area += xi * yj - xj * yi;
    }
    
    area = Math.abs(area) / 2;
    const earthRadius = 6371000;
    area = area * earthRadius * earthRadius;
    
    return area;
  };

  return (
    <BoundaryMappingModal
      show={true}
      polygonCoords={polygonCoords}
      mapCenter={mapCenter}
      isSavingBoundary={isSavingBoundary}
      pointAddedNotification={pointAddedNotification}
      hasSavedBoundary={hasSavedBoundary}
      onClose={() => router.back()}
      onAddPoint={handleAddPoint}
      onRemovePoint={handleRemovePoint}
      onRemoveLastPoint={handleRemoveLastPoint}
      onClearPolygon={handleClearPolygon}
      onSaveBoundary={handleSaveBoundary}
      calculatePolygonArea={calculatePolygonArea}
      referencePolygon={fieldBoundary}
    />
  );
}
