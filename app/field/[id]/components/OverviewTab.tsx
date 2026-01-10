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

  if (!field) {
    console.log('OverviewTab: No field data');
    return null;
  }

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
  
  // Auto-select current stage
  const getInitialStage = () => {
    if (daysSincePlanting < 0 && plantingMethod === 'transplant') {
      return 'pre-planting';
    }
    return currentStage?.name.toLowerCase().replace(/\s+/g, '-').replace(/\//g, '-') || 'germination-seedling';
  };
  
  const [selectedStage, setSelectedStage] = useState<string>(getInitialStage());
  const expectedHarvest = getExpectedHarvestDate(field.startDay, variety);
  const progress = getGrowthProgress(variety, daysSincePlanting);

  const prePlantingActivities = plantingMethod === 'transplant' 
    ? PRE_PLANTING_ACTIVITIES.map(activity => ({
        ...activity,
        day: activity.day,
        _isPrePlanting: true,
        stage: 'Pre-Planting'
      }))
    : [];

  // Map ALL variety activities to their stages AND filter by planting method
  const regularActivities = variety.activities
    .filter(activity => {
      // Only show activities that match the field's planting method
      // Activities without plantingMethod field or with 'both' apply to all methods
      if (!activity.plantingMethod || activity.plantingMethod === 'both') return true;
      
      const fieldMethodNormalized = plantingMethod === 'direct-planting' ? 'direct-seeding' : plantingMethod;
      return activity.plantingMethod === fieldMethodNormalized;
    })
    .map(activity => {
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

  // Create stage tabs (without Current Stage redundancy)
  const stageTabs = [
    ...(plantingMethod === 'transplant' ? [{ id: 'pre-planting', label: 'Pre-Planting', stage: 'Pre-Planting' }] : []),
    ...variety.growthStages.map((stage) => ({
      id: stage.name.toLowerCase().replace(/\s+/g, '-').replace(/\//g, '-'),
      label: stage.name,
      stage: stage.name
    }))
  ];

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

  const getActivityUrgency = (activity: any) => {
    const daysDiff = activity.day - daysSincePlanting;
    
    if (daysDiff === 0) return 'high';
    if (daysDiff < 0 && Math.abs(daysDiff) <= 3) return 'high';
    if (daysDiff > 0 && daysDiff <= 2) return 'high';
    if (daysDiff > 0 && daysDiff <= 5) return 'medium';
    return 'low';
  };

  const filteredActivities = allActivities.filter((activity, index) => {
    const isPrePlanting = (activity as any)._isPrePlanting;
    
    // Show all activities for the selected stage
    if (selectedStage === 'pre-planting') {
      return isPrePlanting;
    } else {
      const selectedStageName = stageTabs.find(t => t.id === selectedStage)?.stage;
      return activity.stage === selectedStageName;
    }
  }).sort((a, b) => a.day - b.day);

  // Alias for legacy references to currentAndUpcomingActivities to prevent ReferenceError
  const currentAndUpcomingActivities = filteredActivities;

  return (
    <div className="space-y-6 -mx-1 sm:mx-0">
      {/* Growth Progress Bar */}
      <div className="bg-white rounded-lg sm:rounded-xl shadow-md p-3 sm:p-4 md:p-6">
        <div className="flex justify-between items-center mb-3 sm:mb-4">
          <h2 className="text-base sm:text-lg md:text-xl font-bold text-gray-900">Growth Progress</h2>
          <div className="text-right">
            <p className="text-xs sm:text-sm text-gray-600">Expected Harvest</p>
            <p className="text-sm sm:text-base md:text-lg font-semibold text-gray-900">
              {new Date(expectedHarvest).toLocaleDateString()}
            </p>
          </div>
        </div>
        
        <div className="mb-2">
          <div className="h-2 sm:h-3 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-green-500 to-green-600 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="flex justify-end mb-3 sm:mb-4">
          <div className="text-right">
            <p className="text-base sm:text-lg md:text-xl font-bold text-green-600">
              {daysSincePlanting} / {variety.maturityDays.max || 130}
            </p>
            <p className="text-xs text-gray-500">days</p>
          </div>
        </div>

        {currentStage && (
          <div className="p-3 sm:p-4 bg-green-50 rounded-lg border border-green-200">
            <div className="flex items-center gap-2 mb-1 sm:mb-2">
              <div className="w-2 h-2 sm:w-3 sm:h-3 bg-green-600 rounded-full animate-pulse" />
              <h3 className="text-sm sm:text-base font-semibold text-green-900">Current Stage: {currentStage.name}</h3>
            </div>
            <p className="text-xs sm:text-sm text-green-800">
              Day {currentStage.startDay} - {currentStage.endDay} of growth cycle
            </p>
          </div>
        )}
      </div>

      {/* Activities and Tasks */}
      <div className="bg-white rounded-lg sm:rounded-xl shadow-md p-3 sm:p-4 md:p-6">
        <h2 className="text-base sm:text-lg md:text-xl font-bold text-gray-900 mb-3 sm:mb-4">Activities and Tasks</h2>
        
        {/* Stages Tab Control */}
        <div className="mb-3 sm:mb-4">
          <div className="flex gap-1.5 sm:gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-gray-300">
            {stageTabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setSelectedStage(tab.id)}
                className={`px-2.5 py-1.5 sm:px-3 sm:py-2 md:px-4 md:py-2 rounded-md sm:rounded-lg whitespace-nowrap text-xs sm:text-sm md:text-base font-medium transition-all ${
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
        <div className="overflow-x-auto max-h-[400px] sm:max-h-[500px] md:max-h-[600px] overflow-y-auto border border-gray-200 rounded-lg">
          {filteredActivities.length > 0 ? (
            <table className="w-full text-xs sm:text-sm">
              <thead className="bg-gradient-to-r from-green-50 to-emerald-50 sticky top-0 z-10">
                <tr>
                  <th className="px-2 py-2 sm:px-3 sm:py-2.5 md:px-4 md:py-3 text-left text-[10px] sm:text-xs font-semibold text-gray-700 uppercase tracking-wider w-10 sm:w-12">
                    Done
                  </th>
                  <th className="px-2 py-2 sm:px-3 sm:py-2.5 md:px-4 md:py-3 text-left text-[10px] sm:text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Day
                  </th>
                  <th className="px-2 py-2 sm:px-3 sm:py-2.5 md:px-4 md:py-3 text-left text-[10px] sm:text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Activity
                  </th>
                  <th className="px-2 py-2 sm:px-3 sm:py-2.5 md:px-4 md:py-3 text-left text-[10px] sm:text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Stage
                  </th>
                  <th className="px-2 py-2 sm:px-3 sm:py-2.5 md:px-4 md:py-3 text-left text-[10px] sm:text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Urgency
                  </th>
                  <th className="px-2 py-2 sm:px-3 sm:py-2.5 md:px-4 md:py-3 text-left text-[10px] sm:text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Message
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredActivities.map((activity, index) => {
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
                      <td className="px-2 py-2 sm:px-3 sm:py-2.5 md:px-4 md:py-3 whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={isCompleted}
                          onChange={() => toggleTask(taskKey)}
                          disabled={loadingTasks}
                          className="w-4 h-4 sm:w-5 sm:h-5 text-green-600 rounded focus:ring-green-500 cursor-pointer"
                        />
                      </td>
                      <td className="px-2 py-2 sm:px-3 sm:py-2.5 md:px-4 md:py-3 whitespace-nowrap">
                        <span className={`text-[10px] sm:text-xs font-semibold px-1.5 py-0.5 sm:px-2 sm:py-1 rounded ${
                          isToday ? 'bg-yellow-200 text-yellow-900' :
                          isPast ? 'bg-red-100 text-red-700' :
                          isPrePlanting ? 'bg-purple-100 text-purple-700' :
                          'bg-blue-100 text-blue-700'
                        }`}>
                          {displayDay}
                        </span>
                      </td>
                      <td className="px-2 py-2 sm:px-3 sm:py-2.5 md:px-4 md:py-3">
                        <div>
                          <p className={`text-xs sm:text-sm font-medium ${isCompleted ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
                            {activity.action}
                          </p>
                          <div className="mt-1 space-y-0.5 sm:space-y-1">
                            {activity.water && (
                              <p className={`text-[10px] sm:text-xs ${isCompleted ? 'text-gray-400' : 'text-blue-700'}`}>
                                💧 {activity.water}
                              </p>
                            )}
                            {activity.fertilizer && (
                              <p className={`text-[10px] sm:text-xs ${isCompleted ? 'text-gray-400' : 'text-green-700'}`}>
                                🌾 {activity.fertilizer}
                              </p>
                            )}
                            {activity.notes && (
                              <p className={`text-[10px] sm:text-xs ${isCompleted ? 'text-gray-400' : 'text-gray-600'}`}>
                                ℹ️ {activity.notes}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-2 sm:px-3 sm:py-2.5 md:px-4 md:py-3 whitespace-nowrap">
                        <span className="px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-full text-[10px] sm:text-xs font-medium bg-gray-100 text-gray-700">
                          {activity.stage}
                        </span>
                      </td>
                      <td className="px-2 py-2 sm:px-3 sm:py-2.5 md:px-4 md:py-3 whitespace-nowrap">
                        <span className={`px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-full text-[10px] sm:text-xs font-semibold uppercase ${
                          urgency === 'high' ? 'bg-red-100 text-red-700' :
                          urgency === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-green-100 text-green-700'
                        }`}>
                          {urgency}
                        </span>
                      </td>
                      <td className="px-2 py-2 sm:px-3 sm:py-2.5 md:px-4 md:py-3">
                        <p className="text-[10px] sm:text-xs md:text-sm text-gray-600">{message}</p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-8 sm:py-10 md:py-12">
              <p className="text-gray-500 text-sm sm:text-base md:text-lg">No activities for this stage</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
