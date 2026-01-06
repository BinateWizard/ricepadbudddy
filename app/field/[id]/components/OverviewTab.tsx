'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getVarietyByName } from '@/lib/utils/varietyHelpers';
import { 
  getDaysSincePlanting, 
  getCurrentStage, 
  getExpectedHarvestDate, 
  getGrowthProgress 
} from '@/lib/utils/stageCalculator';
import { VARIETY_ACTIVITY_TRIGGERS } from '@/lib/data/activityTriggers';
import { PRE_PLANTING_ACTIVITIES } from '@/lib/data/activities';

// Helper function to sanitize stage names for Firebase paths
const sanitizeStageName = (stageName: string) => {
  return stageName.replace(/\//g, '-').replace(/\s+/g, '-').toLowerCase();
};

interface OverviewTabProps {
  field: any;
  paddies: any[];
  deviceReadings?: any[];
}

export function OverviewTab({ field, paddies, deviceReadings = [] }: OverviewTabProps) {
  const { user } = useAuth();
  const [completedTasks, setCompletedTasks] = useState<{ [key: string]: boolean }>({});
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [showFinished, setShowFinished] = useState(false);

  if (!field) return null;

  const variety = getVarietyByName(field.riceVariety);
  
  if (!variety) {
    return (
      <div className="bg-white rounded-xl shadow-md p-6">
        <p className="text-red-600">Rice variety data not found</p>
      </div>
    );
  }
  
  const daysSincePlanting = getDaysSincePlanting(field.startDay);
  const plantingMethod = field.plantingMethod || 'transplant';
  const currentStage = getCurrentStage(variety, daysSincePlanting);
  const expectedHarvest = getExpectedHarvestDate(field.startDay, variety);
  const progress = getGrowthProgress(variety, daysSincePlanting);

  const prePlantingActivities = plantingMethod === 'transplant' 
    ? PRE_PLANTING_ACTIVITIES.map(activity => ({
        ...activity,
        day: activity.day,
        _isPrePlanting: true
      }))
    : [];

  // Show activities from 3 days ago up to the end of current stage
  // This ensures recent uncompleted activities are still visible
  const lookbackDays = 3;
  const regularActivities = variety.activities
    .filter(activity => 
      activity.day >= (daysSincePlanting - lookbackDays) && 
      activity.day <= (currentStage?.endDay || daysSincePlanting + 14)
    )
    .sort((a, b) => a.day - b.day);

  const allActivities = [
    ...(plantingMethod === 'transplant' ? prePlantingActivities : []),
    ...regularActivities
  ].sort((a, b) => a.day - b.day);

  // Filter activities based on showFinished toggle
  const currentAndUpcomingActivities = showFinished
    ? // Show completed tasks sorted by most recent first
      allActivities.filter((activity, index) => {
        const taskKey = `day-${activity.day}-${index}`;
        return completedTasks[taskKey] === true;
      }).sort((a, b) => b.day - a.day)
    : // Show ONLY uncompleted tasks, sorted by stage priority (current stage first)
      allActivities
        .filter((activity, index) => {
          const taskKey = `day-${activity.day}-${index}`;
          const isCompleted = completedTasks[taskKey] === true;
          const isPrePlanting = (activity as any)._isPrePlanting;
          
          // Only show uncompleted tasks
          if (isCompleted) return false;
          
          if (isPrePlanting) {
            return true;
          } else {
            // Show activities from lookback period up to end of current stage
            return activity.day >= (daysSincePlanting - lookbackDays) && 
                   activity.day <= (currentStage?.endDay || daysSincePlanting + 14);
          }
        })
        .sort((a, b) => {
          // Sort by stage priority: current stage tasks first, then by day
          const aIsCurrentStage = currentStage && a.day >= currentStage.startDay && a.day <= currentStage.endDay;
          const bIsCurrentStage = currentStage && b.day >= currentStage.startDay && b.day <= currentStage.endDay;
          
          if (aIsCurrentStage && !bIsCurrentStage) return -1;
          if (!aIsCurrentStage && bIsCurrentStage) return 1;
          
          // Within same priority, sort by day
          return a.day - b.day;
        });

  const varietyTriggers = VARIETY_ACTIVITY_TRIGGERS[field.riceVariety] || [];
  const currentTriggers = varietyTriggers.filter(t => t.stage === currentStage?.name);

  // Generate NPK alerts based on device readings
  const npkAlerts: Array<{ type: 'critical' | 'warning' | 'info'; message: string; paddyName?: string }> = [];
  
  // Track devices with sensor issues
  const devicesWithSensorIssues: string[] = [];
  
  // NPK thresholds (mg/kg)
  const NPK_THRESHOLDS = {
    nitrogen: { critical: 20, low: 40, optimal: 60 },
    phosphorus: { critical: 10, low: 20, optimal: 30 },
    potassium: { critical: 30, low: 60, optimal: 80 }
  };

  // First, check which devices have NPK sensor issues
  paddies.forEach((paddy) => {
    if (!paddy.deviceId) return;
    
    const reading = deviceReadings.find(r => r.deviceId === paddy.deviceId);
    const paddyName = paddy.paddyName || paddy.deviceId;
    
    // Check if device exists but has no NPK data or invalid data
    if (!reading || !reading.npk) {
      devicesWithSensorIssues.push(paddyName);
      npkAlerts.push({
        type: 'info',
        message: `🔧 ${paddyName}: NPK sensor not responding. Check device connection and sensor calibration.`,
        paddyName
      });
    } else {
      const npk = reading.npk;
      // Check if all NPK values are null/undefined (sensor malfunction)
      if ((npk.n === undefined || npk.n === null) && 
          (npk.p === undefined || npk.p === null) && 
          (npk.k === undefined || npk.k === null)) {
        devicesWithSensorIssues.push(paddyName);
        npkAlerts.push({
          type: 'info',
          message: `🔧 ${paddyName}: NPK sensor malfunction detected. No readings available.`,
          paddyName
        });
      }
    }
  });

  // Only check NPK levels for devices with working sensors
  deviceReadings.forEach((reading) => {
    if (!reading.npk) return;
    
    const paddy = paddies.find(p => p.deviceId === reading.deviceId);
    const paddyName = paddy?.paddyName || reading.deviceId;
    
    // Skip if this device has sensor issues
    if (devicesWithSensorIssues.includes(paddyName)) return;
    
    const npk = reading.npk;
    
    // Only proceed if we have at least some valid NPK data
    const hasValidData = (npk.n !== undefined && npk.n !== null) || 
                        (npk.p !== undefined && npk.p !== null) || 
                        (npk.k !== undefined && npk.k !== null);
    
    if (!hasValidData) return;
    
    // Check Nitrogen
    if (npk.n !== undefined && npk.n !== null) {
      if (npk.n < NPK_THRESHOLDS.nitrogen.critical) {
        npkAlerts.push({
          type: 'critical',
          message: `🚨 CRITICAL: Nitrogen severely depleted (${npk.n} mg/kg) in ${paddyName}. Immediate fertilization required!`,
          paddyName
        });
      } else if (npk.n < NPK_THRESHOLDS.nitrogen.low) {
        npkAlerts.push({
          type: 'warning',
          message: `⚠️ WARNING: Low nitrogen levels (${npk.n} mg/kg) in ${paddyName}. Consider applying fertilizer.`,
          paddyName
        });
      }
    }
    
    // Check Phosphorus
    if (npk.p !== undefined && npk.p !== null) {
      if (npk.p < NPK_THRESHOLDS.phosphorus.critical) {
        npkAlerts.push({
          type: 'critical',
          message: `🚨 CRITICAL: Phosphorus severely depleted (${npk.p} mg/kg) in ${paddyName}. Immediate action needed!`,
          paddyName
        });
      } else if (npk.p < NPK_THRESHOLDS.phosphorus.low) {
        npkAlerts.push({
          type: 'warning',
          message: `⚠️ WARNING: Low phosphorus levels (${npk.p} mg/kg) in ${paddyName}. Monitor closely.`,
          paddyName
        });
      }
    }
    
    // Check Potassium
    if (npk.k !== undefined && npk.k !== null) {
      if (npk.k < NPK_THRESHOLDS.potassium.critical) {
        npkAlerts.push({
          type: 'critical',
          message: `🚨 CRITICAL: Potassium severely depleted (${npk.k} mg/kg) in ${paddyName}. Immediate fertilization required!`,
          paddyName
        });
      } else if (npk.k < NPK_THRESHOLDS.potassium.low) {
        npkAlerts.push({
          type: 'warning',
          message: `⚠️ WARNING: Low potassium levels (${npk.k} mg/kg) in ${paddyName}. Consider applying fertilizer.`,
          paddyName
        });
      }
    }
  });

  // Sort alerts by severity (critical first, then warnings, then info/sensor issues)
  npkAlerts.sort((a, b) => {
    const priority = { critical: 0, warning: 1, info: 2 };
    return priority[a.type] - priority[b.type];
  });

  useEffect(() => {
    const loadCompletedTasks = async () => {
      if (!user || !field.id || !currentStage) {
        setLoadingTasks(false);
        return;
      }
      
      try {
        const sanitizedStageName = sanitizeStageName(currentStage.name);
        const tasksPath = `users/${user.uid}/fields/${field.id}/tasks/${sanitizedStageName}`;
        console.log('Loading tasks from:', tasksPath);
        const tasksRef = doc(db, 'users', user.uid, 'fields', field.id, 'tasks', sanitizedStageName);
        const tasksSnap = await getDoc(tasksRef);
        
        if (tasksSnap.exists()) {
          console.log('Tasks loaded successfully');
          setCompletedTasks(tasksSnap.data().completed || {});
        } else {
          console.log('No existing tasks document found (this is normal for first time)');
        }
      } catch (error: any) {
        console.error('Error loading tasks:', error);
        console.error('Error code:', error?.code);
        if (error?.code === 'permission-denied') {
          console.error('PERMISSION DENIED: Check Firestore rules for tasks subcollection');
        }
      } finally {
        setLoadingTasks(false);
      }
    };

    loadCompletedTasks();
  }, [user, field.id, currentStage?.name]);

  const toggleTask = async (taskKey: string) => {
    if (!user || !field.id || !currentStage) return;

    const newCompletedTasks = {
      ...completedTasks,
      [taskKey]: !completedTasks[taskKey]
    };

    setCompletedTasks(newCompletedTasks);

    try {
      const sanitizedStageName = sanitizeStageName(currentStage.name);
      const tasksRef = doc(db, 'users', user.uid, 'fields', field.id, 'tasks', sanitizedStageName);
      await setDoc(tasksRef, {
        completed: newCompletedTasks,
        updatedAt: new Date()
      }, { merge: true });
    } catch (error) {
      console.error('Error saving task:', error);
      setCompletedTasks(completedTasks);
    }
  };

  return (
    <div className="space-y-6 -mx-1 sm:mx-0">
      {/* Growth Progress Bar */}
      <div className="bg-white rounded-xl shadow-md p-4 sm:p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-900">Growth Progress</h2>
          <div className="text-right">
            <p className="text-sm text-gray-600">Expected Harvest</p>
            <p className="text-lg font-semibold text-gray-900">
              {new Date(expectedHarvest).toLocaleDateString()}
            </p>
          </div>
        </div>
        
        <div className="mb-2">
          <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-green-500 to-green-600 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="flex justify-end mb-4">
          <div className="text-right">
            <p className="text-lg font-bold text-green-600">
              {daysSincePlanting} / {variety.maturityDays.max || 130}
            </p>
            <p className="text-xs text-gray-500">days</p>
          </div>
        </div>

        {currentStage && (
          <div className="p-4 bg-green-50 rounded-lg border border-green-200">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 bg-green-600 rounded-full animate-pulse" />
              <h3 className="font-semibold text-green-900">Current Stage: {currentStage.name}</h3>
            </div>
            <p className="text-sm text-green-800">
              Day {currentStage.startDay} - {currentStage.endDay} of growth cycle
            </p>
          </div>
        )}
      </div>

      {/* Activities & Tasks */}
      <div className="bg-white rounded-xl shadow-md p-4 sm:p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Activities & Tasks</h2>
        
        {/* NPK Urgent Alerts */}
        {npkAlerts.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <span className="text-red-600">🔔</span>
              Urgent Alerts
            </h3>
            <div className="space-y-2">
              {npkAlerts.map((alert, index) => (
                <div
                  key={index}
                  className={`p-4 rounded-lg border-l-4 ${
                    alert.type === 'critical' 
                      ? 'bg-red-50 border-red-500' 
                      : alert.type === 'warning'
                      ? 'bg-yellow-50 border-yellow-500'
                      : 'bg-blue-50 border-blue-500'
                  }`}
                >
                  <p className={`text-sm font-medium ${
                    alert.type === 'critical' 
                      ? 'text-red-900' 
                      : alert.type === 'warning'
                      ? 'text-yellow-900'
                      : 'text-blue-900'
                  }`}>
                    {alert.message}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {currentTriggers.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Variety-Specific Notes</h3>
            <div className="space-y-2">
              {currentTriggers.map((trigger, index) => (
                <div
                  key={index}
                  className={`p-3 rounded-lg border ${
                    trigger.type === 'warning' ? 'bg-red-50 border-red-200' :
                    trigger.type === 'precaution' ? 'bg-yellow-50 border-yellow-200' :
                    trigger.type === 'optional' ? 'bg-blue-50 border-blue-200' :
                    'bg-gray-50 border-gray-200'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-lg">
                      {trigger.type === 'warning' ? '⚠️' :
                       trigger.type === 'precaution' ? '⚡' :
                       trigger.type === 'optional' ? '💡' : '👀'}
                    </span>
                    <p className="text-sm text-gray-800">{trigger.message}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {currentAndUpcomingActivities.length > 0 ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">
                {showFinished ? 'Finished Activities' :
                 daysSincePlanting < 0 ? 'Pre-Planting & Upcoming Activities' : 
                 daysSincePlanting === 0 ? 'Today & Upcoming Activities' :
                 'Activities & Tasks'}
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">
                  {Object.values(completedTasks).filter(Boolean).length} / {allActivities.length} completed
                </span>
                <button
                  onClick={() => setShowFinished(!showFinished)}
                  className="text-xs px-3 py-1 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium transition-colors"
                >
                  {showFinished ? 'Show Upcoming' : 'Show Finished'}
                </button>
              </div>
            </div>
            {currentAndUpcomingActivities.map((activity, index) => {
              const taskKey = `day-${activity.day}-${index}`;
              const isCompleted = Boolean(completedTasks[taskKey]);
              const isPrePlanting = (activity as any)._isPrePlanting;
              const daysDiff = activity.day - daysSincePlanting;
              const isPast = daysDiff < 0;
              const isToday = daysDiff === 0;
              
              const displayDay = isPrePlanting 
                ? `${Math.abs(activity.day)} days before transplant`
                : activity.day;
              
              return (
                <div 
                  key={index} 
                  className={`flex items-start gap-3 p-3 rounded-lg transition-colors ${
                    isCompleted 
                      ? 'bg-green-50 border border-green-200' 
                      : isToday 
                      ? 'bg-yellow-50 hover:bg-yellow-100 border border-yellow-300 cursor-pointer'
                      : isPrePlanting
                      ? 'bg-purple-50 hover:bg-purple-100 border border-purple-200 cursor-pointer'
                      : 'bg-gray-50 hover:bg-gray-100 cursor-pointer'
                  }`}
                  onClick={() => !loadingTasks && !showFinished && toggleTask(taskKey)}
                >
                  <input
                    type="checkbox"
                    checked={isCompleted}
                    onChange={() => toggleTask(taskKey)}
                    onClick={(e) => e.stopPropagation()}
                    disabled={loadingTasks || showFinished}
                    className="mt-1 w-5 h-5 text-green-600 rounded focus:ring-green-500 disabled:opacity-100 disabled:cursor-not-allowed cursor-pointer"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                        isToday ? 'bg-yellow-200 text-yellow-900' :
                        isPast ? 'bg-red-100 text-red-700' :
                        isPrePlanting && isPast ? 'bg-purple-100 text-purple-700' :
                        isPrePlanting ? 'bg-purple-200 text-purple-900' :
                        'bg-blue-100 text-blue-700'
                      }`}>
                        {isToday ? 'TODAY' : 
                         isPrePlanting && isPast ? `${displayDay} (completed)` :
                         isPrePlanting ? displayDay :
                         isPast ? `Day ${activity.day} (${Math.abs(daysDiff)} days ago)` : 
                         `Day ${activity.day} (in ${daysDiff} days)`}
                      </span>
                      {activity.type && (
                        <span className="text-xs px-2 py-0.5 rounded bg-gray-200 text-gray-700 capitalize">
                          {activity.type.replace('-', ' ')}
                        </span>
                      )}
                      {isPrePlanting && (
                        <span className="text-xs px-2 py-0.5 rounded bg-purple-100 text-purple-700">
                          Pre-Planting
                        </span>
                      )}
                    </div>
                    <p className={`font-medium ${isCompleted ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
                      {activity.action}
                    </p>
                    <div className="mt-2 space-y-1">
                      {activity.water && (
                        <p className={`text-sm ${isCompleted ? 'text-gray-400' : 'text-blue-700'}`}>
                          💧 {activity.water}
                        </p>
                      )}
                      {activity.fertilizer && (
                        <p className={`text-sm ${isCompleted ? 'text-gray-400' : 'text-green-700'}`}>
                          🌾 {activity.fertilizer}
                        </p>
                      )}
                      {activity.notes && (
                        <p className={`text-sm ${isCompleted ? 'text-gray-400' : 'text-gray-600'}`}>
                          ℹ️ {activity.notes}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-gray-500">
              {showFinished ? 'No finished activities yet' : 'No upcoming activities'}
            </p>
            {showFinished && (
              <button
                onClick={() => setShowFinished(false)}
                className="mt-2 text-sm text-green-600 hover:text-green-700 font-medium"
              >
                View upcoming activities
              </button>
            )}
          </div>
        )}
      </div>

      {/* Growth Stages */}
      <div className="bg-white rounded-xl shadow-md p-4 sm:p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Growth Stages</h2>
        <div className="space-y-2">
          {variety?.growthStages?.map((stage, index) => {
            const isPassed = daysSincePlanting > stage.endDay;
            const isCurrent = daysSincePlanting >= stage.startDay && daysSincePlanting <= stage.endDay;
            
            return (
              <div
                key={index}
                className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                  isCurrent ? 'bg-green-50 border-green-300' :
                  isPassed ? 'bg-gray-50 border-gray-200' :
                  'bg-white border-gray-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-3 h-3 rounded-full ${
                      isPassed ? 'bg-green-600' :
                      isCurrent ? 'bg-green-600 animate-pulse' :
                      'bg-gray-300'
                    }`}
                  />
                  <span className={`font-medium ${
                    isCurrent ? 'text-green-900' : 'text-gray-900'
                  }`}>
                    {stage.name}
                  </span>
                </div>
                <span className="text-sm text-gray-600">
                  {stage.startDay}-{stage.endDay} days
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
