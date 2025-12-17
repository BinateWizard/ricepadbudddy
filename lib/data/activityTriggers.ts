// Variety-specific activity triggers and modifiers
// These are SMALL additions to base activities, not separate calendars

export interface VarietyTrigger {
  stage: string;
  type: 'observe' | 'precaution' | 'optional' | 'warning';
  message: string;
}

export const VARIETY_ACTIVITY_TRIGGERS: { [key: string]: VarietyTrigger[] } = {
  'IR64': [
    {
      stage: 'Vegetative (Tillering)',
      type: 'warning',
      message: 'High lodging risk if excess nitrogen is applied'
    },
    {
      stage: 'Panicle Initiation',
      type: 'precaution',
      message: 'Avoid late heavy N application to reduce lodging'
    }
  ],
  
  'NSIC Rc216 (Mestiso)': [
    {
      stage: 'Vegetative (Tillering)',
      type: 'observe',
      message: 'Good tillering capacity - monitor for optimal spacing'
    },
    {
      stage: 'Harvest Mature',
      type: 'optional',
      message: 'Suitable for ratooning under favorable conditions'
    }
  ],
  
  'NSIC Rc222 (Sinandomeng)': [
    {
      stage: 'Flowering',
      type: 'observe',
      message: 'Early maturity variety - monitor closely for harvest timing'
    }
  ],
  
  'NSIC Rc160 (Tubigan)': [
    {
      stage: 'Vegetative (Tillering)',
      type: 'observe',
      message: 'Short duration variety - faster transition between stages'
    }
  ],
  
  'PSB Rc10 (Pagsanjan)': [
    {
      stage: 'Vegetative (Tillering)',
      type: 'observe',
      message: 'Early-maturing variety reduces typhoon exposure risk'
    }
  ],
  
  'PSB Rc12 (Caliraya)': [
    {
      stage: 'Harvest Mature',
      type: 'observe',
      message: 'Early maturity helps avoid late-season storms'
    }
  ],
  
  'PSB Rc14 (Rio Grande)': [
    {
      stage: 'Vegetative (Tillering)',
      type: 'observe',
      message: 'Suitable for rainfed lowlands - monitor water levels'
    }
  ],
  
  'NSIC Rc192 (Sahod Ulan 1)': [
    {
      stage: 'Vegetative (Tillering)',
      type: 'warning',
      message: 'Monitor water stress closely (rainfed variety)'
    },
    {
      stage: 'Flowering',
      type: 'precaution',
      message: 'Extra sensitive to water stress during flowering'
    }
  ],
  
  'NSIC Rc226': [
    {
      stage: 'Vegetative (Tillering)',
      type: 'observe',
      message: 'Responds well to MOET and improved management'
    }
  ],
  
  'NSIC Rc480': [
    {
      stage: 'Vegetative (Tillering)',
      type: 'observe',
      message: 'Promising newer variety with good yield potential'
    }
  ]
};
