import { RegionConfig } from './kashmir';

export const InternationalConfig: RegionConfig = {
  id: 'international',
  name: 'International (Generic Demo)',
  currency: {
    code: 'USD',
    symbol: '$',
  },
  languages: ['en'], // English
  units: {
    weight: 'lbs', // Pounds
    land: 'acres', // Acres
    temperature: 'fahrenheit',
  },
  activeAdapters: ['web', 'email'],
};
