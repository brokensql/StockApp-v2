import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, ChevronRight, Store, User, Sparkles, Package } from 'lucide-react';
import { toast } from 'sonner';
import { UserProfile } from '../types';
import { LottieAnimation } from './LottieAnimation';
import { buyOnlineData, setUpLayoutData, jobSuccessData } from '../assets/lottie';

interface OnboardingScreenProps {
  currentProfile?: UserProfile;
  onFinish: (profile: { ownerName: string; storeName: string }) => void;
  onSkip?: () => void;
  onCancel?: () => void;
}

interface SlideData {
  id: number;
  title: string;
  subtitle: string;
  images: {
    left: string;
    center: string;
    right: string;
  };
}

const ONBOARDING_SLIDES: SlideData[] = [
  {
    id: 1,
    title: 'Discover The Perfect Way To Run Your Store',
    subtitle:
      'Manage inventory in real-time, organize stock categories, and track retail items effortlessly offline.',
    images: {
      left: 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=400&q=80',
      center: 'https://images.unsplash.com/photo-1578916171728-46686eac8d58?auto=format&fit=crop&w=600&q=80',
      right: 'https://images.unsplash.com/photo-1604719312566-8912e9227c6a?auto=format&fit=crop&w=400&q=80',
    },
  },
  {
    id: 2,
    title: 'Fast Barcode Scan & Instant Checkout',
    subtitle:
      'Scan barcodes with your camera, adjust item quantities with intuitive steppers, and ring up quick sales.',
    images: {
      left: 'https://images.unsplash.com/photo-1534452203293-494d7ddbf7e0?auto=format&fit=crop&w=400&q=80',
      center: 'https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?auto=format&fit=crop&w=600&q=80',
      right: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=400&q=80',
    },
  },
  {
    id: 3,
    title: 'Track Daily Sales & Grow With Confidence',
    subtitle:
      'Monitor daily earnings, review transaction histories, and keep your business records safe on your device.',
    images: {
      left: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=400&q=80',
      center: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=600&q=80',
      right: 'https://images.unsplash.com/photo-1556742049-0a67c5574f73?auto=format&fit=crop&w=400&q=80',
    },
  },
];

const SafeSlideImage: React.FC<{ src: string; alt: string; className?: string }> = ({
  src,
  alt,
  className = '',
}) => {
  const [error, setError] = useState(false);

  if (error) {
    return (
      <div className={`bg-[#EAEFEA] flex items-center justify-center text-[#4F8065] ${className}`}>
        <Package size={28} strokeWidth={1.5} />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setError(true)}
      className={`object-cover ${className}`}
    />
  );
};

