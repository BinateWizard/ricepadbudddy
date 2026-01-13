"use client";
import React, { useState } from 'react';
import { Scan } from 'lucide-react';
import { TrendsChart } from './TrendsChart';

interface DataTrendsProps {
  timeRange: '7d' | '30d' | '90d' | 'all';
  isLoadingLogs: boolean;
  historicalLogs: any[];
  realtimeLogs: any[];
  currentPage: number;
  itemsPerPage: number;
  onTimeRangeChange: (range: '7d' | '30d' | '90d' | 'all') => void;
  onPageChange: (page: number) => void;
  onScanDevice: () => Promise<void>;
}

export function DataTrends({
  timeRange,
  isLoadingLogs,
  historicalLogs,
  realtimeLogs,
  currentPage,
  itemsPerPage,
  onTimeRangeChange,
  onPageChange,
  onScanDevice
}: DataTrendsProps) {
  const [isScanning, setIsScanning] = useState(false);

  const handleScan = async () => {
    setIsScanning(true);
    try {
      await onScanDevice();
    } finally {
      setIsScanning(false);
    }
  };

  // Merge and dedupe logs
  const allLogs = [...historicalLogs, ...realtimeLogs];
  const seen = new Set<string>();
  const deduped = allLogs.filter(log => {
    const key = `${log.timestamp?.getTime?.()}-${log.nitrogen}-${log.phosphorus}-${log.potassium}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const sortedLogs = deduped.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  const chartLogs = sortedLogs.slice().reverse().slice(-10);

  // Pagination
  const totalPages = Math.ceil(sortedLogs.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedLogs = sortedLogs.slice(startIndex, endIndex);

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Data Trends</h3>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleScan}
            disabled={isScanning}
            className="px-3 py-1.5 text-xs sm:text-sm rounded-lg transition-colors bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-1.5 disabled:bg-gray-400"
            title="Scan device now"
          >
            {isScanning ? (
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              <Scan className="w-4 h-4" />
            )}
            {isScanning ? 'Scanning...' : 'Scan Now'}
          </button>
          <button
            onClick={() => onTimeRangeChange('7d')}
            className={`px-3 py-1.5 text-xs sm:text-sm rounded-lg transition-colors ${
              timeRange === '7d' 
                ? 'bg-green-600 text-white' 
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            7 Days
          </button>
          <button
            onClick={() => onTimeRangeChange('30d')}
            className={`px-3 py-1.5 text-xs sm:text-sm rounded-lg transition-colors ${
              timeRange === '30d' 
                ? 'bg-green-600 text-white' 
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            30 Days
          </button>
          <button
            onClick={() => onTimeRangeChange('90d')}
            className={`px-3 py-1.5 text-xs sm:text-sm rounded-lg transition-colors ${
              timeRange === '90d' 
                ? 'bg-green-600 text-white' 
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            90 Days
          </button>
          <button
            onClick={() => onTimeRangeChange('all')}
            className={`px-3 py-1.5 text-xs sm:text-sm rounded-lg transition-colors ${
              timeRange === 'all' 
                ? 'bg-green-600 text-white' 
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            All Time
          </button>
        </div>
      </div>
      <div>
        {isLoadingLogs ? (
          <div className="flex flex-col items-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mb-2"></div>
            <p className="text-gray-600">Loading data...</p>
          </div>
        ) : sortedLogs.length > 0 ? (
          <>
            {/* Chart */}
            <div className="mb-6">
              <h4 className="text-md font-semibold text-gray-900 mb-3">NPK Trends (Last 10 readings)</h4>
              <TrendsChart logs={chartLogs} />
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Timestamp</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">N (mg/kg)</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">P (mg/kg)</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">K (mg/kg)</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedLogs.map((log, index) => (
                    <tr key={log.id || index} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-4 text-sm text-gray-900">
                        {log.timestamp.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-sm font-medium text-blue-600">
                        {log.nitrogen ?? '--'}
                      </td>
                      <td className="py-3 px-4 text-sm font-medium text-purple-600">
                        {log.phosphorus ?? '--'}
                      </td>
                      <td className="py-3 px-4 text-sm font-medium text-orange-600">
                        {log.potassium ?? '--'}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`text-xs px-2 py-1 rounded ${
                          log._src === 'rtdb' 
                            ? 'bg-blue-100 text-blue-700' 
                            : 'bg-green-100 text-green-700'
                        }`}>
                          {log._src === 'rtdb' ? 'Live' : 'Logged'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-6 px-4">
                <p className="text-sm text-gray-600">
                  Page {currentPage} of {totalPages} ({sortedLogs.length} total readings)
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => onPageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => onPageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-12 bg-gray-50 rounded-lg">
            <p className="text-gray-600">No data available for the selected time range</p>
            <p className="text-sm text-gray-500 mt-2">Try scanning the device or selecting a different time range</p>
          </div>
        )}
      </div>
    </div>
  );
}
