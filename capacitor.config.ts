import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ejden.app',
  appName: 'EJDEN',
  webDir: 'www',

  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 800,
      launchFadeOutDuration: 200,
      showSpinner: false,
      backgroundColor: '#F6F9FA',
    },
  },
};

export default config;
