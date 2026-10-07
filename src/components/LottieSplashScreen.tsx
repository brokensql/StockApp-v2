import React, { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { LottieAnimation } from './LottieAnimation';
import boxAssembleData from '../assets/lottie/box-assemble.json';
import { Capacitor } from '@capacitor/core';

interface LottieSplashScreenProps {
  onFinish?: () => void;
  appName?: string;
  speed?: number;
}

export const LottieSplashScreen: React.FC<LottieSplashScreenProps> = ({
  onFinish,
  speed = 0.52,
}) => {
  const [isClosing, setIsClosing] = useState(false);
  const finishCalledRef = useRef(false);

  // Keep the latest onFinish in a ref so handleComplete stays referentially stable.
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  const handleComplete = useCallback(() => {
    if (finishCalledRef.current) return;
    finishCalledRef.current = true;
    // Add a gentle hold so the user can enjoy the completed assembled box & checkmark badge
    setTimeout(() => {
      setIsClosing(true);
      setTimeout(() => {
        onFinishRef.current?.();
      }, 420);
    }, 480);
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

    // Dynamic safety timer matched to the slowed speed (150 frames @ 60fps / 0.52 ≈ 4.8s) + hold + margin
    const expectedDurationMs = Math.ceil((150 / (60 * speed)) * 1000) + 1400;
    const maxTimer = window.setTimeout(() => {
      handleComplete();
    }, expectedDurationMs);

    return () => {
      clearTimeout(maxTimer);
    };
  }, [handleComplete, speed]);

  return (
    <AnimatePresence>
      {!isClosing && (
        <motion.div
          id="app-lottie-splash-screen"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
          onClick={handleComplete}
          className="fixed inset-0 z-[999999] flex items-center justify-center bg-[#F7F9FB] select-none cursor-pointer overflow-hidden"
          style={{
            paddingTop: 'env(safe-area-inset-top, 0px)',
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          }}
          aria-label="App Splash Screen"
        >
          {/* Main Icon Container - Stable dimensions with no competing scale animation for glitch-free rendering */}
          <div
            className="w-60 h-60 sm:w-72 sm:h-72 max-w-[80vw] max-h-[80vw] flex items-center justify-center bg-[#F7F9FB]"
            style={{ transform: 'translateZ(0)', willChange: 'transform' }}
          >
            <LottieAnimation
              animationData={boxAssembleData}
              loop={false}
              autoplay={true}
              speed={speed}
              onComplete={handleComplete}
              className="w-full h-full pointer-events-none"
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
