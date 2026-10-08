import { RegionConfig } from './kashmir';

export const HimachalConfig: RegionConfig = {
  id: 'himachal',
  name: 'Himachal Pradesh (India)',
  currency: {
    code: 'INR',
    symbol: '₹',
  },
  languages: ['en', 'hi'], // English, Hindi
  units: {
    weight: 'kg',
    land: 'bigha', // Traditional Himachali land unit
    temperature: 'celsius',
  },
  activeAdapters: ['whatsapp', 'sms', 'web'],
};
