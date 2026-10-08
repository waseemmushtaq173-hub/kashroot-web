export interface RegionConfig {
  id: string;
  name: string;
  currency: {
    code: string;
    symbol: string;
  };
  languages: string[];
  units: {
    weight: string;
    land: string;
    temperature: string;
  };
  activeAdapters: string[];
}

export const KashmirConfig: RegionConfig = {
  id: 'kashmir',
  name: 'Jammu & Kashmir (Default)',
  currency: {
    code: 'INR',
    symbol: '₹',
  },
  languages: ['en', 'ur', 'ks'], // English, Urdu, Kashmiri
  units: {
    weight: 'kg', // or boxes
    land: 'kanal', // Traditional Kashmiri land unit
    temperature: 'celsius',
  },
  activeAdapters: ['whatsapp', 'sms', 'voice', 'web'],
};
