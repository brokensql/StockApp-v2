export const STANDARD_CATEGORIES = [
  'General',
  'Snacks',
  'Beverages',
  'Canned Goods',
  'Instant Food',
  'Cooking Essentials',
  'Dairy',
  'Bakery',
  'Household',
  'Toiletries',
  'Skincare',
  'Body Care',
  'Hair Care',
  'Frozen Goods',
  'Medicine',
  'Condiments',
  'Cigrattes',
  'Ice Cream & Desserts',
  'Biscuits',
] as const;

export type StandardCategory = (typeof STANDARD_CATEGORIES)[number];
