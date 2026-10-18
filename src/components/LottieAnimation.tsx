import React, { useEffect, useRef } from 'react';
import lottie from 'lottie-web';
import type { AnimationItem } from 'lottie-web';

export interface LottieAnimationProps {
  animationData?: any;
  path?: string;
  loop?: boolean;
  autoplay?: boolean;
  className?: string;
  style?: React.CSSProperties;
  speed?: number;
  segments?: [number, number];
  onComplete?: () => void;
}

export const LottieAnimation: React.FC<LottieAnimationProps> = ({
  animationData,
  path,
  loop = true,
  autoplay = true,
  className = '',
  style,
  speed = 1,
  segments,
  onComplete,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<AnimationItem | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (!containerRef.current) return;

    if (animRef.current) {
      animRef.current.destroy();
      animRef.current = null;
    }

    try {
      const hasSegments = Boolean(segments && segments.length === 2);
      
      animRef.current = lottie.loadAnimation({
        container: containerRef.current,
        renderer: 'svg',
        loop,
        autoplay: hasSegments ? false : autoplay,
        animationData: animationData ? JSON.parse(JSON.stringify(animationData)) : undefined,
        path,
        rendererSettings: {
          preserveAspectRatio: 'xMidYMid meet',
          progressiveLoad: true,
        },
      });

      if (animRef.current) {
        if (speed !== 1) {
          animRef.current.setSpeed(speed);
        }
        
        if (hasSegments && segments) {
          animRef.current.playSegments(segments, true);
          if (loop) {
            animRef.current.addEventListener('complete', () => {
              animRef.current?.playSegments(segments, true);
            });
          }
        }

        animRef.current.addEventListener('complete', () => {
          onCompleteRef.current?.();
        });
      }
    } catch (err) {
      console.warn('Failed to load Lottie animation:', err);
    }

    return () => {
      if (animRef.current) {
        animRef.current.destroy();
        animRef.current = null;
      }
    };
  }, [animationData, path, loop, autoplay, speed, segments]);

  return <div ref={containerRef} className={className} style={style} />;
};

export interface LottieIconProps {
  icon: any;
  size?: number | string;
  className?: string;
  loop?: boolean;
  autoplay?: boolean;
  onClick?: () => void;
}

export const LottieIcon: React.FC<LottieIconProps> = ({
  icon,
  size = 24,
  className = '',
  loop = true,
  autoplay = true,
  onClick,
}) => {
  const dimensionStyle = {
    width: typeof size === 'number' ? `${size}px` : size,
    height: typeof size === 'number' ? `${size}px` : size,
  };

  return (
    <div
      onClick={onClick}
      style={dimensionStyle}
      className={`inline-flex items-center justify-center flex-shrink-0 ${className} ${
        onClick ? 'cursor-pointer' : ''
      }`}
    >
      <LottieAnimation
        animationData={typeof icon === 'object' ? icon : undefined}
        path={typeof icon === 'string' ? icon : undefined}
        loop={loop}
        autoplay={autoplay}
        className="w-full h-full"
      />
    </div>
  );
};

export default LottieAnimation;
