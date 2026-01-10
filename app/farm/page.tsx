"use client";

import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/context/AuthContext";
import { useEffect, useRef, useState } from "react";
import 'leaflet/dist/leaflet.css';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';

export default function FarmPage() {
  const { user } = useAuth();
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any | null>(null);
  const [fields, setFields] = useState<any[]>([]);

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
    const L = require('leaflet');

    if (!mapRef.current) {
      mapRef.current = L.map(mapDivRef.current, { zoomControl: true }).setView([14.5995, 120.9842], 12);
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: '&copy; Esri', maxZoom: 18 }).addTo(mapRef.current);
      try {
        mapRef.current.createPane('labels');
        const labelsPane = mapRef.current.getPane('labels');
        if (labelsPane) { labelsPane.style.zIndex = '650'; labelsPane.style.pointerEvents = 'none'; }
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { pane: 'labels', attribution: '&copy; Esri', maxZoom: 18 }).addTo(mapRef.current);
      } catch (e) { }
    }

    const map = mapRef.current;
    const overlay = L.layerGroup().addTo(map);
    const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#ef4444', '#7c3aed', '#059669', '#f97316', '#0ea5a4'];
    const FIELD_COLOR = '#ef4444';

    let deviceIdx = 0;
    fields.forEach((f: any) => {
      if (f.boundary && Array.isArray(f.boundary.coordinates) && f.boundary.coordinates.length >= 3) {
        L.polygon(f.boundary.coordinates.map((c: any) => [c.lat, c.lng]), { color: FIELD_COLOR, fillColor: FIELD_COLOR, fillOpacity: 0.12, weight: 2 }).bindTooltip(f.fieldName || 'Field').addTo(overlay);
      }
      if (Array.isArray(f.paddies)) {
        for (const p of f.paddies) {
          if (p.boundary && Array.isArray(p.boundary.coordinates) && p.boundary.coordinates.length >= 3) {
            const color = COLORS[deviceIdx % COLORS.length];
            L.polygon(p.boundary.coordinates.map((c: any) => [c.lat, c.lng]), { color, fillColor: color, fillOpacity: 0.08, weight: 1, dashArray: '4,6' }).bindTooltip(p.paddyName || `Device ${deviceIdx+1}`).addTo(overlay);
            deviceIdx++;
          }
        }
      }
    });

    try { const b = overlay.getBounds(); if (b && b.isValid && b.isValid()) map.fitBounds(b.pad(0.2)); } catch (e) {}

    return () => overlay.clearLayers();
  }, [fields]);

  return (
    <ProtectedRoute>
      <div className="min-h-screen p-4 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-2xl font-bold mb-3">Your Farm Map</h1>
          <p className="text-sm text-gray-600 mb-4">All field and device boundaries</p>
          <div ref={mapDivRef} style={{ height: '78vh' }} className="w-full rounded-lg shadow-sm border" />
        </div>
      </div>
    </ProtectedRoute>
  );
}
