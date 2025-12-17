'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';
import { 
  notifyDeviceOffline, 
  notifyDeviceOnline, 
  notifyTaskReminder, 
  notifyGrowthStageChange,
  notifyCriticalSensor,
  notifyHarvestReady,
  notifyGeneral
} from '@/lib/utils/notifications';
import { useState } from 'react';

export default function TestNotifications() {
  const { user } = useAuth();
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');

  const sendTestNotification = async (type: string) => {
    if (!user) return;
    
    setSending(true);
    setMessage('');
    
    try {
      switch (type) {
        case 'device_offline':
          await notifyDeviceOffline(
            user.uid,
            'DEVICE_0001',
            'North Paddy',
            'field123',
            'Main Field'
          );
          break;
        
        case 'device_online':
          await notifyDeviceOnline(
            user.uid,
            'DEVICE_0001',
            'North Paddy',
            'field123',
            'Main Field'
          );
          break;
        
        case 'task_reminder':
          await notifyTaskReminder(
            user.uid,
            'Apply Fertilizer (NPK 14-14-14)',
            'field123',
            'Main Field',
            45
          );
          break;
        
        case 'growth_stage':
          await notifyGrowthStageChange(
            user.uid,
            'Tillering',
            'field123',
            'Main Field',
            30
          );
          break;
        
        case 'critical_sensor':
          await notifyCriticalSensor(
            user.uid,
            'nitrogen',
            15.2,
            'mg/kg',
            true,
            'paddy123',
            'North Paddy',
            'field123',
            'Main Field'
          );
          break;
        
        case 'harvest_ready':
          await notifyHarvestReady(
            user.uid,
            'field123',
            'Main Field',
            5
          );
          break;
        
        case 'general':
          await notifyGeneral(
            user.uid,
            'Welcome to PadBuddy!',
            'Start managing your rice fields with smart monitoring and automated task scheduling.',
            '👋',
            undefined,
            undefined
          );
          break;
      }
      
      setMessage(`✅ ${type.replace('_', ' ')} notification sent!`);
    } catch (error) {
      console.error('Error sending notification:', error);
      setMessage(`❌ Failed to send notification: ${error}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-4xl mx-auto px-4">
          {/* Header */}
          <div className="mb-8">
            <button
              onClick={() => router.push('/')}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Home
            </button>
            <h1 className="text-3xl font-bold text-gray-900">Test Notifications</h1>
            <p className="text-gray-600 mt-2">
              Click any button below to send a test notification to yourself. Check the notification bell in the header.
            </p>
          </div>

          {/* Status Message */}
          {message && (
            <div className={`mb-6 p-4 rounded-lg ${
              message.startsWith('✅') ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
            }`}>
              {message}
            </div>
          )}

          {/* Notification Test Buttons */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Device Offline */}
            <button
              onClick={() => sendTestNotification('device_offline')}
              disabled={sending}
              className="bg-white p-6 rounded-xl shadow-md hover:shadow-lg transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="text-4xl mb-3">🔴</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">Device Offline</h3>
              <p className="text-sm text-gray-600">Notify when a sensor device goes offline</p>
            </button>

            {/* Device Online */}
            <button
              onClick={() => sendTestNotification('device_online')}
              disabled={sending}
              className="bg-white p-6 rounded-xl shadow-md hover:shadow-lg transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="text-4xl mb-3">🟢</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">Device Online</h3>
              <p className="text-sm text-gray-600">Notify when a device comes back online</p>
            </button>

            {/* Task Reminder */}
            <button
              onClick={() => sendTestNotification('task_reminder')}
              disabled={sending}
              className="bg-white p-6 rounded-xl shadow-md hover:shadow-lg transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="text-4xl mb-3">📋</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">Task Reminder</h3>
              <p className="text-sm text-gray-600">Remind about scheduled farming activities</p>
            </button>

            {/* Growth Stage Change */}
            <button
              onClick={() => sendTestNotification('growth_stage')}
              disabled={sending}
              className="bg-white p-6 rounded-xl shadow-md hover:shadow-lg transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="text-4xl mb-3">🌱</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">Growth Stage Change</h3>
              <p className="text-sm text-gray-600">Notify when rice enters new growth stage</p>
            </button>

            {/* Critical Sensor */}
            <button
              onClick={() => sendTestNotification('critical_sensor')}
              disabled={sending}
              className="bg-white p-6 rounded-xl shadow-md hover:shadow-lg transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="text-4xl mb-3">⚠️</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">Critical Sensor Alert</h3>
              <p className="text-sm text-gray-600">Alert about abnormal sensor readings</p>
            </button>

            {/* Harvest Ready */}
            <button
              onClick={() => sendTestNotification('harvest_ready')}
              disabled={sending}
              className="bg-white p-6 rounded-xl shadow-md hover:shadow-lg transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="text-4xl mb-3">🌾</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">Harvest Ready</h3>
              <p className="text-sm text-gray-600">Notify when rice is ready for harvest</p>
            </button>

            {/* General Notification */}
            <button
              onClick={() => sendTestNotification('general')}
              disabled={sending}
              className="bg-white p-6 rounded-xl shadow-md hover:shadow-lg transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="text-4xl mb-3">👋</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">General Message</h3>
              <p className="text-sm text-gray-600">Send a general welcome notification</p>
            </button>
          </div>

          {/* Instructions */}
          <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-blue-900 mb-2">💡 How to Test</h2>
            <ol className="list-decimal list-inside space-y-2 text-sm text-blue-800">
              <li>Click any notification type button above</li>
              <li>Look for the red badge on the notification bell icon in the header</li>
              <li>Click the bell icon to open the notification dropdown</li>
              <li>Click on a notification to mark it as read and navigate to the related page</li>
              <li>Use "Mark all read" to clear all unread notifications at once</li>
            </ol>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
