// Rice variety data types

export interface MaturityDays {
  min: number;
  max: number;
  notes?: string;
}

export interface NPKRecommendation {
  N: { min: number; max: number };
  P2O5: { min: number; max: number };
  K2O: { min: number; max: number };
  applicationTiming: string[];
}

export interface GrowthStage {
  name: string;
  startDay: number;
  endDay: number;
}

export interface AgronomicStats {
  plantHeightCm: string;
  yieldPotentialTHa: string;
  tillering: string;
  lodgingResistance: string;
  notes?: string;
}

export interface DiseaseReaction {
  [key: string]: string;
}

export interface VarietyActivity {
  day: number;
  action: string;
  water?: string;
  fertilizer?: string;
  notes?: string;
  type?: 'irrigation' | 'fertilization' | 'pest-scouting' | 'observation' | 'harvest';
  plantingMethod?: 'transplant' | 'direct-seeding' | 'both'; // Filter activities by planting method
}

export interface RiceVariety {
  id: string;
  name: string;
  aliases: string[];
  breeder: string;
  plantingMethod: ('transplanting' | 'direct-seeded')[];
  maturityDays: MaturityDays;
  npkPerHa: NPKRecommendation;
  growthStages: GrowthStage[];
  activities: VarietyActivity[];
  agronomicStats: AgronomicStats;
  diseaseReaction: DiseaseReaction;
  notes: string;
}

export type VarietyDuration = 'early' | 'medium' | 'late';
