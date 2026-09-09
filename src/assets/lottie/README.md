# Lottie Icons & Animations Folder

This folder contains all Lottie JSON files and animations used across the app.

## How to add a new Lottie file / icon:

1. **Place your `.json` file in this folder (`src/assets/lottie/`)**:
   - For example: `src/assets/lottie/cart-icon.json`

2. **Register it in `src/assets/lottie/index.ts`**:
   ```ts
   import buyOnlineData from './buy-online.json';
   import cartIconData from './cart-icon.json';

   export const LOTTIE_ANIMATIONS = {
     buyOnline: buyOnlineData,
     cart: cartIconData,
   } as const;

   export { buyOnlineData, cartIconData };
   ```

3. **Use it anywhere in your components**:

   ### As an icon:
   ```tsx
   import { LottieIcon } from '@/components/LottieAnimation';
   import { cartIconData } from '@/assets/lottie';

   <LottieIcon icon={cartIconData} size={28} />
   ```

   ### As a larger hero animation:
   ```tsx
   import { LottieAnimation } from '@/components/LottieAnimation';
   import { buyOnlineData } from '@/assets/lottie';

   <LottieAnimation animationData={buyOnlineData} loop autoplay className="w-64 h-64" />
   ```
