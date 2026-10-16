import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.kashroot.app',
  appName: 'KashRoot',
  webDir: '.next',
  server: {
    // The live site. An address of one Vercel deployment would freeze the app
    // on that old copy.
    url: 'https://kashroot-web.vercel.app',
  },
};

export default config;
