'use client';

import { useState } from 'react';
import { database } from '@/lib/firebase';
import { ref, set, serverTimestamp } from 'firebase/database';

export default function CreateRTDBDevices() {
  const [status, setStatus] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const createDevices = async () => {
    setLoading(true);
    setStatus('Creating devices in Realtime Database...');

    try {
      // Create DEVICE_0001 in RTDB
      await set(ref(database, 'devices/DEVICE_0001'), {
        deviceId: 'DEVICE_0001',
        name: 'Test Device 1',
        status: 'available',
        sensorData: {
          temperature: 0,
          humidity: 0,
          soilMoisture: 0,
          lastUpdate: null
        }
      });
      setStatus(prev => prev + '\n✅ Created DEVICE_0001 in RTDB');

      // Create DEVICE_0002 in RTDB
      await set(ref(database, 'devices/DEVICE_0002'), {
        deviceId: 'DEVICE_0002',
        name: 'Test Device 2',
        status: 'available',
        sensorData: {
          temperature: 0,
          humidity: 0,
          soilMoisture: 0,
          lastUpdate: null
        }
      });
      setStatus(prev => prev + '\n✅ Created DEVICE_0002 in RTDB');

      // Create DEVICE_0003 in RTDB
      await set(ref(database, 'devices/DEVICE_0003'), {
        deviceId: 'DEVICE_0003',
        name: 'Test Device 3',
        status: 'available',
        sensorData: {
          temperature: 0,
          humidity: 0,
          soilMoisture: 0,
          lastUpdate: null
        }
      });
      setStatus(prev => prev + '\n✅ Created DEVICE_0003 in RTDB');

      setStatus(prev => prev + '\n\n✨ All devices created in Realtime Database!\n\nDevices are now at:\n  - rtdb/devices/DEVICE_0001\n  - rtdb/devices/DEVICE_0002\n  - rtdb/devices/DEVICE_0003\n\nYour ESP32 can write sensor data to these paths.');
    } catch (error: any) {
      setStatus(prev => prev + `\n\n❌ Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-lg p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Create RTDB Devices</h1>
        <p className="text-gray-600 mb-6">
          This will create test devices in Firebase Realtime Database for ESP32 sensor data.
        </p>

        <button
          onClick={createDevices}
          disabled={loading}
          className="w-full bg-green-600 text-white py-3 rounded-lg font-medium hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {loading ? 'Creating...' : 'Create RTDB Devices'}
        </button>

        {status && (
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <pre className="text-sm text-gray-800 whitespace-pre-wrap font-mono">
              {status}
            </pre>
          </div>
        )}

        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-800">
            <strong>Note:</strong> Realtime Database is where your ESP32 will write live sensor data. Firestore is for user/field/paddy metadata.
          </p>
        </div>
      </div>
    </div>
  );
}
