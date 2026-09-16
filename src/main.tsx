import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Capacitor } from '@capacitor/core';
import { initPWAUpdateManager } from './utils/pwaUpdate';

const isNative =
  Capacitor.isNativePlatform() ||
  (typeof window !== 'undefined' &&
    typeof (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform === 'function' &&
    (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor!.isNativePlatform!());

if (isNative) {
  document.documentElement.classList.add('capacitor-native');
  document.body.classList.add('capacitor-native');

  // Configure Android / iOS status bar
  StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
  StatusBar.setStyle({ style: Style.Light }).catch(() => {});
  StatusBar.setBackgroundColor({ color: '#F9FAF8' }).catch(() => {});
}

// Initialize PWA auto-updater and session/cookie verification
initPWAUpdateManager();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
