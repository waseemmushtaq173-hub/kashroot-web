import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.kashroot.app',
  appName: 'Kashroot',
  webDir: '.next',
  server: {
    url: 'https://kashroot-web-fh1x-5rjv3n12g-team-alpha-d0b5.vercel.app',
    cleartext: true
  }
};

export default config;
