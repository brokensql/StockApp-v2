import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { StatusBar, Style } from '@capacitor/status-bar';
import { initPWAUpdateManager } from './utils/pwaUpdate';

const isNative =
  typeof (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
    .Capacitor !== 'undefined' &&
  (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
    .Capacitor?.isNativePlatform?.() === true;

if (isNative) {
  StatusBar.setBackgroundColor({ color: '#F9FAF8' }).catch(() => {});
  StatusBar.setStyle({ style: Style.Light }).catch(() => {});
}

// Initialize PWA auto-updater and session/cookie verification
initPWAUpdateManager();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
