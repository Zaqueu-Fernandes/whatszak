import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.44da7a2435b04ccaae3e302d8b3a5a53',
  appName: 'WhatsZak',
  webDir: 'dist',
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#25D366',
      showSpinner: false,
    },
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
