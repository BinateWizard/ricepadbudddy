import { RiceVariety } from './types';

export const RICE_VARIETIES: RiceVariety[] = [
  {
    id: 'ir64',
    name: 'IR64',
    aliases: ['IR64 (IRRI mega-variety)'],
    breeder: 'IRRI',
    plantingMethod: ['transplanting'],
    maturityDays: {
      min: 120,
      max: 135,
      notes: 'varies by seed lot and environment; often reported ~130 days in many Philippine trials.'
    },
    npkPerHa: {
      N: { min: 90, max: 120 },
      P2O5: { min: 30, max: 60 },
      K2O: { min: 30, max: 60 },
      applicationTiming: [
        'Basal: basal compound (e.g., 14-14-14) at transplanting depending on soil test',
        'Split N: first split at tillering (20-25 days), second split at panicle initiation/heading',
        'Note: Philippine extension commonly uses combinations of compound + urea splits; adjust to soil fertility and PalayCheck guidance.'
      ]
    },
    growthStages: [
      { name: 'Germination/Seedling', startDay: 0, endDay: 7 },
      { name: 'Vegetative (Tillering Begins)', startDay: 7, endDay: 30 },
      { name: 'Maximum Tillering / Stem Elongation', startDay: 30, endDay: 60 },
      { name: 'Panicle Initiation', startDay: 60, endDay: 90 },
      { name: 'Heading', startDay: 90, endDay: 100 },
      { name: 'Flowering', startDay: 100, endDay: 105 },
      { name: 'Grain Filling', startDay: 105, endDay: 130 },
      { name: 'Harvest Mature', startDay: 130, endDay: 135 }
    ],
    activities: [
      { day: 0, action: 'Transplant seedlings into paddy', water: 'Keep soil moist, saturated', type: 'observation', plantingMethod: 'transplant' },
      { day: 1, action: 'Establish shallow flooding', water: 'Maintain 2–5 cm water depth', type: 'irrigation' },
      { day: 0, action: 'Apply basal fertilizer (14-14-14)', fertilizer: 'Based on soil test', type: 'fertilization', notes: 'Compound fertilizer at transplanting' },
      { day: 7, action: 'Monitor seedling establishment', water: 'Maintain shallow flooding', type: 'observation' },
      { day: 20, action: 'First N split application', fertilizer: 'Apply urea at tillering (20-25 days)', type: 'fertilization' },
      { day: 25, action: 'Scout for stem borer', notes: 'Check for early pest damage', type: 'pest-scouting' },
      { day: 30, action: 'Monitor tiller development', water: 'Maintain 5 cm water level', type: 'observation' },
      { day: 40, action: 'Scout for leaf folder', notes: 'Weekly pest monitoring', type: 'pest-scouting' },
      { day: 60, action: 'Second N split at panicle initiation', fertilizer: 'Apply remaining N', type: 'fertilization' },
      { day: 65, action: 'Scout for blast disease', notes: 'Monitor leaves for blast symptoms', type: 'pest-scouting' },
      { day: 90, action: 'Heading stage monitoring', water: 'Maintain continuous flooding', type: 'observation', notes: 'Critical for grain formation' },
      { day: 95, action: 'Monitor for brown planthopper', notes: 'Daily checks during heading', type: 'pest-scouting' },
      { day: 100, action: 'Flowering stage', water: 'Maintain adequate moisture', type: 'observation' },
      { day: 120, action: 'Begin draining field', water: 'Gradually reduce water', type: 'irrigation', notes: 'Prepare for harvest' },
      { day: 130, action: 'Harvest when 80-85% grains are mature', type: 'harvest', notes: 'Avoid over-fertilizing N to reduce lodging risk' }
    ],
    agronomicStats: {
      plantHeightCm: '90-110',
      yieldPotentialTHa: '4-7',
      tillering: 'good',
      lodgingResistance: 'moderate',
      notes: 'Susceptible to lodging under strong winds if over-fertilized with N'
    },
    diseaseReaction: {
      blast: 'intermediate to variable',
      bacterial_leaf_blight: 'variable / intermediate',
      brown_planthopper: 'moderate susceptibility to tolerance',
      tungro: 'susceptible in some reports'
    },
    notes: 'IR64 is a widely used mega-variety with well-documented performance but exact reactions vary by environment and seed generation.'
  },
  {
    id: 'nsic-rc216',
    name: 'NSIC Rc216 (Mestiso)',
    aliases: ['Rc216', 'Mestiso'],
    breeder: 'NSIC / PhilRice',
    plantingMethod: ['transplanting', 'direct-seeded'],
    maturityDays: {
      min: 104,
      max: 112,
      notes: '104 days direct-seeded, ~112 days transplanted'
    },
    npkPerHa: {
      N: { min: 80, max: 120 },
      P2O5: { min: 30, max: 60 },
      K2O: { min: 30, max: 60 },
      applicationTiming: [
        'Basal compound at transplanting',
        'Split N: at active tillering and near panicle initiation'
      ]
    },
    growthStages: [
      { name: 'Germination/Seedling', startDay: 0, endDay: 7 },
      { name: 'Vegetative (Tillering)', startDay: 7, endDay: 45 },
      { name: 'Panicle Initiation', startDay: 45, endDay: 60 },
      { name: 'Heading', startDay: 80, endDay: 95 },
      { name: 'Flowering', startDay: 95, endDay: 100 },
      { name: 'Ripening/Harvest', startDay: 100, endDay: 112 }
    ],
    activities: [
      { day: 0, action: 'Apply basal compound fertilizer', fertilizer: 'Apply 14-14-14 or similar', type: 'fertilization' },
      { day: 1, action: 'Begin shallow flooding', water: 'Maintain 2–5 cm water', type: 'irrigation' },
      { day: 7, action: 'Monitor germination/establishment', water: 'Ensure adequate moisture', type: 'observation' },
      { day: 20, action: 'First N split at active tillering', fertilizer: 'Apply urea', type: 'fertilization' },
      { day: 30, action: 'Scout for pests', notes: 'Check for stem borer and leaf folder', type: 'pest-scouting' },
      { day: 45, action: 'Second N split at panicle initiation', fertilizer: 'Apply remaining N', type: 'fertilization' },
      { day: 50, action: 'Monitor tillering', water: 'Maintain field water level', type: 'observation', notes: 'Good tillering variety' },
      { day: 65, action: 'Scout for diseases', notes: 'Check for blast and bacterial blight', type: 'pest-scouting' },
      { day: 80, action: 'Heading stage monitoring', water: 'Maintain adequate water', type: 'observation' },
      { day: 95, action: 'Flowering observation', type: 'observation' },
      { day: 100, action: 'Begin field drainage', water: 'Gradually drain', type: 'irrigation' },
      { day: 104, action: 'Harvest (direct-seeded)', type: 'harvest', notes: 'Earlier for direct-seeded', plantingMethod: 'direct-seeding' },
      { day: 112, action: 'Harvest (transplanted)', type: 'harvest', notes: 'Suitable for ratooning', plantingMethod: 'transplant' }
    ],
    agronomicStats: {
      plantHeightCm: 'medium',
      yieldPotentialTHa: '4-8',
      tillering: 'good',
      lodgingResistance: 'moderate',
      notes: 'Favored for ratooning and early maturity fits cropping calendars'
    },
    diseaseReaction: {
      brown_planthopper: 'moderate resistance',
      green_leafhopper: 'moderate resistance',
      yellow_stem_borer: 'moderate resistance',
      tungro: 'susceptible'
    },
    notes: 'Often recommended for its early maturity and good yield; maturity values depend on whether transplanted or direct-seeded.'
  },
  {
    id: 'nsic-rc222',
    name: 'NSIC Rc222 (Sinandomeng)',
    aliases: ['Rc222', 'Sinandomeng'],
    breeder: 'NSIC / IRRI lineage',
    plantingMethod: ['transplanting', 'direct-seeded'],
    maturityDays: {
      min: 106,
      max: 114,
      notes: 'Direct-seeded 106, transplanted 114 reported'
    },
    npkPerHa: {
      N: { min: 80, max: 120 },
      P2O5: { min: 30, max: 60 },
      K2O: { min: 30, max: 60 },
      applicationTiming: [
        'Compound basal at planting + urea splits at tillering and panicle initiation'
      ]
    },
    growthStages: [
      { name: 'Germination/Seedling', startDay: 0, endDay: 7 },
      { name: 'Vegetative (Tillering)', startDay: 7, endDay: 50 },
      { name: 'Panicle Initiation', startDay: 50, endDay: 75 },
      { name: 'Heading/Flowering', startDay: 75, endDay: 100 },
      { name: 'Harvest', startDay: 100, endDay: 114 }
    ],
    activities: [
      { day: 0, action: 'Apply basal compound', fertilizer: 'Compound basal', type: 'fertilization' },
      { day: 1, action: 'Establish water level', water: '2–5 cm flooding', type: 'irrigation' },
      { day: 25, action: 'N split at tillering', fertilizer: 'Urea application', type: 'fertilization' },
      { day: 35, action: 'Pest scouting', notes: 'Check for BPH and GLH', type: 'pest-scouting' },
      { day: 50, action: 'N split at panicle initiation', fertilizer: 'Second N split', type: 'fertilization' },
      { day: 60, action: 'Monitor tillering', water: 'Maintain water', type: 'observation', notes: 'Very good tillering' },
      { day: 75, action: 'Heading monitoring', type: 'observation' },
      { day: 90, action: 'Scout for diseases', notes: 'Monitor blast and blight', type: 'pest-scouting' },
      { day: 100, action: 'Begin drainage', water: 'Drain field', type: 'irrigation' },
      { day: 106, action: 'Harvest (direct-seeded)', type: 'harvest', plantingMethod: 'direct-seeding' },
      { day: 114, action: 'Harvest (transplanted)', type: 'harvest', plantingMethod: 'transplant' }
    ],
    agronomicStats: {
      plantHeightCm: 'medium',
      yieldPotentialTHa: '4-7+',
      tillering: 'very good',
      lodgingResistance: 'moderate',
      notes: 'Recommended nationally for DS & WS (dry & wet season)'
    },
    diseaseReaction: {
      blast: 'intermediate',
      bacterial_leaf_blight: 'intermediate',
      brown_planthopper: 'moderately resistant',
      green_leafhopper: 'moderately resistant',
      tungro: 'intermediate or variable'
    },
    notes: 'One of the widely promoted NSIC varieties for general-purpose cultivation.'
  },
  {
    id: 'nsic-rc160',
    name: 'NSIC Rc160 (Tubigan)',
    aliases: ['Rc160', 'Tubigan'],
    breeder: 'NSIC',
    plantingMethod: ['transplanting'],
    maturityDays: {
      min: 100,
      max: 120,
      notes: 'Often categorized among shorter-to-medium duration varieties'
    },
    npkPerHa: {
      N: { min: 70, max: 110 },
      P2O5: { min: 30, max: 50 },
      K2O: { min: 20, max: 50 },
      applicationTiming: [
        'Compound basal + N splits at tillering and panicle initiation'
      ]
    },
    growthStages: [
      { name: 'Germination/Seedling', startDay: 0, endDay: 7 },
      { name: 'Vegetative', startDay: 7, endDay: 50 },
      { name: 'Panicle Initiation', startDay: 45, endDay: 70 },
      { name: 'Heading', startDay: 70, endDay: 90 },
      { name: 'Harvest', startDay: 100, endDay: 120 }
    ],
    activities: [
      { day: 0, action: 'Transplant seedlings', water: 'Saturate soil', type: 'observation', plantingMethod: 'transplant' },
      { day: 0, action: 'Apply basal fertilizer', fertilizer: 'Compound basal', type: 'fertilization' },
      { day: 1, action: 'Flood field', water: '2–5 cm', type: 'irrigation' },
      { day: 20, action: 'N split at tillering', fertilizer: 'Urea', type: 'fertilization' },
      { day: 30, action: 'Pest monitoring', type: 'pest-scouting' },
      { day: 45, action: 'N split at panicle initiation', fertilizer: 'Second N', type: 'fertilization' },
      { day: 60, action: 'Monitor water level', water: 'Maintain flooding', type: 'irrigation' },
      { day: 70, action: 'Heading stage', type: 'observation' },
      { day: 85, action: 'Disease check', type: 'pest-scouting' },
      { day: 95, action: 'Drain field', water: 'Begin drainage', type: 'irrigation' },
      { day: 100, action: 'Harvest', type: 'harvest' }
    ],
    agronomicStats: {
      plantHeightCm: 'medium',
      yieldPotentialTHa: '3.5-6.5',
      tillering: 'good',
      lodgingResistance: 'moderate',
      notes: 'Selected for fit into common cropping calendars'
    },
    diseaseReaction: {
      general: 'variable; check local seed tag for disease reaction'
    },
    notes: 'Used widely enough to be included in PalayCheck recommendations for certain areas.'
  },
  {
    id: 'psb-rc10',
    name: 'PSB Rc10 (Pagsanjan)',
    aliases: ['PSB Rc10', 'Pagsanjan'],
    breeder: 'PSB',
    plantingMethod: ['direct-seeded'],
    maturityDays: {
      min: 105,
      max: 110,
      notes: 'Often described as early-maturing (~105 days)'
    },
    npkPerHa: {
      N: { min: 70, max: 100 },
      P2O5: { min: 20, max: 50 },
      K2O: { min: 20, max: 50 },
      applicationTiming: [
        'Basal compound at transplant + N split at tillering and PI'
      ]
    },
    growthStages: [
      { name: 'Germination/Seedling', startDay: 0, endDay: 7 },
      { name: 'Vegetative/Tillering', startDay: 7, endDay: 40 },
      { name: 'Panicle Initiation', startDay: 40, endDay: 60 },
      { name: 'Flowering', startDay: 60, endDay: 90 },
      { name: 'Harvest', startDay: 105, endDay: 110 }
    ],
    activities: [
      { day: 0, action: 'Direct-seed into field', water: 'Keep soil moist', type: 'observation', notes: 'Early-maturing variety' },
      { day: 0, action: 'Apply basal fertilizer', fertilizer: 'Compound basal', type: 'fertilization' },
      { day: 3, action: 'Monitor germination', water: 'Ensure moisture', type: 'observation' },
      { day: 7, action: 'Establish flooding', water: '2–5 cm', type: 'irrigation' },
      { day: 20, action: 'N split at tillering', fertilizer: 'Urea', type: 'fertilization' },
      { day: 30, action: 'Pest check', type: 'pest-scouting' },
      { day: 40, action: 'N split at PI', fertilizer: 'Second N', type: 'fertilization' },
      { day: 60, action: 'Flowering monitoring', type: 'observation' },
      { day: 75, action: 'Disease scouting', type: 'pest-scouting' },
      { day: 95, action: 'Drain field', water: 'Begin drainage', type: 'irrigation' },
      { day: 105, action: 'Harvest', type: 'harvest', notes: 'Avoids late typhoon season' }
    ],
    agronomicStats: {
      plantHeightCm: 'short to medium',
      yieldPotentialTHa: '3.5-6',
      tillering: 'good',
      lodgingResistance: 'better',
      notes: 'Early-maturing varieties often avoid typhoon season, reducing lodging risk'
    },
    diseaseReaction: {
      general: 'moderate resistance to common pests'
    },
    notes: 'Commonly recommended for short-season windows. Favored when cropping calendar requires earlier harvest before typhoon months.'
  },
  {
    id: 'psb-rc12',
    name: 'PSB Rc12 (Caliraya)',
    aliases: ['PSB Rc12', 'Caliraya'],
    breeder: 'PSB',
    plantingMethod: ['transplanting', 'direct-seeded'],
    maturityDays: {
      min: 105,
      max: 115,
      notes: 'Classified among early-maturing recommended varieties'
    },
    npkPerHa: {
      N: { min: 70, max: 110 },
      P2O5: { min: 20, max: 50 },
      K2O: { min: 20, max: 50 },
      applicationTiming: [
        'Basal compound + N splits at tillering and PI'
      ]
    },
    growthStages: [
      { name: 'Germination/Seedling', startDay: 0, endDay: 7 },
      { name: 'Vegetative', startDay: 7, endDay: 45 },
      { name: 'Panicle Initiation', startDay: 45, endDay: 65 },
      { name: 'Flowering', startDay: 65, endDay: 90 },
      { name: 'Harvest', startDay: 105, endDay: 115 }
    ],
    activities: [
      { day: 0, action: 'Basal fertilizer', fertilizer: 'Compound', type: 'fertilization' },
      { day: 1, action: 'Flood field', water: '2–5 cm', type: 'irrigation' },
      { day: 22, action: 'N split at tillering', fertilizer: 'Urea', type: 'fertilization' },
      { day: 35, action: 'Pest monitoring', type: 'pest-scouting' },
      { day: 45, action: 'N split at PI', fertilizer: 'Second N', type: 'fertilization' },
      { day: 65, action: 'Flowering check', type: 'observation' },
      { day: 80, action: 'Disease check', type: 'pest-scouting' },
      { day: 95, action: 'Drain field', water: 'Drainage', type: 'irrigation' },
      { day: 105, action: 'Harvest', type: 'harvest', notes: 'Early maturity' }
    ],
    agronomicStats: {
      plantHeightCm: 'short to medium',
      yieldPotentialTHa: '4-7',
      tillering: 'good',
      lodgingResistance: 'moderate',
      notes: 'Early maturity reduces exposure to late storms'
    },
    diseaseReaction: {
      general: 'rated suitable for rainfed areas'
    },
    notes: 'Good option where early maturity and fitting cropping windows matter.'
  },
  {
    id: 'psb-rc14',
    name: 'PSB Rc14 (Rio Grande)',
    aliases: ['PSB Rc14', 'Rio Grande'],
    breeder: 'PSB',
    plantingMethod: ['transplanting', 'direct-seeded'],
    maturityDays: {
      min: 105,
      max: 115,
      notes: 'Early-to-medium maturing PSB line promoted for rainfed lowlands'
    },
    npkPerHa: {
      N: { min: 70, max: 110 },
      P2O5: { min: 20, max: 50 },
      K2O: { min: 20, max: 50 },
      applicationTiming: [
        'Basal compound at planting + N splits at tillering and near PI/heading'
      ]
    },
    growthStages: [
      { name: 'Germination/Seedling', startDay: 0, endDay: 7 },
      { name: 'Vegetative', startDay: 7, endDay: 45 },
      { name: 'Panicle Initiation', startDay: 45, endDay: 65 },
      { name: 'Flowering', startDay: 65, endDay: 90 },
      { name: 'Harvest', startDay: 105, endDay: 115 }
    ],
    activities: [
      { day: 0, action: 'Plant (rainfed suitable)', water: 'Moist', type: 'observation', notes: 'Rainfed lowlands' },
      { day: 0, action: 'Basal fertilizer', fertilizer: 'Compound', type: 'fertilization' },
      { day: 2, action: 'Monitor water', water: 'Adjust to rainfall', type: 'irrigation' },
      { day: 20, action: 'N split at tillering', fertilizer: 'Urea', type: 'fertilization' },
      { day: 30, action: 'Pest check', type: 'pest-scouting' },
      { day: 45, action: 'N split near PI', fertilizer: 'Second N', type: 'fertilization' },
      { day: 65, action: 'Flowering monitoring', type: 'observation' },
      { day: 80, action: 'Disease scouting', type: 'pest-scouting' },
      { day: 95, action: 'Adjust water for harvest', water: 'Reduce', type: 'irrigation' },
      { day: 105, action: 'Harvest', type: 'harvest' }
    ],
    agronomicStats: {
      plantHeightCm: 'short to medium',
      yieldPotentialTHa: '3.5-6.5',
      tillering: 'good',
      lodgingResistance: 'moderate'
    },
    diseaseReaction: {
      general: 'recommended for rainfed areas'
    },
    notes: 'Good for rainfed and fits early-maturing class.'
  },
  {
    id: 'nsic-rc192',
    name: 'NSIC Rc192 (Sahod Ulan 1)',
    aliases: ['Rc192', 'Sahod Ulan 1'],
    breeder: 'NSIC / PhilRice',
    plantingMethod: ['direct-seeded'],
    maturityDays: {
      min: 105,
      max: 110,
      notes: 'Suitable for rainfed areas'
    },
    npkPerHa: {
      N: { min: 70, max: 110 },
      P2O5: { min: 20, max: 50 },
      K2O: { min: 20, max: 50 },
      applicationTiming: [
        'Basal compound + N splits at tillering and panicle initiation'
      ]
    },
    growthStages: [
      { name: 'Germination/Seedling', startDay: 0, endDay: 7 },
      { name: 'Vegetative', startDay: 7, endDay: 45 },
      { name: 'Panicle Initiation', startDay: 45, endDay: 65 },
      { name: 'Flowering', startDay: 65, endDay: 90 },
      { name: 'Harvest', startDay: 105, endDay: 110 }
    ],
    activities: [
      { day: 0, action: 'Direct-seed (rainfed)', water: 'Moist soil', type: 'observation', notes: 'Rainfed suitable' },
      { day: 0, action: 'Basal compound', fertilizer: 'Compound', type: 'fertilization' },
      { day: 5, action: 'Check germination', water: 'Monitor rainfall', type: 'observation' },
      { day: 20, action: 'N split at tillering', fertilizer: 'Urea', type: 'fertilization' },
      { day: 35, action: 'Pest monitoring', type: 'pest-scouting' },
      { day: 45, action: 'N split at PI', fertilizer: 'Second N', type: 'fertilization' },
      { day: 65, action: 'Flowering check', type: 'observation' },
      { day: 80, action: 'Disease check', type: 'pest-scouting' },
      { day: 95, action: 'Prepare for harvest', water: 'Reduce water', type: 'irrigation' },
      { day: 105, action: 'Harvest', type: 'harvest' }
    ],
    agronomicStats: {
      plantHeightCm: 'short to medium',
      yieldPotentialTHa: '3.5-6',
      tillering: 'good',
      lodgingResistance: 'moderate',
      notes: 'Selected for rainfed suitability'
    },
    diseaseReaction: {
      general: 'moderate'
    },
    notes: 'Promoted for rainfed cropping systems and earlier maturity.'
  },
  {
    id: 'nsic-rc226',
    name: 'NSIC Rc226',
    aliases: ['Rc226'],
    breeder: 'NSIC',
    plantingMethod: ['transplanting'],
    maturityDays: {
      min: 110,
      max: 120,
      notes: 'Medium-duration; used in yield trials with MOET+LCC management'
    },
    npkPerHa: {
      N: { min: 80, max: 130 },
      P2O5: { min: 30, max: 60 },
      K2O: { min: 30, max: 60 },
      applicationTiming: [
        'Basal compound + split N at tillering and panicle initiation',
        'Potential extra split under high-yield systems'
      ]
    },
    growthStages: [
      { name: 'Germination/Seedling', startDay: 0, endDay: 7 },
      { name: 'Vegetative', startDay: 7, endDay: 55 },
      { name: 'Panicle Initiation', startDay: 50, endDay: 80 },
      { name: 'Heading/Flowering', startDay: 80, endDay: 100 },
      { name: 'Harvest', startDay: 110, endDay: 120 }
    ],
    activities: [
      { day: 0, action: 'Transplant seedlings', water: 'Saturate', type: 'observation', notes: 'MOET+LCC management', plantingMethod: 'transplant' },
      { day: 0, action: 'Basal compound', fertilizer: 'Compound', type: 'fertilization' },
      { day: 1, action: 'Establish flooding', water: '2–5 cm', type: 'irrigation' },
      { day: 25, action: 'First N split', fertilizer: 'Urea at tillering', type: 'fertilization' },
      { day: 40, action: 'Pest monitoring', type: 'pest-scouting' },
      { day: 50, action: 'Second N split at PI', fertilizer: 'N at PI', type: 'fertilization' },
      { day: 65, action: 'Optional third N split', fertilizer: 'High-yield system', type: 'fertilization', notes: 'If using MOET' },
      { day: 80, action: 'Heading monitoring', water: 'Maintain water', type: 'observation' },
      { day: 90, action: 'Disease scouting', type: 'pest-scouting' },
      { day: 105, action: 'Begin drainage', water: 'Drain', type: 'irrigation' },
      { day: 110, action: 'Harvest', type: 'harvest' }
    ],
    agronomicStats: {
      plantHeightCm: 'medium',
      yieldPotentialTHa: 'high under MOET and improved management',
      tillering: 'good',
      lodgingResistance: 'moderate',
      notes: 'Depends on N management'
    },
    diseaseReaction: {
      general: 'check variety performance bulletins for local ratings'
    },
    notes: 'Often evaluated in research for profitability under specific management packages.'
  },
  {
    id: 'nsic-rc480',
    name: 'NSIC Rc480',
    aliases: ['Rc480'],
    breeder: 'NSIC',
    plantingMethod: ['transplanting', 'direct-seeded'],
    maturityDays: {
      min: 100,
      max: 120,
      notes: 'Recent trial prominence in Philippine research'
    },
    npkPerHa: {
      N: { min: 80, max: 120 },
      P2O5: { min: 30, max: 60 },
      K2O: { min: 30, max: 60 },
      applicationTiming: [
        'Basal compound + split N at tillering and PI'
      ]
    },
    growthStages: [
      { name: 'Germination/Seedling', startDay: 0, endDay: 7 },
      { name: 'Vegetative', startDay: 7, endDay: 55 },
      { name: 'Panicle Initiation', startDay: 50, endDay: 80 },
      { name: 'Flowering', startDay: 80, endDay: 100 },
      { name: 'Harvest', startDay: 100, endDay: 120 }
    ],
    activities: [
      { day: 0, action: 'Basal compound', fertilizer: 'Compound', type: 'fertilization' },
      { day: 1, action: 'Establish water', water: '2–5 cm', type: 'irrigation' },
      { day: 25, action: 'N split at tillering', fertilizer: 'Urea', type: 'fertilization' },
      { day: 40, action: 'Pest monitoring', type: 'pest-scouting' },
      { day: 50, action: 'N split at PI', fertilizer: 'Second N', type: 'fertilization' },
      { day: 70, action: 'Monitor growth', water: 'Maintain level', type: 'observation' },
      { day: 80, action: 'Flowering stage', type: 'observation' },
      { day: 90, action: 'Disease check', type: 'pest-scouting' },
      { day: 95, action: 'Drain field', water: 'Begin drainage', type: 'irrigation' },
      { day: 100, action: 'Harvest', type: 'harvest', notes: 'Short duration when desired' }
    ],
    agronomicStats: {
      plantHeightCm: 'medium',
      yieldPotentialTHa: 'moderate to high in trials',
      tillering: 'good',
      lodgingResistance: 'moderate'
    },
    diseaseReaction: {
      general: 'reported among promising genotypes'
    },
    notes: 'Newer variety often reported among best genotypes when short duration is desired.'
  }
];
