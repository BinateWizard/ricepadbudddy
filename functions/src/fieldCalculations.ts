/**
 * Field Area Calculation Functions
 * Calculates area for fields based on plot points to assist NPK recommendations
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

/**
 * Calculate polygon area using Shoelace formula
 * @param points Array of {lat, lng} coordinates
 * @returns Area in square meters
 */
function calculatePolygonArea(points: Array<{ lat: number; lng: number }>): number {
  if (points.length < 3) {
    return 0;
  }
  
  // Convert lat/lng to meters using approximation
  // At equator: 1 degree lat ≈ 111,320 meters, 1 degree lng ≈ 111,320 * cos(lat) meters
  
  const avgLat = points.reduce((sum, p) => sum + p.lat, 0) / points.length;
  const latToMeters = 111320;
  const lngToMeters = 111320 * Math.cos((avgLat * Math.PI) / 180);
  
  // Convert to cartesian coordinates
  const cartesian = points.map(p => ({
    x: p.lng * lngToMeters,
    y: p.lat * latToMeters
  }));
  
  // Shoelace formula
  let area = 0;
  for (let i = 0; i < cartesian.length; i++) {
    const j = (i + 1) % cartesian.length;
    area += cartesian[i].x * cartesian[j].y;
    area -= cartesian[j].x * cartesian[i].y;
  }
  
  return Math.abs(area / 2);
}

/**
 * Calculate Field Area
 * Trigger: Firestore /fields/{fieldId} onCreate or onUpdate
 * 
 * When field plot is created or updated:
 * - Calculates polygon area
 * - Stores area in field document
 * - Triggers NPK recommendation update
 */
