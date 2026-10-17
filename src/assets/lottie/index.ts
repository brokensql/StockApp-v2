import buyOnlineData from './buy-online.json';
import setUpLayoutData from './set-up-layout.json';
import jobSuccessData from './job-success.json';
import shoppingCartData from './shopping-cart.json';
import boxAssembleData from './box-assemble.json';
import goldMedalData from './gold-medal.json';
import silverMedalData from './silver-medal.json';
import bronzeMedalData from './bronze-medal.json';

/**
 * Lottie animation assets repository.
 * Any new lottie animation or icon JSON files added here
 * can be registered in this dictionary for easy lookup and use.
 */
export const LOTTIE_ANIMATIONS = {
  buyOnline: buyOnlineData,
  setUpLayout: setUpLayoutData,
  jobSuccess: jobSuccessData,
  shoppingCart: shoppingCartData,
  boxAssemble: boxAssembleData,
  goldMedal: goldMedalData,
  silverMedal: silverMedalData,
  bronzeMedal: bronzeMedalData,
} as const;

export type LottieAnimationKey = keyof typeof LOTTIE_ANIMATIONS;

export {
  buyOnlineData,
  setUpLayoutData,
  jobSuccessData,
  shoppingCartData,
  boxAssembleData,
  goldMedalData,
  silverMedalData,
  bronzeMedalData,
};
export default LOTTIE_ANIMATIONS;

