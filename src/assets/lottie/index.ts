import buyOnlineData from './buy-online.json';
import setUpLayoutData from './set-up-layout.json';
import jobSuccessData from './job-success.json';
import checkmarkData from './checkmark.json';

/**
 * Lottie animation assets repository.
 * Any new lottie animation or icon JSON files added here
 * can be registered in this dictionary for easy lookup and use.
 */
export const LOTTIE_ANIMATIONS = {
  buyOnline: buyOnlineData,
  setUpLayout: setUpLayoutData,
  jobSuccess: jobSuccessData,
  checkmark: checkmarkData,
} as const;

export type LottieAnimationKey = keyof typeof LOTTIE_ANIMATIONS;

export { buyOnlineData, setUpLayoutData, jobSuccessData, checkmarkData };
export default LOTTIE_ANIMATIONS;
