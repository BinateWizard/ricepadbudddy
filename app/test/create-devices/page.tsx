'use client';

import { useState } from 'react';
import { db } from '@/lib/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

export default function CreateTestDevices() {
  const [status, setStatus] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const createDevices = async () => {
    setLoading(true);
    setStatus('Creating test devices...');

    try {
      // Create DEVICE_0001
      await setDoc(doc(db, 'devices', 'DEVICE_0001'), {
        deviceId: 'DEVICE_0001',
        name: 'Test Device 1',
        status: 'available',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setStatus(prev => prev + '\n✅ Created DEVICE_0001');

      // Create DEVICE_0002
      await setDoc(doc(db, 'devices', 'DEVICE_0002'), {
        deviceId: 'DEVICE_0002',
        name: 'Test Device 2',
        status: 'available',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setStatus(prev => prev + '\n✅ Created DEVICE_0002');

      // Create DEVICE_0003
      await setDoc(doc(db, 'devices', 'DEVICE_0003'), {
        deviceId: 'DEVICE_0003',
        name: 'Test Device 3',
        status: 'available',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setStatus(prev => prev + '\n✅ Created DEVICE_0003');

      setStatus(prev => prev + '\n\n✨ All test devices created successfully!\n\nYou can now use these device IDs:\n  - DEVICE_0001\n  - DEVICE_0002\n  - DEVICE_0003');
    } catch (error: any) {
      setStatus(prev => prev + `\n\n❌ Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-lg p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Create Test Devices</h1>
        <p className="text-gray-600 mb-6">
          This will create test devices in Firestore for development purposes.
        </p>

        <button
          onClick={createDevices}
          disabled={loading}
          className="w-full bg-green-600 text-white py-3 rounded-lg font-medium hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {loading ? 'Creating...' : 'Create Test Devices'}
        </button>

        {status && (
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <pre className="text-sm text-gray-800 whitespace-pre-wrap font-mono">
              {status}
            </pre>
          </div>
        )}

        <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-800">
            <strong>Note:</strong> After creating the devices, you should remove the device creation permission from your Firestore rules for security.
          </p>
        </div>
      </div>
    </div>
  );
}
