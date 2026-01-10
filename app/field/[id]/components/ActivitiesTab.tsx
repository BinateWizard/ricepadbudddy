'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getVarietyByName } from '@/lib/utils/varietyHelpers';
import { 
  getDaysSincePlanting, 
  getCurrentStage
} from '@/lib/utils/stageCalculator';
import { PRE_PLANTING_ACTIVITIES } from '@/lib/data/activities';

// Helper function to sanitize stage names for Firebase paths
const sanitizeStageName = (stageName: string) => {
  return stageName.replace(/\//g, '-').replace(/\s+/g, '-').toLowerCase();
};

interface ActivitiesTabProps {
  field: any;
  paddies: any[];
  deviceReadings?: any[];
}

export function ActivitiesTab({ field, paddies, deviceReadings = [] }: ActivitiesTabProps) {
  const { user } = useAuth();
  const [completedTasks, setCompletedTasks] = useState<{ [key: string]: boolean }>({});
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [showFinished, setShowFinished] = useState(false);
  const [selectedStage, setSelectedStage] = useState<string>('current');

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

  const prePlantingActivities = plantingMethod === 'transplant' 
    ? PRE_PLANTING_ACTIVITIES.map(activity => ({
        ...activity,
        day: activity.day,
        _isPrePlanting: true,
        stage: 'Pre-Planting'
      }))
    : [];

  const lookbackDays = 3;
  const regularActivities = variety.activities
    .filter(activity => {
      // Filter by time window
      const inTimeWindow = activity.day >= (daysSincePlanting - lookbackDays) && 
        activity.day <= (currentStage?.endDay || daysSincePlanting + 14);
      if (!inTimeWindow) return false;
      
      // Filter by planting method
      if (!activity.plantingMethod || activity.plantingMethod === 'both') return true;
      const fieldMethodNormalized = plantingMethod === 'direct-planting' ? 'direct-seeding' : plantingMethod;
      return activity.plantingMethod === fieldMethodNormalized;
    })
    .map(activity => {
      // Find which stage this activity belongs to
      const stage = variety.growthStages.find(s => 
        activity.day >= s.startDay && activity.day <= s.endDay
      );
      return {
        ...activity,
        stage: stage?.name || 'Unknown'
      };
    })
    .sort((a, b) => a.day - b.day);

  const allActivities = [
    ...(plantingMethod === 'transplant' ? prePlantingActivities : []),
    ...regularActivities
  ].sort((a, b) => a.day - b.day);

  // Group activities by stage
  const activitiesByStage: { [key: string]: any[] } = {};
  allActivities.forEach(activity => {
    const stageName = activity.stage || 'Unknown';
    if (!activitiesByStage[stageName]) {
      activitiesByStage[stageName] = [];
    }
    activitiesByStage[stageName].push(activity);
  });

  // Create stage tabs (Pre-Planting + Growth Stages)
  const stageTabs = [
    { id: 'current', label: 'Current Stage', stage: currentStage?.name || '' },
    ...(plantingMethod === 'transplant' ? [{ id: 'pre-planting', label: 'Pre-Planting', stage: 'Pre-Planting' }] : []),
    ...variety.growthStages.map((stage) => ({
      id: stage.name.toLowerCase().replace(/\s+/g, '-').replace(/\//g, '-'),
      label: stage.name,
      stage: stage.name
    }))
  ];

  const currentAndUpcomingActivities = showFinished
    ? allActivities.filter((activity, index) => {
        const taskKey = `day-${activity.day}-${index}`;
        return completedTasks[taskKey] === true;
      }).sort((a, b) => b.day - a.day)
    : allActivities
        .filter((activity, index) => {
          const taskKey = `day-${activity.day}-${index}`;
          const isCompleted = completedTasks[taskKey] === true;
          const isPrePlanting = (activity as any)._isPrePlanting;
          
          if (isCompleted) return false;
          
          if (selectedStage === 'current') {
            // Show current stage activities
            return activity.stage === currentStage?.name || isPrePlanting;
          } else if (selectedStage === 'pre-planting') {
            return isPrePlanting;
          } else {
            // Show activities for selected stage
            const selectedStageName = stageTabs.find(t => t.id === selectedStage)?.stage;
            return activity.stage === selectedStageName;
          }
        })
        .sort((a, b) => {
          const aIsCurrentStage = currentStage && a.day >= currentStage.startDay && a.day <= currentStage.endDay;
          const bIsCurrentStage = currentStage && b.day >= currentStage.startDay && b.day <= currentStage.endDay;
          
          if (aIsCurrentStage && !bIsCurrentStage) return -1;
          if (!aIsCurrentStage && bIsCurrentStage) return 1;
          
          return a.day - b.day;
        });

  useEffect(() => {
    const loadCompletedTasks = async () => {
      if (!user || !field.id || !currentStage) {
        setLoadingTasks(false);
        return;
      }
      
      try {
        const sanitizedStageName = sanitizeStageName(currentStage.name);
        const tasksRef = doc(db, 'users', user.uid, 'fields', field.id, 'tasks', sanitizedStageName);
        const tasksSnap = await getDoc(tasksRef);
        
        if (tasksSnap.exists()) {
          setCompletedTasks(tasksSnap.data().completed || {});
        }
      } catch (error: any) {
        console.error('Error loading tasks:', error);
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

  // Calculate urgency for each activity
  const getActivityUrgency = (activity: any) => {
    const daysDiff = activity.day - daysSincePlanting;
    
    if (daysDiff === 0) return 'high';
    if (daysDiff < 0 && Math.abs(daysDiff) <= 3) return 'high';
    if (daysDiff > 0 && daysDiff <= 2) return 'high';
    if (daysDiff > 0 && daysDiff <= 5) return 'medium';
    return 'low';
  };

  return (
    <div className="space-y-4 -mx-1 sm:mx-0">
      {/* Stages Tab Control */}
      <div className="bg-white rounded-xl shadow-md p-4">
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-gray-300">
          {stageTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setSelectedStage(tab.id)}
              className={`px-4 py-2 rounded-lg whitespace-nowrap font-medium transition-all ${
                selectedStage === tab.id
                  ? 'bg-gradient-to-r from-green-600 to-emerald-600 text-white shadow-md'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Activities Table */}
      <div className="bg-white rounded-xl shadow-md overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">
              {Object.values(completedTasks).filter(Boolean).length} / {allActivities.length} completed
            </span>
          </div>
          <button
            onClick={() => setShowFinished(!showFinished)}
            className="text-xs px-3 py-1 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium transition-colors"
          >
            {showFinished ? 'Show Upcoming' : 'Show Finished'}
          </button>
        </div>

        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          {currentAndUpcomingActivities.length > 0 ? (
            <table className="w-full">
              <thead className="bg-gradient-to-r from-green-50 to-emerald-50 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider w-12">
                    Done
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Day
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Activity
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Stage
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Urgency
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Message
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {currentAndUpcomingActivities.map((activity, index) => {
                  const taskKey = `day-${activity.day}-${index}`;
                  const isCompleted = Boolean(completedTasks[taskKey]);
                  const isPrePlanting = (activity as any)._isPrePlanting;
                  const daysDiff = activity.day - daysSincePlanting;
                  const isPast = daysDiff < 0;
                  const isToday = daysDiff === 0;
                  const urgency = getActivityUrgency(activity);
                  
                  const displayDay = isPrePlanting 
                    ? `${Math.abs(activity.day)} days before transplant`
                    : `Day ${activity.day}`;
                  
                  const message = isToday ? 'Due today!' :
                    isPast ? `Overdue by ${Math.abs(daysDiff)} days` :
                    `Due in ${daysDiff} days`;
                  
                  return (
                    <tr 
                      key={index}
                      className={`hover:bg-gray-50 transition-colors ${
                        isCompleted ? 'opacity-60' : ''
                      }`}
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={isCompleted}
                          onChange={() => toggleTask(taskKey)}
                          disabled={loadingTasks || showFinished}
                          className="w-5 h-5 text-green-600 rounded focus:ring-green-500 cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`text-xs font-semibold px-2 py-1 rounded ${
                          isToday ? 'bg-yellow-200 text-yellow-900' :
                          isPast ? 'bg-red-100 text-red-700' :
                          isPrePlanting ? 'bg-purple-100 text-purple-700' :
                          'bg-blue-100 text-blue-700'
                        }`}>
                          {displayDay}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <p className={`font-medium ${isCompleted ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
                            {activity.action}
                          </p>
                          <div className="mt-1 space-y-1">
                            {activity.water && (
                              <p className={`text-xs ${isCompleted ? 'text-gray-400' : 'text-blue-700'}`}>
                                💧 {activity.water}
                              </p>
                            )}
                            {activity.fertilizer && (
                              <p className={`text-xs ${isCompleted ? 'text-gray-400' : 'text-green-700'}`}>
                                🌾 {activity.fertilizer}
                              </p>
                            )}
                            {activity.notes && (
                              <p className={`text-xs ${isCompleted ? 'text-gray-400' : 'text-gray-600'}`}>
                                ℹ️ {activity.notes}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                          {activity.stage}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold uppercase ${
                          urgency === 'high' ? 'bg-red-100 text-red-700' :
                          urgency === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-green-100 text-green-700'
                        }`}>
                          {urgency}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-gray-600">{message}</p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-500 text-lg mb-2">
                {showFinished ? 'No finished activities yet' : 'No upcoming activities for this stage'}
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
      </div>
    </div>
  );
}
