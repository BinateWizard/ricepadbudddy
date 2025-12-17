// Base activity library - shared across all varieties
// Stage-based activities that apply universally

export interface Activity {
  action: string;
  condition?: string;
  timing?: string;
  frequency?: string;
  type: 'required' | 'conditional' | 'advisory';
}

export interface StageActivities {
  [key: string]: Activity[];
}

export const ACTIVITIES: StageActivities = {
  'Germination/Seedling': [
    {
      action: 'Prepare seedbed with proper leveling',
      type: 'required'
    },
    {
      action: 'Maintain shallow water in seedbed',
      condition: 'if dry season',
      type: 'conditional'
    }
  ],
  
  'Vegetative (Tillering)': [
    {
      action: 'Apply first N split fertilizer',
      timing: '20-25 days after transplanting',
      type: 'required'
    },
    {
      action: 'Maintain shallow flooding (2-5 cm)',
      condition: 'if soil surface cracks or leaves roll',
      type: 'conditional'
    },
    {
      action: 'Scout for pests and diseases',
      frequency: 'weekly',
      type: 'advisory'
    },
    {
      action: 'Check leaf color with LCC',
      frequency: 'every 10 days',
      type: 'advisory'
    }
  ],
  
  'Maximum Tillering / Stem Elongation': [
    {
      action: 'Monitor tiller development',
      frequency: 'weekly',
      type: 'advisory'
    },
    {
      action: 'Maintain water level at 5 cm',
      type: 'required'
    },
    {
      action: 'Scout for stem borer and leaf folder',
      frequency: 'twice weekly',
      type: 'advisory'
    }
  ],
  
  'Panicle Initiation': [
    {
      action: 'Apply second N split fertilizer',
      timing: 'at panicle initiation',
      type: 'required'
    },
    {
      action: 'Maintain continuous shallow flooding',
      type: 'required'
    },
    {
      action: 'Scout for blast disease',
      frequency: 'every 3 days',
      type: 'advisory'
    }
  ],
  
  'Heading': [
    {
      action: 'Maintain standing water',
      condition: 'critical for grain formation',
      type: 'required'
    },
    {
      action: 'Monitor for brown planthopper',
      frequency: 'daily',
      type: 'advisory'
    }
  ],
  
  'Flowering': [
    {
      action: 'Maintain continuous shallow flooding',
      condition: 'avoid any water stress',
      type: 'required'
    },
    {
      action: 'Monitor for neck blast',
      frequency: 'daily',
      type: 'advisory'
    }
  ],
  
  'Grain Filling': [
    {
      action: 'Maintain shallow flooding',
      timing: 'until 7-10 days before harvest',
      type: 'required'
    },
    {
      action: 'Scout for grain discoloration',
      frequency: 'weekly',
      type: 'advisory'
    }
  ],
  
  'Harvest Mature': [
    {
      action: 'Drain field',
      timing: '7-10 days before harvest',
      type: 'required'
    },
    {
      action: 'Check grain moisture',
      condition: 'harvest at 20-25% moisture',
      type: 'advisory'
    },
    {
      action: 'Prepare harvesting equipment',
      type: 'required'
    }
  ]
};
