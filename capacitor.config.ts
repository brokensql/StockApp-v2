import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sageinventory.app',
  appName: 'StockApp',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
    backgroundColor: '#F7F9FB',
  },
  server: {
    androidScheme: 'https',
  },
  plugins: {
    StatusBar: {
      overlaysWebView: true,
      style: 'LIGHT',
      backgroundColor: '#F9FAF8',
    },
  },
};

export default config;
