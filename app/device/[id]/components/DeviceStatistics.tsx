"use client";
import React, { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { getVarietyByName } from '@/lib/utils/varietyHelpers';
import type { RiceVariety } from '@/lib/data/types';

interface DeviceStatisticsProps {
  userId: string;
  fieldId: string;
  paddyId: string;
  deviceId: string;
  currentNPK?: { n?: number; p?: number; k?: number; timestamp?: number };
}

export function DeviceStatistics({ 
  userId, 
  fieldId, 
  paddyId, 
  deviceId,
  currentNPK 
}: DeviceStatisticsProps) {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [variety, setVariety] = useState<RiceVariety | null>(null);
  const [areaHa, setAreaHa] = useState<number | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const { getDeviceNPKStatistics } = await import('@/lib/utils/statistics');
        const statistics = await getDeviceNPKStatistics(userId, fieldId, paddyId, deviceId, 30);
        setStats(statistics);
      } catch (error) {
        console.error('Error fetching statistics:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [userId, fieldId, paddyId, deviceId]);

  useEffect(() => {
    const fetchMeta = async () => {
      try {
        // Fetch field to get variety name
        const fieldRef = doc(db, 'users', userId, 'fields', fieldId);
        const fieldSnap = await getDoc(fieldRef);
        let varietyName: string | undefined;

        if (fieldSnap.exists()) {
          const data = fieldSnap.data() as any;
          varietyName = data.riceVariety || data.varietyName;
        }

        // Fetch paddy to get area (from dimensions or boundary)
        const paddyRef = doc(db, `users/${userId}/fields/${fieldId}/paddies/${paddyId}`);
        const paddySnap = await getDoc(paddyRef);

        if (paddySnap.exists()) {
          const paddyData = paddySnap.data() as any;
          let detectedAreaHa: number | null = null;

          if (typeof paddyData?.boundary?.area === 'number') {
            detectedAreaHa = paddyData.boundary.area / 10000;
          } else if (typeof paddyData?.areaHectares === 'number') {
            detectedAreaHa = paddyData.areaHectares;
          } else if (typeof paddyData?.areaM2 === 'number') {
            detectedAreaHa = paddyData.areaM2 / 10000;
          }

          setAreaHa(detectedAreaHa);
        } else {
          setAreaHa(null);
        }

        if (varietyName) {
          const found = getVarietyByName(varietyName);
          if (found) {
            setVariety(found);
          } else {
            setVariety(null);
          }
        } else {
          setVariety(null);
        }
      } catch (error) {
        console.error('Error fetching variety/area metadata:', error);
        setVariety(null);
        setAreaHa(null);
      }
    };

    fetchMeta();
  }, [userId, fieldId, paddyId]);

  const hasAreaAndVariety = !!(variety && areaHa && areaHa > 0);
  let perPaddyNPK: { n: string; p: string; k: string } | null = null;

  if (hasAreaAndVariety && variety) {
    const { N, P2O5, K2O } = variety.npkPerHa;
    const area = areaHa as number;

    perPaddyNPK = {
      n: `${(((N.min + N.max) / 2) * area).toFixed(1)} kg N`,
      p: `${(((P2O5.min + P2O5.max) / 2) * area).toFixed(1)} kg P₂O₅`,
      k: `${(((K2O.min + K2O.max) / 2) * area).toFixed(1)} kg K₂O`
    };
  }

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">NPK Statistics (30 Days)</h3>
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
        </div>
      </div>
    );
  }

  if (!stats) return null;

   const getStatus = (
    current: number | undefined,
    nutrientStats: { average: number | null; min: number; max: number }
  ) => {
    if (current === undefined || current === null || nutrientStats.average === null) {
      return { label: 'No recent data', color: 'text-gray-500', bg: 'bg-gray-100' };
    }

    const avg = nutrientStats.average;
    const lowThreshold = avg * 0.8;
    const highThreshold = avg * 1.2;

    if (current < lowThreshold) {
      return { label: 'Below typical level', color: 'text-red-700', bg: 'bg-red-50' };
    }
    if (current > highThreshold) {
      return { label: 'Above typical level', color: 'text-amber-700', bg: 'bg-amber-50' };
    }
    return { label: 'Within typical range', color: 'text-green-700', bg: 'bg-green-50' };
  };

  const nStatus = getStatus(currentNPK?.n, stats.nitrogen);
  const pStatus = getStatus(currentNPK?.p, stats.phosphorus);
  const kStatus = getStatus(currentNPK?.k, stats.potassium);

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
      {/* NPK Goal / Requirement summary */}
      {perPaddyNPK && (
        <div className="mb-5 p-4 rounded-xl bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-200">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-emerald-900">NPK Goal for This Paddy</h3>
            {areaHa && variety && (
              <span className="text-[11px] font-medium text-emerald-800 bg-white/70 px-2 py-0.5 rounded-full">
                ~{areaHa.toFixed(3)} ha · {variety.name}
              </span>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs sm:text-sm">
            <div className="rounded-lg bg-white/80 px-2 py-1.5 border border-emerald-100">
              <p className="font-semibold text-emerald-900">N</p>
              <p className="text-emerald-800">{perPaddyNPK.n}</p>
            </div>
            <div className="rounded-lg bg-white/80 px-2 py-1.5 border border-emerald-100">
              <p className="font-semibold text-emerald-900">P₂O₅</p>
              <p className="text-emerald-800">{perPaddyNPK.p}</p>
            </div>
            <div className="rounded-lg bg-white/80 px-2 py-1.5 border border-emerald-100">
              <p className="font-semibold text-emerald-900">K₂O</p>
              <p className="text-emerald-800">{perPaddyNPK.k}</p>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-emerald-800">
            Target fertilizer amounts for the whole paddy, scaled from variety recommendations per hectare.
          </p>
        </div>
      )}

      <h3 className="text-lg font-semibold text-gray-900 mb-4">NPK Statistics (30 Days)</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Nitrogen Stats */}
        <div className="bg-blue-50 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-blue-900">Nitrogen (N)</h4>
            <span className="text-2xl">🧪</span>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-blue-700">Current:</span>
              <span className="font-bold text-blue-900">
                {currentNPK?.n ?? '--'} mg/kg
              </span>
            </div>
            {stats.nitrogen.average !== null && (
              <>
                <div className="flex justify-between">
                  <span className="text-sm text-blue-700">Average:</span>
                  <span className="font-bold text-blue-900">{stats.nitrogen.average.toFixed(1)} mg/kg</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-blue-700">Range:</span>
                  <span className="font-medium text-blue-800">
                    {stats.nitrogen.min.toFixed(1)} - {stats.nitrogen.max.toFixed(1)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-blue-700">Trend:</span>
                  <span className={`font-medium ${stats.nitrogen.trend > 0 ? 'text-green-600' : stats.nitrogen.trend < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                    {stats.nitrogen.trend > 0 ? '↑' : stats.nitrogen.trend < 0 ? '↓' : '→'} 
                    {stats.nitrogen.trend !== 0 ? ` ${Math.abs(stats.nitrogen.trend).toFixed(1)}%` : ' Stable'}
                  </span>
                </div>
                <div className={`mt-1 px-2 py-1 rounded-full text-xs inline-flex items-center ${nStatus.bg} ${nStatus.color}`}>
                  {nStatus.label}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Phosphorus Stats */}
        <div className="bg-purple-50 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-purple-900">Phosphorus (P)</h4>
            <span className="text-2xl">⚗️</span>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-purple-700">Current:</span>
              <span className="font-bold text-purple-900">
                {currentNPK?.p ?? '--'} mg/kg
              </span>
            </div>
            {stats.phosphorus.average !== null && (
              <>
                <div className="flex justify-between">
                  <span className="text-sm text-purple-700">Average:</span>
                  <span className="font-bold text-purple-900">{stats.phosphorus.average.toFixed(1)} mg/kg</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-purple-700">Range:</span>
                  <span className="font-medium text-purple-800">
                    {stats.phosphorus.min.toFixed(1)} - {stats.phosphorus.max.toFixed(1)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-purple-700">Trend:</span>
                  <span className={`font-medium ${stats.phosphorus.trend > 0 ? 'text-green-600' : stats.phosphorus.trend < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                    {stats.phosphorus.trend > 0 ? '↑' : stats.phosphorus.trend < 0 ? '↓' : '→'} 
                    {stats.phosphorus.trend !== 0 ? ` ${Math.abs(stats.phosphorus.trend).toFixed(1)}%` : ' Stable'}
                  </span>
                </div>
                <div className={`mt-1 px-2 py-1 rounded-full text-xs inline-flex items-center ${pStatus.bg} ${pStatus.color}`}>
                  {pStatus.label}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Potassium Stats */}
        <div className="bg-orange-50 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-orange-900">Potassium (K)</h4>
            <span className="text-2xl">🔬</span>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-orange-700">Current:</span>
              <span className="font-bold text-orange-900">
                {currentNPK?.k ?? '--'} mg/kg
              </span>
            </div>
            {stats.potassium.average !== null && (
              <>
                <div className="flex justify-between">
                  <span className="text-sm text-orange-700">Average:</span>
                  <span className="font-bold text-orange-900">{stats.potassium.average.toFixed(1)} mg/kg</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-orange-700">Range:</span>
                  <span className="font-medium text-orange-800">
                    {stats.potassium.min.toFixed(1)} - {stats.potassium.max.toFixed(1)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-orange-700">Trend:</span>
                  <span className={`font-medium ${stats.potassium.trend > 0 ? 'text-green-600' : stats.potassium.trend < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                    {stats.potassium.trend > 0 ? '↑' : stats.potassium.trend < 0 ? '↓' : '→'} 
                    {stats.potassium.trend !== 0 ? ` ${Math.abs(stats.potassium.trend).toFixed(1)}%` : ' Stable'}
                  </span>
                </div>
                <div className={`mt-1 px-2 py-1 rounded-full text-xs inline-flex items-center ${kStatus.bg} ${kStatus.color}`}>
                  {kStatus.label}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {!perPaddyNPK && (
        <div className="mt-4 pt-3 border-t border-gray-100">
          <h4 className="text-sm font-semibold text-gray-900 mb-1">NPK Goal for This Paddy</h4>
          <p className="text-sm text-gray-500">
            Add paddy area (via dimensions or boundary mapping) and select a rice variety to unlock
            per-paddy NPK fertilizer targets.
          </p>
        </div>
      )}
    </div>
  );
}
