import React, { useEffect, useRef } from 'react';
import lottie from 'lottie-web/build/player/lottie_light';
import type { AnimationItem } from 'lottie-web';
import checkmarkData from '../assets/lottie/checkmark.json';

interface ReceiptCheckmarkProps {
  className?: string;
  size?: number;
}

export const ReceiptCheckmark: React.FC<ReceiptCheckmarkProps> = ({
  className = 'w-16 h-16',
  size = 64,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<AnimationItem | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    if (animRef.current) {
      animRef.current.destroy();
      animRef.current = null;
    }

    try {
      // Configure animation to play once, then hold on the final completed checkmark frame
      animRef.current = lottie.loadAnimation({
        container: containerRef.current,
        renderer: 'svg',
        loop: false,
        autoplay: true,
        animationData: checkmarkData,
      });

      // When animation finishes, ensure it stays still on the final frame
      animRef.current.addEventListener('complete', () => {
        if (animRef.current) {
          // Go to and stop at the final frame so it remains static
          animRef.current.goToAndStop(animRef.current.totalFrames - 1, true);
        }
      });
    } catch (err) {
      console.warn('Failed to initialize ReceiptCheckmark lottie:', err);
    }

    return () => {
      if (animRef.current) {
        animRef.current.destroy();
        animRef.current = null;
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ width: size, height: size }}
      className={`inline-flex items-center justify-center flex-shrink-0 select-none ${className}`}
      aria-label="Success checkmark"
    />
  );
};

export default ReceiptCheckmark;
