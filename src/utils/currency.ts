/**
 * Financial rounding utility for POS calculations.
 * Avoids floating-point drift (e.g. 46.49999999999994) in stored records and displays.
 */
export const roundMoney = (n: number): number => {
  return Math.round((n + Number.EPSILON) * 100) / 100;
};
