'use client';

import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, Trash2, CheckCircle, Loader2 } from 'lucide-react';

export default function CleanupData() {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [stats, setStats] = useState({
    users: 0,
    fields: 0,
    paddies: 0,
    logs: 0,
    tasks: 0,
    notifications: 0,
    fcmTokens: 0,
    totalDeleted: 0,
  });
  const [isConfirming, setIsConfirming] = useState(false);

  const cleanupAllData = async () => {
    if (!isConfirming) {
      setIsConfirming(true);
      setMessage('⚠️ Ready to delete all user data. Click "CONFIRM DELETE" again to proceed.');
      return;
    }

    setIsLoading(true);
    setMessage('🔄 Starting cleanup via Cloud Function...');

    try {
      // Call the Cloud Function
      const cleanupFunction = httpsCallable(functions, 'cleanupAllUserData');
      const result = await cleanupFunction({});

      const response = result.data as any;

      setStats(response.stats || {});
      setMessage(
        `✅ ${response.message}\n\nBreakdown:\n- ${response.stats?.users} users\n- ${response.stats?.fields} fields\n- ${response.stats?.paddies} paddies\n- ${response.stats?.logs} logs\n- ${response.stats?.tasks} tasks\n- ${response.stats?.notifications} notifications\n- ${response.stats?.fcmTokens} FCM tokens`
      );
      setIsConfirming(false);
    } catch (error: any) {
      console.error('Error cleaning up data:', error);
      const errorMessage = error.message || String(error);
      setMessage(`✗ Error during cleanup: ${errorMessage}`);
      setIsConfirming(false);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 p-4 sm:p-8">
      <div className="max-w-2xl mx-auto">
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-500">
              <AlertTriangle className="h-6 w-6" />
              Firestore Data Cleanup
            </CardTitle>
            <CardDescription>
              Permanently delete all user data, fields, paddies, and related documents
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Warning Message */}
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
              <p className="text-sm text-red-400">
                ⚠️ <strong>WARNING:</strong> This action is irreversible. All user data will be
                permanently deleted from Firestore. Make sure you have a backup if needed.
              </p>
            </div>

            {/* Status Message */}
            {message && (
              <div
                className={`p-4 rounded-lg whitespace-pre-wrap ${
                  message.includes('✓') || message.includes('✅')
                    ? 'bg-green-500/10 border border-green-500/30 text-green-400'
                    : message.includes('✗')
                      ? 'bg-red-500/10 border border-red-500/30 text-red-400'
                      : 'bg-blue-500/10 border border-blue-500/30 text-blue-400'
                }`}
              >
                {message}
              </div>
            )}

            {/* Stats Display */}
            {stats.totalDeleted > 0 && (
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-700/50 rounded-lg p-3">
                  <p className="text-2xl font-bold text-white">{stats.users}</p>
                  <p className="text-xs text-slate-400">Users</p>
                </div>
                <div className="bg-slate-700/50 rounded-lg p-3">
                  <p className="text-2xl font-bold text-white">{stats.fields}</p>
                  <p className="text-xs text-slate-400">Fields</p>
                </div>
                <div className="bg-slate-700/50 rounded-lg p-3">
                  <p className="text-2xl font-bold text-white">{stats.paddies}</p>
                  <p className="text-xs text-slate-400">Paddies</p>
                </div>
                <div className="bg-slate-700/50 rounded-lg p-3">
                  <p className="text-2xl font-bold text-white">{stats.logs}</p>
                  <p className="text-xs text-slate-400">Logs</p>
                </div>
                <div className="bg-slate-700/50 rounded-lg p-3">
                  <p className="text-2xl font-bold text-white">{stats.notifications}</p>
                  <p className="text-xs text-slate-400">Notifications</p>
                </div>
                <div className="bg-slate-700/50 rounded-lg p-3">
                  <p className="text-2xl font-bold text-white">{stats.fcmTokens}</p>
                  <p className="text-xs text-slate-400">FCM Tokens</p>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col gap-3 pt-4">
              {!isConfirming ? (
                <Button
                  onClick={cleanupAllData}
                  disabled={isLoading}
                  className="bg-orange-600 hover:bg-orange-700"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Cleaning up...
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete All User Data
                    </>
                  )}
                </Button>
              ) : (
                <>
                  <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3">
                    <p className="text-sm text-red-400">
                      ⚠️ <strong>FINAL CONFIRMATION:</strong> This will permanently delete all user data.
                      Click "CONFIRM DELETE" again to proceed.
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <Button
                      onClick={() => {
                        setIsConfirming(false);
                        setMessage('');
                      }}
                      disabled={isLoading}
                      className="bg-slate-700 hover:bg-slate-600 flex-1"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={cleanupAllData}
                      disabled={isLoading}
                      className="bg-red-600 hover:bg-red-700 flex-1"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Deleting...
                        </>
                      ) : (
                        'CONFIRM DELETE'
                      )}
                    </Button>
                  </div>
                </>
              )}
            </div>

            {/* Info */}
            <div className="text-xs text-slate-400 space-y-2 pt-4 border-t border-slate-700">
              <p>
                <strong>How it works:</strong>
              </p>
              <ul className="list-disc list-inside space-y-1">
                <li>Uses secure Cloud Function with admin authentication</li>
                <li>Only <code>ricepaddy.contact@gmail.com</code> can trigger cleanup</li>
                <li>Runs with Firestore admin privileges (bypasses security rules)</li>
                <li>Safe batch deletion with 500-doc limits</li>
              </ul>
              <p className="pt-2">
                <strong>What gets deleted:</strong>
              </p>
              <ul className="list-disc list-inside space-y-1">
                <li>All user documents</li>
                <li>All user fields</li>
                <li>All user paddies</li>
                <li>All paddy logs and data</li>
                <li>All field tasks</li>
                <li>All user notifications</li>
                <li>All FCM tokens</li>
              </ul>
              <p className="pt-2">
                <strong>What stays intact:</strong>
              </p>
              <ul className="list-disc list-inside space-y-1">
                <li>Device collection (DEVICE_0001, etc.)</li>
                <li>System logs and command logs</li>
                <li>Rice varieties collection</li>
                <li>All Firebase Functions</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
