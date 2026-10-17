import React, { useRef, useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { LottieAnimation } from './LottieAnimation';
import {
  goldMedalData,
  silverMedalData,
  bronzeMedalData,
} from '../assets/lottie';

export interface TopSoldItem {
  productId: string;
  name: string;
  totalSold: number;
  category?: string;
  revenue?: number;
  percentage: number;
  trendLabel?: string;
  trendDirection?: 'up' | 'down' | 'neutral';
  historyPoints?: number[];
}

interface MostSoldProductsCarouselProps {
  items: TopSoldItem[];
  onItemClick?: (item: TopSoldItem) => void;
}

const MEDAL_BADGES = [
  { rank: 1, name: '1st Place Gold Medal', data: goldMedalData },
  { rank: 2, name: '2nd Place Silver Medal', data: silverMedalData },
  { rank: 3, name: '3rd Place Bronze Medal', data: bronzeMedalData },
];

export const MostSoldProductsCarousel: React.FC<MostSoldProductsCarouselProps> = ({
  items,
  onItemClick,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const pauseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Strictly stick to the top 3 products
  const displayItems = items.slice(0, 3);
  const totalSlides = Math.max(1, displayItems.length);

  // Smoothly scrolls to a specific slide index
  const scrollToSlide = useCallback((index: number) => {
    if (!scrollRef.current) return;
    const container = scrollRef.current;
    if (index === 0) {
      container.scrollTo({
        left: 0,
        behavior: 'smooth',
      });
      setActiveIndex(0);
      return;
    }
    const cardEl = container.children[index] as HTMLElement | null;
    if (cardEl) {
      const paddingLeft = parseFloat(window.getComputedStyle(container).paddingLeft) || 0;
      const targetLeft = Math.max(0, cardEl.offsetLeft - container.offsetLeft - paddingLeft);
      container.scrollTo({
        left: targetLeft,
        behavior: 'smooth',
      });
      setActiveIndex(index);
    }
  }, []);

  // Sync active slide index during manual swipe or scroll
  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollLeft, clientWidth } = scrollRef.current;
    const cardEl = scrollRef.current.firstElementChild as HTMLElement | null;
    const cardWidth = cardEl ? cardEl.offsetWidth + 14 : clientWidth * 0.86;
    const newIndex = Math.min(
      Math.max(0, Math.round(scrollLeft / cardWidth)),
      totalSlides - 1
    );
    if (newIndex !== activeIndex) {
      setActiveIndex(newIndex);
    }
  };

  // Temporarily pause autoplay during touch/drag or interaction
  const pauseAutoplay = useCallback(() => {
    if (pauseTimeoutRef.current) {
      clearTimeout(pauseTimeoutRef.current);
      pauseTimeoutRef.current = null;
    }
    setIsPaused(true);
  }, []);

  // Resume autoplay after user finishes interaction
  const resumeAutoplay = useCallback((delayMs = 2800) => {
    if (pauseTimeoutRef.current) {
      clearTimeout(pauseTimeoutRef.current);
    }
    pauseTimeoutRef.current = setTimeout(() => {
      setIsPaused(false);
    }, delayMs);
  }, []);

  // Automatic moving carousel loop
  useEffect(() => {
    if (isPaused || totalSlides <= 1) return;

    const interval = setInterval(() => {
      setActiveIndex((current) => {
        const next = (current + 1) % totalSlides;
        scrollToSlide(next);
        return next;
      });
    }, 3600);

    return () => clearInterval(interval);
  }, [totalSlides, isPaused, scrollToSlide]);

  // Clean up pause timeout on unmount
  useEffect(() => {
    return () => {
      if (pauseTimeoutRef.current) {
        clearTimeout(pauseTimeoutRef.current);
      }
    };
  }, []);

  // Infinite looping Prev / Next chevrons
  const scrollPrev = () => {
    pauseAutoplay();
    const prevIndex = (activeIndex - 1 + totalSlides) % totalSlides;
    scrollToSlide(prevIndex);
    resumeAutoplay(4000);
  };

  const scrollNext = () => {
    pauseAutoplay();
    const nextIndex = (activeIndex + 1) % totalSlides;
    scrollToSlide(nextIndex);
    resumeAutoplay(4000);
  };

  return (
    <div id="most-sold-products-card" className="w-full mb-5">
      {/* Section Header: Clean title, no dots, no "Top 3" text */}
      <div className="flex items-center justify-between mb-2.5 px-0.5">
        <h2 className="text-[17px] font-bold text-[#202522] tracking-[-0.015em]">
          Most sold products
        </h2>

        {/* Looping Carousel Navigation Controls (Visible on both mobile & desktop) */}
        {totalSlides > 1 && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={scrollPrev}
              className="w-7 h-7 rounded-full flex items-center justify-center text-[#68716C] hover:text-[#202522] active:bg-[#E1E6E2] hover:bg-[#F0F3F1] transition-all cursor-pointer"
              aria-label="Previous slide"
            >
              <ChevronLeft size={16} strokeWidth={2.2} />
            </button>
            <button
              type="button"
              onClick={scrollNext}
              className="w-7 h-7 rounded-full flex items-center justify-center text-[#68716C] hover:text-[#202522] active:bg-[#E1E6E2] hover:bg-[#F0F3F1] transition-all cursor-pointer"
              aria-label="Next slide"
            >
              <ChevronRight size={16} strokeWidth={2.2} />
            </button>
          </div>
        )}
      </div>

      {/* Carousel Track */}
      {displayItems.length === 0 ? (
        // Empty State Card
        <div className="w-full bg-white border border-[#E1E6E2] rounded-2xl p-4 sm:p-5 shadow-[0_2px_10px_rgba(32,37,34,0.02)] flex items-center justify-between">
          <div className="flex-1 min-w-0 pr-3">
            <div className="flex items-center text-[13.5px] sm:text-[14px] leading-tight mb-2">
              <span className="font-semibold text-[#1F2421]">No sales yet</span>
              <span className="text-[#8E9893] font-normal ml-1.5">/ All time</span>
            </div>
            <div className="flex items-baseline mb-2">
              <span className="text-[26px] sm:text-[28px] font-bold text-[#191D1A] tracking-tight leading-none">
                0
              </span>
              <span className="text-[15px] sm:text-[16px] font-medium text-[#707973] ml-1.5 leading-none">
                sold
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[12px] font-medium text-[#8E9893] leading-none">
              <span>0% store share</span>
            </div>
          </div>

          <div className="w-[62px] sm:w-[68px] h-[74px] sm:h-[82px] shrink-0 opacity-40 flex items-center justify-center select-none pointer-events-none">
            <LottieAnimation
              animationData={goldMedalData}
              loop={false}
              autoplay={false}
              className="w-full h-full"
            />
          </div>
        </div>
      ) : (
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          onMouseEnter={pauseAutoplay}
          onMouseLeave={() => resumeAutoplay(1000)}
          onTouchStart={pauseAutoplay}
          onTouchEnd={() => resumeAutoplay(3000)}
          className="flex gap-3.5 overflow-x-auto snap-x snap-mandatory scroll-smooth no-scrollbar -mx-2 px-2 py-1.5"
        >
          {displayItems.map((item, index) => {
            const medal = MEDAL_BADGES[index % MEDAL_BADGES.length];
            const percentValue = item.percentage;

            return (
              <div
                key={item.productId || `${item.name}-${index}`}
                onClick={() => onItemClick && onItemClick(item)}
                className="snap-start shrink-0 w-[88%] sm:w-[320px] bg-white border border-[#E1E6E2] rounded-2xl p-4 sm:p-4.5 shadow-[0_2px_10px_rgba(32,37,34,0.02)] hover:shadow-[0_4px_16px_rgba(32,37,34,0.05)] transition-all flex items-center justify-between cursor-pointer select-none"
              >
                {/* Left Column: Title, Big Metric, Percentage store share without green container */}
                <div className="flex-1 min-w-0 pr-3 flex flex-col justify-between">
                  {/* Title & Scope: Item Name / Category (No "Top X" label) */}
                  <div className="flex items-center text-[13.5px] sm:text-[14px] leading-tight mb-2 truncate">
                    <span
                      className="font-semibold text-[#1F2421] truncate max-w-[145px] sm:max-w-[160px]"
                      title={item.name}
                    >
                      {item.name}
                    </span>
                    <span className="text-[#8E9893] font-normal shrink-0 ml-1.5 truncate max-w-[100px]">
                      / {item.category || 'Best seller'}
                    </span>
                  </div>

                  {/* Large Metric: 24 sold */}
                  <div className="flex items-baseline mb-2">
                    <span className="text-[26px] sm:text-[28px] font-bold text-[#191D1A] tracking-tight tabular-nums leading-none">
                      {item.totalSold}
                    </span>
                    <span className="text-[15px] sm:text-[16px] font-medium text-[#707973] ml-1.5 leading-none">
                      sold
                    </span>
                  </div>

                  {/* Clean percentage store share - removed the green container */}
                  <div className="flex items-center gap-1.5 text-[12px] font-medium text-[#68716C] leading-none">
                    <span className="font-semibold text-[#10B981]">{percentValue}%</span>
                    <span>store share</span>
                  </div>
                </div>

                {/* Right Column: Animated Top 3 Lottie Medal Badge replacing graph */}
                <div
                  className="w-[64px] sm:w-[70px] h-[78px] sm:h-[86px] shrink-0 flex items-center justify-center relative select-none pointer-events-none"
                  aria-label={medal.name}
                >
                  <LottieAnimation
                    animationData={medal.data}
                    loop={true}
                    autoplay={true}
                    className="w-full h-full"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
