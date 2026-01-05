'use client';

import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { sendTestNotification, notifyError, notifyWarning } from '@/lib/utils/pushNotifications';
import { usePushNotifications } from '@/lib/hooks/usePushNotifications';
import { Bell, Mail, AlertTriangle, CheckCircle, ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function TestPushNotifications() {
  const { user } = useAuth();
  const router = useRouter();
  const { permission, isSupported, requestPermission, token } = usePushNotifications();
  const [message, setMessage] = useState('Test notification from PadBuddy!');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string>('');

  const handleRequestPermission = async () => {
    setLoading(true);
    setResult('');
    try {
      const granted = await requestPermission();
      if (granted) {
        setResult('✅ Permission granted! FCM token saved.');
      } else {
        setResult('❌ Permission denied. Please enable notifications in browser settings.');
      }
    } catch (error: any) {
      setResult(`❌ Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSendTest = async () => {
    setLoading(true);
    setResult('');
    try {
      await sendTestNotification(message, 'test');
      setResult('✅ Test notification sent! Check your notifications.');
    } catch (error: any) {
      setResult(`❌ Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSendError = async () => {
    setLoading(true);
    setResult('');
    try {
      await notifyError('Test error: Device malfunction detected', 'DEVICE_TEST');
      setResult('✅ Error notification sent!');
    } catch (error: any) {
      setResult(`❌ Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSendWarning = async () => {
    setLoading(true);
    setResult('');
    try {
      await notifyWarning('Test warning: NPK levels below threshold', 'DEVICE_TEST');
      setResult('✅ Warning notification sent!');
    } catch (error: any) {
      setResult(`❌ Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50">
        <nav className="bg-gradient-to-r from-green-500 via-emerald-500 to-teal-500 sticky top-0 z-50 shadow-lg">
          <div className="w-full px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-14 md:h-16">
              <div className="flex items-center gap-2 md:gap-3">
                <button
                  onClick={() => router.push('/')}
                  className="inline-flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 active:bg-white/30 text-white p-2 transition-all min-w-[40px] min-h-[40px]"
                  aria-label="Go back to home"
                >
                  <ArrowLeft className="w-5 h-5 md:w-6 md:h-6" />
                </button>
                <h1 className="text-base md:text-xl lg:text-2xl font-bold text-white">Test Push Notifications</h1>
              </div>
            </div>
          </div>
        </nav>

        <main className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="w-6 h-6" />
                Push Notification Tester
              </CardTitle>
              <CardDescription>
                Test push notifications and email alerts for PadBuddy
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Status Section */}
              <div className="space-y-3">
                <h3 className="font-semibold text-gray-900 text-lg">Status</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="p-3 bg-white border border-gray-200 rounded-lg shadow-sm">
                    <p className="text-sm font-medium text-gray-700 mb-1">Browser Support</p>
                    <p className="font-bold">
                      {isSupported ? (
                        <span className="text-green-600 flex items-center gap-1">
                          <CheckCircle className="w-4 h-4" /> Supported
                        </span>
                      ) : (
                        <span className="text-red-600">Not Supported</span>
                      )}
                    </p>
                  </div>
                  <div className="p-3 bg-white border border-gray-200 rounded-lg shadow-sm">
                    <p className="text-sm font-medium text-gray-700 mb-1">Permission</p>
                    <p className="font-bold">
                      {permission === 'granted' ? (
                        <span className="text-green-600 flex items-center gap-1">
                          <CheckCircle className="w-4 h-4" /> Granted
                        </span>
                      ) : permission === 'denied' ? (
                        <span className="text-red-600">Denied</span>
                      ) : (
                        <span className="text-yellow-600">Not Requested</span>
                      )}
                    </p>
                  </div>
                  <div className="p-3 bg-white border border-gray-200 rounded-lg shadow-sm">
                    <p className="text-sm font-medium text-gray-700 mb-1">FCM Token</p>
                    <p className="font-bold text-xs">
                      {token ? (
                        <span className="text-green-600">✓ Saved</span>
                      ) : (
                        <span className="text-gray-400">None</span>
                      )}
                    </p>
                  </div>
                </div>
              </div>

              {/* Request Permission */}
              {permission !== 'granted' && (
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-sm text-yellow-800 mb-3">
                    <AlertTriangle className="w-4 h-4 inline mr-1" />
                    You need to grant notification permission first
                  </p>
                  <Button onClick={handleRequestPermission} disabled={loading || !isSupported}>
                    <Bell className="w-4 h-4 mr-2" />
                    Request Permission
                  </Button>
                </div>
              )}

              {/* Test Message Input */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-900">Test Message</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  rows={3}
                  placeholder="Enter your test message..."
                />
              </div>

              {/* Test Buttons */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Button 
                  onClick={handleSendTest} 
                  disabled={loading || permission !== 'granted'}
                  className="w-full"
                >
                  <Bell className="w-4 h-4 mr-2" />
                  Send Test
                </Button>
                <Button 
                  onClick={handleSendError}
                  disabled={loading || permission !== 'granted'}
                  variant="destructive"
                  className="w-full"
                >
                  <AlertTriangle className="w-4 h-4 mr-2" />
                  Test Error
                </Button>
                <Button 
                  onClick={handleSendWarning}
                  disabled={loading || permission !== 'granted'}
                  variant="outline"
                  className="w-full"
                >
                  <Mail className="w-4 h-4 mr-2" />
                  Test Warning
                </Button>
              </div>

              {/* Result */}
              {result && (
                <div className={`p-4 rounded-lg ${
                  result.startsWith('✅') ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
                }`}>
                  {result}
                </div>
              )}

              {/* Instructions */}
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h4 className="font-semibold text-blue-900 mb-2">How it works:</h4>
                <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
                  <li>Click "Request Permission" to enable notifications</li>
                  <li>Your FCM token is automatically saved to Firestore</li>
                  <li>Click any test button to trigger a notification</li>
                  <li>The Cloud Function will send both push notification AND email</li>
                  <li>Check your browser notifications and email inbox</li>
                </ol>
              </div>

              {/* Email Setup Note */}
              <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                <h4 className="font-semibold text-purple-900 mb-2">📧 Email Setup (Admin Only):</h4>
                <p className="text-sm text-purple-800 mb-2">
                  To enable email notifications, configure Firebase Functions environment:
                </p>
                <code className="block bg-purple-100 p-2 rounded text-xs">
                  firebase functions:config:set email.user="your-email@gmail.com" email.password="your-app-password"
                </code>
                <p className="text-xs text-purple-600 mt-2">
                  Use Gmail App Password (not regular password) for security
                </p>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    </ProtectedRoute>
  );
}
