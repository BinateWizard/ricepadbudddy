'use client';

import { useState } from 'react';
import { database } from '@/lib/firebase';
import { ref, set } from 'firebase/database';

export default function CreateRTDBDevices() {
  const [status, setStatus] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const createDevices = async () => {
    setLoading(true);
    setStatus('Creating devices in Realtime Database...');

    try {
      // Create DEVICE_0001 in RTDB (using correct structure that Cloud Functions expect)
      await set(ref(database, 'devices/DEVICE_0001'), {
        deviceId: 'DEVICE_0001',
        name: 'Test Device 1',
        status: 'online',
        heartbeat: Date.now(),
        sensors: {  // Changed from 'sensorData' to 'sensors'
          nitrogen: 45.2,
          phosphorus: 12.8,
          potassium: 38.5,
          temperature: 28.5,
          humidity: 75.0,
          lastUpdate: Date.now()
        }
      });
      setStatus(prev => prev + '\n✅ Created DEVICE_0001 in RTDB');

      // Create DEVICE_0002 in RTDB
      await set(ref(database, 'devices/DEVICE_0002'), {
        deviceId: 'DEVICE_0002',
        name: 'Test Device 2',
        status: 'online',
        heartbeat: Date.now(),
        sensors: {  // Changed from 'sensorData' to 'sensors'
          nitrogen: 52.1,
          phosphorus: 15.3,
          potassium: 42.7,
          temperature: 29.0,
          humidity: 72.5,
          lastUpdate: Date.now()
        }
      });
      setStatus(prev => prev + '\n✅ Created DEVICE_0002 in RTDB');

      // Create DEVICE_0003 in RTDB (FIXED - same structure as others)
      await set(ref(database, 'devices/DEVICE_0003'), {
        deviceId: 'DEVICE_0003',
        name: 'Test Device 3',
        status: 'online',
        heartbeat: Date.now(),
        sensors: {  // Changed from 'sensorData' to 'sensors'
          nitrogen: 38.9,
          phosphorus: 11.2,
          potassium: 35.4,
          temperature: 27.8,
          humidity: 78.2,
          lastUpdate: Date.now()
        }
      });
      setStatus(prev => prev + '\n✅ Created DEVICE_0003 in RTDB (FIXED!)');

      setStatus(prev => prev + '\n\n✨ All devices created in Realtime Database!\n\nDevices structure:\n  - rtdb/devices/DEVICE_0001/sensors\n  - rtdb/devices/DEVICE_0002/sensors\n  - rtdb/devices/DEVICE_0003/sensors\n\nCloud Functions will now read these correctly.\n\n⚠️ NOTE: See NEW_RTDB_STRUCTURE.md for the recommended\nowners/fields/devices hierarchy with command support.');
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
