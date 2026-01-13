"use client";

import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/context/AuthContext";
import { useEffect, useRef, useState } from "react";
import 'leaflet/dist/leaflet.css';
import * as L from 'leaflet';
import { useCallback } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';

export default function FarmPage() {
  const { user } = useAuth();
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any | null>(null);
  const [fields, setFields] = useState<any[]>([]);
  const [footerOpen, setFooterOpen] = useState(false);

  // For mobile drag up/down
  const startY = useRef<number | null>(null);
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY;
  }, []);
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (startY.current !== null) {
      const deltaY = e.touches[0].clientY - startY.current;
      if (deltaY < -30) setFooterOpen(true);
      if (deltaY > 30) setFooterOpen(false);
    }
  }, []);
  const handleTouchEnd = useCallback(() => {
    startY.current = null;
  }, []);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try {
        const fieldsRef = collection(db, 'users', user.uid, 'fields');
        const q = query(fieldsRef, orderBy('createdAt', 'desc'));
        const snap = await getDocs(q);
        const data = await Promise.all(snap.docs.map(async d => {
          const fd = { id: d.id, ...d.data() } as any;
          // load paddies
          try {
            const paddiesRef = collection(db, 'users', user.uid, 'fields', d.id, 'paddies');
            const paddiesSnap = await getDocs(paddiesRef);
            fd.paddies = paddiesSnap.docs.map(p => ({ id: p.id, ...p.data() }));
          } catch (e) { fd.paddies = []; }
          return fd;
        }));
        setFields(data);
      } catch (e) {
        console.error('Error loading fields for farm map', e);
      }
    };
    load();
  }, [user]);

  useEffect(() => {
    if (!mapDivRef.current) return;

    if (!mapRef.current) {
      mapRef.current = L.map(mapDivRef.current, { zoomControl: true, maxZoom: 18 });
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const { latitude, longitude } = pos.coords;
            mapRef.current.setView([latitude, longitude], 12);
            L.circle([latitude, longitude], {
              color: '#2563eb',
              fillColor: '#3b82f6',
              fillOpacity: 0.5,
              radius: 10,
            }).addTo(mapRef.current).bindTooltip('You are here');
          },
          () => {
            mapRef.current.setView([14.5995, 120.9842], 12); // fallback to Manila
          }
        );
      } else {
        mapRef.current.setView([14.5995, 120.9842], 12); // fallback to Manila
      }
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: '&copy; Esri', maxZoom: 22 }).addTo(mapRef.current);
      try {
        mapRef.current.createPane('labels');
        const labelsPane = mapRef.current.getPane('labels');
        if (labelsPane) { labelsPane.style.zIndex = '650'; labelsPane.style.pointerEvents = 'none'; }
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { pane: 'labels', attribution: '&copy; Esri', maxZoom: 22 }).addTo(mapRef.current);
      } catch (e) { }
    }

    const map = mapRef.current;
    const overlay = L.layerGroup().addTo(map);
    const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#ef4444', '#7c3aed', '#059669', '#f97316', '#0ea5a4'];
    const FIELD_COLOR = '#ef4444';

    let deviceIdx = 0;
    fields.forEach((f: any) => {
      if (f.boundary && Array.isArray(f.boundary.coordinates) && f.boundary.coordinates.length >= 3) {
        L.polygon(f.boundary.coordinates.map((c: { lat: number; lng: number }) => [c.lat, c.lng]), { color: FIELD_COLOR, fillColor: FIELD_COLOR, fillOpacity: 0.12, weight: 2 }).bindTooltip(f.fieldName || 'Field').addTo(overlay);
      }
      if (Array.isArray(f.paddies)) {
        for (const p of f.paddies) {
          if (p.boundary && Array.isArray(p.boundary.coordinates) && p.boundary.coordinates.length >= 3) {
            const color = COLORS[deviceIdx % COLORS.length];
            L.polygon(p.boundary.coordinates.map((c: { lat: number; lng: number }) => [c.lat, c.lng]), { color, fillColor: color, fillOpacity: 0.08, weight: 1, dashArray: '4,6' }).bindTooltip(p.paddyName || `Device ${deviceIdx+1}`).addTo(overlay);
            deviceIdx++;
          }
        }
      }
    });

    // Safely get bounds if possible
    if ((overlay as any).getLayers().length > 0 && typeof (overlay as any).getBounds === 'function') {
      const b = (overlay as any).getBounds();
      if (b && b.isValid && b.isValid()) map.fitBounds(b.pad(0.2));
    }

    return () => { overlay.clearLayers(); };
  }, [fields]);

  return (
    <ProtectedRoute>
      {/* Header */}
      <header className="fixed top-0 left-0 w-full h-14 bg-white border-b border-gray-200 shadow z-50 flex items-center px-4">
        <button
          className="mr-3 p-2 rounded-full hover:bg-gray-100 focus:outline-none"
          onClick={() => window.history.back()}
          aria-label="Back"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6 text-gray-700">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        <span className="text-lg font-semibold text-gray-800">Farm Map</span>
      </header>

      {/* Main Map Area */}
      <div className="pt-14 bg-gray-50 min-h-screen flex flex-col">
        <div ref={mapDivRef} className="flex-1 w-full h-[70vh] rounded-none" />
      </div>

      {/* Bottom Sheet Footer for mobile */}
      <div
        className={`fixed left-0 bottom-0 w-full z-50 transition-all duration-300 ${footerOpen ? 'h-2/3' : 'h-14'} bg-white shadow-2xl rounded-t-xl flex flex-col`}
        style={{ touchAction: 'none' }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Drag/Click Bar or Small Footer */}
        <div
          className={`w-full flex items-center justify-center cursor-pointer py-2 ${footerOpen ? '' : 'h-full'}`}
          onClick={() => setFooterOpen((v) => !v)}
        >
          <div className="w-10 h-1.5 bg-gray-300 rounded-full mr-2" />
          {!footerOpen && (
            <span className="flex items-center gap-2 text-blue-700 font-medium text-sm">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z" />
              </svg>
              <span>Show Fields</span>
            </span>
          )}
        </div>
        {/* Field List */}
        <div className={`overflow-y-auto px-2 pt-2 pb-4 flex-1 ${footerOpen ? '' : 'hidden'}`} style={{ minHeight: '0' }}>
          <div className="flex flex-wrap gap-2 justify-center">
            {fields.length === 0 ? (
              <span className="p-4 text-gray-400 text-sm">No fields found</span>
            ) : (
              fields.map((field) => (
                <button
                  key={field.id}
                  className="flex flex-col items-center justify-center min-w-[110px] px-3 py-2 text-center bg-white border border-blue-100 rounded-lg shadow-sm hover:bg-blue-50 hover:border-blue-400 focus:bg-blue-100 focus:border-blue-500 focus:outline-none transition text-sm font-semibold text-blue-700 active:bg-blue-200"
                  onClick={() => {
                    setFooterOpen(false);
                    if (field.boundary && Array.isArray(field.boundary.coordinates) && field.boundary.coordinates.length >= 1 && mapRef.current) {
                      const bounds = L.latLngBounds(field.boundary.coordinates.map((c: { lat: number; lng: number }) => [c.lat, c.lng]));
                      mapRef.current.fitBounds(bounds.pad(0.1));
                      mapRef.current.panTo(bounds.getCenter());
                    }
                  }}
                >
                  <span className="mb-1">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z" />
                    </svg>
                  </span>
                  <span>{field.fieldName || 'Field'}</span>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
