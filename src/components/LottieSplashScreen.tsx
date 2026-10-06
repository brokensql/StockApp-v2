import React, { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { LottieAnimation } from './LottieAnimation';
import boxAssembleData from '../assets/lottie/box-assemble.json';
import { Capacitor } from '@capacitor/core';

interface LottieSplashScreenProps {
  onFinish?: () => void;
  appName?: string;
  minDurationMs?: number;
}

export const LottieSplashScreen: React.FC<LottieSplashScreenProps> = ({
  onFinish,
  appName = 'StockApp',
  minDurationMs = 2200,
}) => {
  const [isClosing, setIsClosing] = useState(false);
  const finishCalledRef = useRef(false);

  // Keep the latest onFinish in a ref so handleComplete stays referentially stable.
  // A changing onFinish identity (e.g. an inline arrow from App) would otherwise
  // flow through into LottieAnimation's effect dependencies and restart the
  // animation from frame 0 on every App re-render (IndexedDB hydration, avatar load).
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  const handleComplete = useCallback(() => {
    if (finishCalledRef.current) return;
    finishCalledRef.current = true;
    setIsClosing(true);
    setTimeout(() => {
      onFinishRef.current?.();
    }, 380);
  }, []);

  useEffect(() => {
    // If native Capacitor is active, safely hide the native window splash
    // so our animated Lottie in-app splash is visible immediately with zero freeze
    if (Capacitor.isNativePlatform()) {
      try {
        const plugins = (window as any)?.Capacitor?.Plugins;
        if (plugins?.SplashScreen?.hide) {
          plugins.SplashScreen.hide();
        }
      } catch (err) {
        // Safe fallback if plugin not present
      }
    }

    // Fallback maximum timer ensuring the splash never hangs even if animation pauses
    const maxTimer = window.setTimeout(() => {
      handleComplete();
    }, minDurationMs + 400);

    return () => {
      clearTimeout(maxTimer);
    };
  }, [handleComplete, minDurationMs]);

  return (
    <AnimatePresence>
      {!isClosing && (
        <motion.div
          id="app-lottie-splash-screen"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 0.97 }}
          transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
          onClick={handleComplete}
          className="fixed inset-0 z-[999999] flex items-center justify-center bg-[#F7F9FB] select-none cursor-pointer overflow-hidden"
          style={{
            paddingTop: 'env(safe-area-inset-top, 0px)',
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          }}
          aria-label="App Splash Screen"
        >
          {/* Main Icon Container - Box only, bigger, seamlessly matching splash background (#F7F9FB) */}
          <motion.div
            initial={{ scale: 0.86, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
            className="w-60 h-60 sm:w-72 sm:h-72 max-w-[80vw] max-h-[80vw] flex items-center justify-center bg-[#F7F9FB]"
          >
            <LottieAnimation
              animationData={boxAssembleData}
              loop={false}
              autoplay={true}
              speed={1}
              onComplete={handleComplete}
              className="w-full h-full pointer-events-none"
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