export const calculateFieldArea = functions.firestore
  .document('fields/{fieldId}')
  .onWrite(async (change, context) => {
    const fieldId = context.params.fieldId;
    
    // Skip if field was deleted
    if (!change.after.exists) {
      return null;
    }
    
    const fieldData = change.after.data();
    const previousData = change.before.exists ? change.before.data() : null;
    
    // Check if plot changed
    const plotChanged = JSON.stringify(previousData?.plot) !== JSON.stringify(fieldData.plot);
    
    if (!plotChanged && previousData?.area) {
      // Plot hasn't changed and area already calculated
      return null;
    }
    
    // Skip if no plot points
    if (!fieldData.plot || !Array.isArray(fieldData.plot) || fieldData.plot.length < 3) {
      console.log(`[Field Area] Field ${fieldId} has insufficient plot points`);
      return null;
    }
    
    console.log(`[Field Area] Calculating area for field ${fieldId} with ${fieldData.plot.length} points`);
    
    try {
      // Calculate area
      const areaM2 = calculatePolygonArea(fieldData.plot);
      const areaHectares = areaM2 / 10000;
      const areaAcres = areaM2 / 4046.86;
      
      console.log(`[Field Area] Field ${fieldId} area: ${areaM2.toFixed(2)} m² (${areaHectares.toFixed(4)} ha)`);
      
      // Update field document
      await change.after.ref.update({
        area: {
          squareMeters: Math.round(areaM2 * 100) / 100,  // Round to 2 decimals
          hectares: Math.round(areaHectares * 10000) / 10000,  // Round to 4 decimals
          acres: Math.round(areaAcres * 100) / 100,
          calculatedAt: Date.now()
        }
      });
      
      console.log(`[Field Area] Updated field ${fieldId} with area data`);
      
      // Trigger NPK recommendation recalculation if field has devices
      if (fieldData.devices && fieldData.devices.length > 0) {
        try {
          await recalculateNPKRecommendation(fieldId, areaHectares, fieldData);
        } catch (error: any) {
          console.error(`[Field Area] Error calculating NPK recommendation:`, error.message);
        }
      }
      
      return { success: true, fieldId, area: areaM2 };
      
    } catch (error: any) {
      console.error(`[Field Area] Error calculating area for field ${fieldId}:`, error);
      
      await admin.firestore().collection('systemLogs').add({
        functionName: 'calculateFieldArea',
        fieldId,
        error: error.message,
        stack: error.stack,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
      
      return null;
    }
  });

/**
 * Recalculate NPK Recommendation based on area and current NPK levels
 */
async function recalculateNPKRecommendation(
  fieldId: string,
  areaHectares: number,
  fieldData: any
): Promise<void> {
  console.log(`[NPK Recommendation] Calculating for field ${fieldId} (${areaHectares.toFixed(4)} ha)`);
  
  const firestore = admin.firestore();
  const database = admin.database();
  
  // Get current NPK levels from all devices in field
  const deviceIds = fieldData.devices || [];
  
  if (deviceIds.length === 0) {
    console.log(`[NPK Recommendation] No devices in field ${fieldId}`);
    return;
  }
  
  let totalN = 0, totalP = 0, totalK = 0, count = 0;
  
  for (const deviceId of deviceIds) {
    try {
      const npkSnap = await database.ref(`/devices/${deviceId}/npk`).once('value');
      
      if (npkSnap.exists()) {
        const npk = npkSnap.val();
        const n = npk.n ?? npk.nitrogen ?? 0;
        const p = npk.p ?? npk.phosphorus ?? 0;
        const k = npk.k ?? npk.potassium ?? 0;
        
        if (n > 0 || p > 0 || k > 0) {
          totalN += n;
          totalP += p;
          totalK += k;
          count++;
        }
      }
    } catch (error: any) {
      console.error(`[NPK Recommendation] Error reading device ${deviceId}:`, error.message);
    }
  }
  
  if (count === 0) {
    console.log(`[NPK Recommendation] No NPK data available for field ${fieldId}`);
    return;
  }
  
  // Calculate averages
  const avgN = Math.round(totalN / count);
  const avgP = Math.round(totalP / count);
  const avgK = Math.round(totalK / count);
  
  console.log(`[NPK Recommendation] Average NPK: N=${avgN}, P=${avgP}, K=${avgK}`);
  
  // NPK Recommendation Logic (simplified)
  // Based on typical rice farming requirements
  
  // Target levels (ppm)
  const targetN = 150;  // Nitrogen
  const targetP = 50;   // Phosphorus
  const targetK = 100;  // Potassium
  
  // Calculate deficit
  const deficitN = Math.max(0, targetN - avgN);
  const deficitP = Math.max(0, targetP - avgP);
  const deficitK = Math.max(0, targetK - avgK);
  
  // Convert deficit to kg per hectare (simplified conversion)
  // These are rough approximations - actual conversion depends on fertilizer type
  const nKgPerHa = deficitN * 0.5;  // N deficit to urea kg/ha
  const pKgPerHa = deficitP * 0.7;  // P deficit to phosphate kg/ha
  const kKgPerHa = deficitK * 0.6;  // K deficit to potash kg/ha
  
  // Total for the field
  const nKgTotal = Math.round(nKgPerHa * areaHectares * 100) / 100;
  const pKgTotal = Math.round(pKgPerHa * areaHectares * 100) / 100;
  const kKgTotal = Math.round(kKgPerHa * areaHectares * 100) / 100;
  
  // Determine status
  const nStatus = avgN >= targetN ? 'optimal' : avgN >= targetN * 0.7 ? 'low' : 'critical';
  const pStatus = avgP >= targetP ? 'optimal' : avgP >= targetP * 0.7 ? 'low' : 'critical';
  const kStatus = avgK >= targetK ? 'optimal' : avgK >= targetK * 0.7 ? 'low' : 'critical';
  
  const recommendation = {
    currentLevels: {
      nitrogen: avgN,
      phosphorus: avgP,
      potassium: avgK
    },
    targetLevels: {
      nitrogen: targetN,
      phosphorus: targetP,
      potassium: targetK
    },
    status: {
      nitrogen: nStatus,
      phosphorus: pStatus,
      potassium: kStatus,
      overall: (nStatus === 'critical' || pStatus === 'critical' || kStatus === 'critical') 
        ? 'critical' 
        : (nStatus === 'low' || pStatus === 'low' || kStatus === 'low') 
          ? 'needs_attention' 
          : 'optimal'
    },
    fertilizer: {
      nitrogenKg: nKgTotal,
      phosphorusKg: pKgTotal,
      potassiumKg: kKgTotal,
      unit: 'kg',
      areaHectares: areaHectares
    },
    calculatedAt: Date.now(),
    basedOnDevices: count
  };
  
  // Update field with recommendation
  await firestore.collection('fields').doc(fieldId).update({
    npkRecommendation: recommendation
  });
  
  console.log(`[NPK Recommendation] Updated field ${fieldId} with recommendations: N=${nKgTotal}kg, P=${pKgTotal}kg, K=${kKgTotal}kg`);
  
  // Notify owner if status is critical
  if (recommendation.status.overall === 'critical') {
    try {
      const userRef = firestore.collection('users').doc(fieldData.ownerId);
      const userDoc = await userRef.get();
      
      if (userDoc.exists) {
        const userData = userDoc.data();
        const notifications = userData?.notifications || [];
        
        const criticalNutrients = [];
        if (nStatus === 'critical') criticalNutrients.push('Nitrogen');
        if (pStatus === 'critical') criticalNutrients.push('Phosphorus');
        if (kStatus === 'critical') criticalNutrients.push('Potassium');
        
        notifications.unshift({
          type: 'system',
          message: `Critical nutrient levels in ${fieldData.name}: ${criticalNutrients.join(', ')} deficiency detected`,
          timestamp: Date.now(),
          read: false,
          fieldId: fieldId
        });
        
        if (notifications.length > 50) {
          notifications.splice(50);
        }
        
        await userRef.update({ notifications });
        
        console.log(`[NPK Recommendation] Critical nutrient alert sent for field ${fieldId}`);
      }
    } catch (error: any) {
      console.error(`[NPK Recommendation] Error sending notification:`, error.message);
    }
  }
}

/**
 * Calculate Device Plot Area
 * Trigger: Firestore /devices/{deviceDocId} onWrite
 * 
 * Similar to field area calculation but for individual devices
 */
export const calculateDevicePlotArea = functions.firestore
  .document('devices/{deviceDocId}')
  .onWrite(async (change, context) => {
    if (!change.after.exists) {
      return null;
    }
    
    const deviceData = change.after.data();
    const previousData = change.before.exists ? change.before.data() : null;
    
    // Check if plot changed
    const plotChanged = JSON.stringify(previousData?.plot) !== JSON.stringify(deviceData.plot);
    
    if (!plotChanged && previousData?.plotArea) {
      return null;
    }
    
    if (!deviceData.plot || !Array.isArray(deviceData.plot) || deviceData.plot.length < 3) {
      return null;
    }
    
    console.log(`[Device Plot] Calculating area for device ${deviceData.deviceId}`);
    
    try {
      const areaM2 = calculatePolygonArea(deviceData.plot);
      const areaHectares = areaM2 / 10000;
      
      await change.after.ref.update({
        plotArea: {
          squareMeters: Math.round(areaM2 * 100) / 100,
          hectares: Math.round(areaHectares * 10000) / 10000,
          calculatedAt: Date.now()
        }
      });
      
      console.log(`[Device Plot] Device ${deviceData.deviceId} plot area: ${areaM2.toFixed(2)} m²`);
      
      return { success: true, deviceId: deviceData.deviceId, area: areaM2 };
      
    } catch (error: any) {
      console.error(`[Device Plot] Error calculating area:`, error);
      return null;
    }
  });