export const OnboardingScreen: React.FC<OnboardingScreenProps> = ({
  currentProfile,
  onFinish,
  onSkip,
  onCancel,
}) => {
  const hasExistingName = Boolean(
    currentProfile?.ownerName &&
      currentProfile.ownerName.trim() !== '' &&
      currentProfile.ownerName !== 'Store Owner'
  );
  const hasExistingStore = Boolean(
    currentProfile?.storeName &&
      currentProfile.storeName.trim() !== '' &&
      currentProfile.storeName !== 'My Store'
  );

  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [slideDirection, setSlideDirection] = useState<number>(1);
  const [isFormStep, setIsFormStep] = useState(hasExistingName);

  const [ownerName, setOwnerName] = useState(
    hasExistingName ? currentProfile!.ownerName : ''
  );
  const [storeName, setStoreName] = useState(
    hasExistingStore ? currentProfile!.storeName : ''
  );
  const [isFinishing, setIsFinishing] = useState(false);

  const handleNextSlide = () => {
    setSlideDirection(1);
    if (currentSlideIndex < ONBOARDING_SLIDES.length - 1) {
      setCurrentSlideIndex((prev) => prev + 1);
    } else {
      setIsFormStep(true);
    }
  };

  const handleProceedToForm = () => {
    setSlideDirection(1);
    setIsFormStep(true);
  };

  const handleBack = () => {
    if (isFormStep) {
      if (hasExistingName && onCancel) {
        onCancel();
      } else {
        setIsFormStep(false);
      }
    } else if (currentSlideIndex > 0) {
      setSlideDirection(-1);
      setCurrentSlideIndex((prev) => prev - 1);
    }
  };

  const handleFinish = (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const trimmedName = ownerName.trim();
    const trimmedStore = storeName.trim();

    if (!trimmedName && !trimmedStore) {
      toast.error('Please enter your name and store name', { id: 'onboarding-validation' });
      document.getElementById('onboarding-owner-name-input')?.focus();
      return;
    }

    if (!trimmedName) {
      toast.error('Please enter your name', { id: 'onboarding-validation' });
      document.getElementById('onboarding-owner-name-input')?.focus();
      return;
    }

    if (!trimmedStore) {
      toast.error('Please enter your store name', { id: 'onboarding-validation' });
      document.getElementById('onboarding-store-name-input')?.focus();
      return;
    }

    setIsFinishing(true);
    setTimeout(() => {
      onFinish({
        ownerName: trimmedName || currentProfile?.ownerName || 'Store Owner',
        storeName: trimmedStore || currentProfile?.storeName || 'My Store',
      });
    }, 200);
  };

  const handleSkip = () => {
    if (onCancel) {
      onCancel();
    } else if (onSkip) {
      onSkip();
    } else {
      onFinish({
        ownerName: currentProfile?.ownerName || 'Store Owner',
        storeName: currentProfile?.storeName || 'My Store',
      });
    }
  };

  const activeSlide = ONBOARDING_SLIDES[currentSlideIndex];

  return (
    <div className="min-h-[100dvh] w-full bg-[#181B19] sm:bg-[#1E2220] flex items-center justify-center p-0 sm:p-4 selection:bg-[#4F8065]/30">
      {/* Mobile viewport container matching reference card frame */}
      <div
        id="onboarding-viewport-card"
        className="w-full max-w-[420px] min-h-[100dvh] sm:min-h-[720px] sm:max-h-[860px] bg-[#f7f9fb] sm:rounded-[36px] shadow-[0_20px_60px_rgba(0,0,0,0.35)] flex flex-col justify-between overflow-hidden relative"
      >
        <AnimatePresence mode="wait">
          {!isFormStep ? (
            /* Carousel Slide Screen - Main frame stays stable across slides */
            <motion.div
              key="carousel-screen"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              className="flex-1 flex flex-col justify-between bg-[#f7f9fb]"
            >
              {/* Top Segmented Progress Indicators - Stably mounted, fills smoothly */}
              <div className="pt-6 px-6 pb-2">
                <div className="flex items-center gap-2">
                  {ONBOARDING_SLIDES.map((slide, idx) => (
                    <div
                      key={slide.id}
                      className="h-1.5 flex-1 rounded-full transition-all duration-300 overflow-hidden bg-[#DEE3DE]"
                    >
                      <div
                        className={`h-full rounded-full transition-all duration-400 ease-out ${
                          idx <= currentSlideIndex ? 'bg-[#2A5C43] w-full' : 'w-0'
                        }`}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Middle Showcase - Lottie icon fades out to the left and fades in from the right */}
              <div className="flex-1 flex items-center justify-center px-1 py-0 relative overflow-hidden">
                <AnimatePresence mode="wait" custom={slideDirection}>
                  <motion.div
                    key={`slide-lottie-${currentSlideIndex}`}
                    custom={slideDirection}
                    initial={{ opacity: 0, x: slideDirection > 0 ? 80 : -80, scale: 0.94 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: slideDirection > 0 ? -80 : 80, scale: 0.94 }}
                    transition={{ duration: 0.32, ease: [0.25, 1, 0.5, 1] }}
                    className="relative w-full max-w-[400px] h-[320px] sm:h-[360px] flex items-center justify-center pointer-events-none"
                  >
                    {/* Transparent Lottie Animation Showcase */}
                    <div className="w-full h-full flex items-center justify-center bg-transparent">
                      <LottieAnimation
                        animationData={
                          currentSlideIndex === 0
                            ? buyOnlineData
                            : currentSlideIndex === 1
                            ? setUpLayoutData
                            : jobSuccessData
                        }
                        className="w-full h-full flex items-center justify-center scale-[1.38] sm:scale-[1.48] transform-gpu origin-center"
                        loop
                        autoplay
                      />
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Bottom Curvy Information Container - Stays stable in place */}
              <div
                className="bg-white rounded-t-[38px] sm:rounded-t-[42px] border-t border-[#DEE3DE] shadow-[0_-8px_24px_rgba(0,0,0,0.04)] px-7 pt-7 pb-8 flex flex-col justify-between z-10 relative"
                style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom, 0px))' }}
              >
                {/* Text Content - Smooth directional fade */}
                <div className="text-center mb-6 min-h-[92px] flex flex-col justify-center">
                  <AnimatePresence mode="wait" custom={slideDirection}>
                    <motion.div
                      key={`slide-text-${currentSlideIndex}`}
                      custom={slideDirection}
                      initial={{ opacity: 0, x: slideDirection > 0 ? 25 : -25 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: slideDirection > 0 ? -25 : 25 }}
                      transition={{ duration: 0.26, ease: 'easeInOut' }}
                    >
                      <h1
                        id={`onboarding-slide-title-${currentSlideIndex}`}
                        className="text-[23px] sm:text-[25px] font-bold text-[#1E2522] tracking-[-0.02em] leading-[1.25] mb-2.5 max-w-[320px] mx-auto"
                      >
                        {activeSlide.title}
                      </h1>
                      <p
                        id={`onboarding-slide-subtext-${currentSlideIndex}`}
                        className="text-[14px] sm:text-[14.5px] font-normal leading-[1.55] text-[#6E746F] max-w-[310px] mx-auto"
                      >
                        {activeSlide.subtitle}
                      </p>
                    </motion.div>
                  </AnimatePresence>
                </div>

                {/* Bottom Navigation Controls - Smooth transition between button states */}
                <div className="min-h-[52px] flex items-center">
                  <AnimatePresence mode="wait">
                    {currentSlideIndex === 0 ? (
                      /* Slide 1: Full-width Curvy "Get Started" Button */
                      <motion.div
                        key="btn-slide-0"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="w-full"
                      >
                        <button
                          id="onboarding-slide-1-get-started"
                          type="button"
                          onClick={handleNextSlide}
                          className="w-full h-13 bg-[#2A5C43] hover:bg-[#204533] active:bg-[#1A3728] text-white text-[15.5px] font-semibold rounded-full flex items-center justify-center gap-2 cursor-pointer transition-all shadow-[0_4px_14px_rgba(42,92,67,0.25)] active:scale-[0.99]"
                        >
                          <span>Get Started</span>
                        </button>
                      </motion.div>
                    ) : (
                      /* Slides 2 & 3: "Skip" on Left, "Next >" or "Proceed >" on Right */
                      <motion.div
                        key="btn-slide-nav"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="w-full flex items-center justify-between pt-2"
                      >
                        <button
                          id={`onboarding-skip-slide-${currentSlideIndex}`}
                          type="button"
                          onClick={handleProceedToForm}
                          className="py-2 px-1 text-[14.5px] font-medium text-[#7E8580] hover:text-[#252825] transition-colors cursor-pointer"
                        >
                          Skip
                        </button>

                        <button
                          id={`onboarding-next-slide-${currentSlideIndex}`}
                          type="button"
                          onClick={currentSlideIndex === ONBOARDING_SLIDES.length - 1 ? handleProceedToForm : handleNextSlide}
                          className="py-2 px-1 text-[15px] font-semibold text-[#1E2522] hover:text-[#2A5C43] flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <span>{currentSlideIndex === ONBOARDING_SLIDES.length - 1 ? 'Proceed' : 'Next'}</span>
                          <ChevronRight size={17} strokeWidth={2.5} className="mt-0.5" />
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          ) : (
            /* Slide 4 / Profile Details Form Screen (Screenshots 279 & 210857) */
            <motion.div
              key="form-step"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.28, ease: 'easeOut' }}
              className="flex-1 flex flex-col justify-between bg-[#f7f9fb]"
            >
              {/* Upper Header Section on app background (Screenshot 210857) */}
              <div className="px-7 pt-7 pb-5">
                <h1
                  id="store-profile-header-title"
                  className="text-[28px] sm:text-[30px] font-bold text-[#1E2522] tracking-[-0.025em] leading-tight"
                >
                  {hasExistingName ? 'Welcome back!' : 'Store profile details'}
                </h1>
                <p className="text-[14px] text-[#6E746F] mt-1.5 leading-relaxed">
                  {hasExistingName
                    ? 'Update your name or store name. Your inventory and sales remain safe.'
                    : 'Set up your profile to manage your inventory and record sales.'}
                </p>
              </div>

              {/* Lower White Card with Curved Separator Boundary (Screenshot 210857) */}
              <div
                className="flex-1 bg-white rounded-t-[38px] sm:rounded-t-[42px] border-t border-[#DEE3DE] shadow-[0_-8px_24px_rgba(0,0,0,0.04)] px-7 pt-6 pb-8 flex flex-col z-10 relative"
                style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom, 0px))' }}
              >
                <form onSubmit={handleFinish} className="flex flex-col">
                  <div className="space-y-3.5">
                    {/* Your Name Input - Curvy Pill Container Matching Button */}
                    <div>
                      <label
                        htmlFor="onboarding-owner-name-input"
                        className="block text-[13px] font-semibold text-[#1E2522] mb-1.5 ml-1"
                      >
                        Your name
                      </label>
                      <div className="relative">
                        <input
                          id="onboarding-owner-name-input"
                          type="text"
                          value={ownerName}
                          onChange={(e) => setOwnerName(e.target.value)}
                          placeholder="Enter your name"
                          className="w-full h-11 px-4.5 rounded-full border border-[#E2E6E3] text-[14px] text-[#1E2522] placeholder:text-[#8E948F]/70 focus:outline-none focus:border-[#4F8065] focus:ring-1 focus:ring-[#4F8065]/20 bg-white transition-all shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
                        />
                      </div>
                    </div>

                    {/* Store Name Input - Curvy Pill Container Matching Button */}
                    <div>
                      <label
                        htmlFor="onboarding-store-name-input"
                        className="block text-[13px] font-semibold text-[#1E2522] mb-1.5 ml-1"
                      >
                        Store name
                      </label>
                      <div className="relative">
                        <input
                          id="onboarding-store-name-input"
                          type="text"
                          value={storeName}
                          onChange={(e) => setStoreName(e.target.value)}
                          placeholder="Enter store name"
                          className="w-full h-11 px-4.5 rounded-full border border-[#E2E6E3] text-[14px] text-[#1E2522] placeholder:text-[#8E948F]/70 focus:outline-none focus:border-[#4F8065] focus:ring-1 focus:ring-[#4F8065]/20 bg-white transition-all shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
                        />
                      </div>
                    </div>

                    {/* Minimal Info Note */}
                    <div
                      id="onboarding-store-note"
                      className="p-3.5 bg-[#f7f9fb] border border-[#E5E9E6] rounded-[18px] text-[12.5px] text-[#5A635E] leading-relaxed"
                    >
                      <p>
                        <span className="font-semibold text-[#1E2522]">Note:</span> You can update your store name and owner details anytime in your Profile settings.
                      </p>
                    </div>

                    {/* Complete Button Directly Below Note Container Without Big Gap */}
                    <div className="pt-2">
                      <button
                        id="finish-onboarding-cta-btn"
                        type="submit"
                        disabled={isFinishing}
                        className="w-full h-13 bg-[#2A5C43] hover:bg-[#204533] active:bg-[#1A3728] disabled:opacity-75 text-white text-[15.5px] font-semibold rounded-full flex items-center justify-center gap-2 cursor-pointer transition-all shadow-[0_4px_14px_rgba(42,92,67,0.25)] active:scale-[0.99]"
                        aria-label="Complete setup"
                      >
                        {isFinishing ? (
                          <span>Saving profile...</span>
                        ) : (
                          <span>{hasExistingName ? 'Save & Return' : 'Complete'}</span>
                        )}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

