import { RiceVariety, GrowthStage } from '../data/types';

export interface FertilizerRecommendation {
  stage: string;
  daysRange: string;
  npk: string;
  instructions: string;
}

/**
 * Get fertilizer recommendations based on current stage
 */
export function getFertilizerRecommendations(
  variety: RiceVariety,
  currentStage: GrowthStage | null
): FertilizerRecommendation[] {
  if (!currentStage) return [];

  const recommendations: FertilizerRecommendation[] = [];
  const { N, P2O5, K2O } = variety.npkPerHa;

  // Basal application
  if (currentStage.startDay <= 7) {
    recommendations.push({
      stage: 'Basal (At Planting)',
      daysRange: 'Day 0',
      npk: `${P2O5.min}-${P2O5.max} kg P₂O₅, ${K2O.min}-${K2O.max} kg K₂O`,
      instructions: variety.npkPerHa.applicationTiming[0] || 'Apply compound fertilizer at transplanting'
    });
  }

  // Tillering stage
  if (currentStage.name.toLowerCase().includes('tillering') || 
      (currentStage.startDay >= 20 && currentStage.startDay <= 30)) {
    recommendations.push({
      stage: 'Tillering',
      daysRange: '20-25 days',
      npk: `${Math.round(N.min * 0.4)}-${Math.round(N.max * 0.4)} kg N (40% of total)`,
      instructions: 'First nitrogen split application to promote tillering'
    });
  }

  // Panicle initiation
  if (currentStage.name.toLowerCase().includes('panicle')) {
    recommendations.push({
      stage: 'Panicle Initiation',
      daysRange: `${currentStage.startDay}-${currentStage.endDay} days`,
      npk: `${Math.round(N.min * 0.6)}-${Math.round(N.max * 0.6)} kg N (60% of total)`,
      instructions: 'Second nitrogen split application for grain formation'
    });
  }

  return recommendations;
}

/**
 * Get care recommendations based on current stage
 */
export function getCareRecommendations(
  variety: RiceVariety,
  currentStage: GrowthStage | null
): string[] {
  if (!currentStage) return [];

  const stageName = currentStage.name.toLowerCase();
  const recommendations: string[] = [];

  if (stageName.includes('seedling')) {
    recommendations.push('Maintain shallow water level (2-5 cm)');
    recommendations.push('Monitor for damping-off disease');
    recommendations.push('Apply pre-emergence herbicide if needed');
  } else if (stageName.includes('tillering')) {
    recommendations.push('Maintain water level at 5-7 cm');
    recommendations.push('Apply first nitrogen fertilizer split');
    recommendations.push('Monitor for leaf folder and stem borer');
    recommendations.push('Remove weeds manually or with herbicide');
  } else if (stageName.includes('panicle')) {
    recommendations.push('Increase water depth to 7-10 cm');
    recommendations.push('Apply second nitrogen split');
    recommendations.push('Monitor for blast disease');
    recommendations.push('Scout for brown planthopper');
  } else if (stageName.includes('heading') || stageName.includes('flowering')) {
    recommendations.push('Maintain consistent water level');
    recommendations.push('Avoid pesticide application during flowering');
    recommendations.push('Monitor for bacterial leaf blight');
  } else if (stageName.includes('grain') || stageName.includes('ripening')) {
    recommendations.push('Gradually reduce water level');
    recommendations.push('Drain field 1-2 weeks before harvest');
    recommendations.push('Monitor for grain discoloration');
    recommendations.push('Scout for rats and birds');
  } else if (stageName.includes('harvest')) {
    recommendations.push('Harvest when 80-85% of grains are golden yellow');
    recommendations.push('Harvest in the morning for best quality');
    recommendations.push('Dry to 14% moisture content for storage');
  }

  // Add variety-specific warnings
  if (variety.diseaseReaction.tungro?.includes('susceptible')) {
    recommendations.push('⚠️ Variety is susceptible to tungro - control leafhoppers');
  }
  if (variety.agronomicStats.lodgingResistance === 'moderate') {
    recommendations.push('⚠️ Avoid over-fertilization with nitrogen to prevent lodging');
  }

  return recommendations;
}

/**
 * Get pest and disease alerts based on variety and stage
 */
export function getPestAlerts(
  variety: RiceVariety,
  currentStage: GrowthStage | null
): string[] {
  if (!currentStage) return [];

  const alerts: string[] = [];
  const stageName = currentStage.name.toLowerCase();

  // Stage-specific alerts
  if (stageName.includes('tillering')) {
    alerts.push('Monitor for stem borer (YSB) - check for dead hearts');
    alerts.push('Scout for leaf folder - look for folded leaves');
  }

  if (stageName.includes('panicle') || stageName.includes('heading')) {
    alerts.push('High risk for blast disease - scout for lesions');
    if (variety.diseaseReaction.brown_planthopper !== 'resistant') {
      alerts.push('Monitor brown planthopper populations');
    }
  }

  // Variety-specific disease susceptibility
  if (variety.diseaseReaction.tungro?.includes('susceptible')) {
    alerts.push('⚠️ High tungro risk - control leafhopper vectors');
  }
  
  if (variety.diseaseReaction.blast?.includes('susceptible')) {
    alerts.push('⚠️ Susceptible to blast - apply preventive fungicide if needed');
  }

  return alerts;
}
