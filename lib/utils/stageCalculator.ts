import { RiceVariety, GrowthStage } from '../data/types';

/**
 * Calculate days since planting
 */
export function getDaysSincePlanting(startDate: Date | string): number {
  const now = new Date();
  const start = typeof startDate === 'string' ? new Date(startDate) : startDate;
  const diff = now.getTime() - start.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

/**
 * Get current growth stage based on days since planting
 */
export function getCurrentStage(
  variety: RiceVariety,
  daysSincePlanting: number
): GrowthStage | null {
  // Find the stage that matches current day
  const stage = variety.growthStages.find(
    s => daysSincePlanting >= s.startDay && daysSincePlanting <= s.endDay
  );
  
  return stage || null;
}

/**
 * Get next growth stage
 */
export function getNextStage(
  variety: RiceVariety,
  currentStage: GrowthStage
): GrowthStage | null {
  const currentIndex = variety.growthStages.findIndex(
    s => s.name === currentStage.name
  );
  
  if (currentIndex === -1 || currentIndex === variety.growthStages.length - 1) {
    return null;
  }
  
  return variety.growthStages[currentIndex + 1];
}

/**
 * Calculate days until next stage
 */
export function getDaysUntilNextStage(
  variety: RiceVariety,
  startDate: Date | string
): number | null {
  const days = getDaysSincePlanting(startDate);
  const currentStage = getCurrentStage(variety, days);
  if (!currentStage) return null;
  
  const nextStage = getNextStage(variety, currentStage);
  if (!nextStage) return null;
  
  return nextStage.startDay - days;
}

/**
 * Calculate expected harvest date
 */
export function getExpectedHarvestDate(
  startDate: Date | string,
  variety: RiceVariety
): Date {
  const start = typeof startDate === 'string' ? new Date(startDate) : startDate;
  const avgMaturity = (variety.maturityDays.min + variety.maturityDays.max) / 2;
  const harvestDate = new Date(start);
  harvestDate.setDate(harvestDate.getDate() + avgMaturity);
  return harvestDate;
}

/**
 * Get progress percentage (0-100)
 */
export function getGrowthProgress(
  variety: RiceVariety,
  daysSincePlanting: number
): number {
  const avgMaturity = (variety.maturityDays.min + variety.maturityDays.max) / 2;
  const progress = (daysSincePlanting / avgMaturity) * 100;
  return Math.min(100, Math.max(0, progress));
}
