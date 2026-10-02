/**
 * Generates collision-resistant entity IDs for products, sales transactions, and internal records.
 * Uses crypto.randomUUID() wherever available, with a robust fallback.
 */
export function generateEntityId(prefix?: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const rand = Math.random().toString(36).substring(2, 10);
  const time = Date.now().toString(36);
  return prefix ? `${prefix}_${time}_${rand}` : `${time}_${rand}`;
}
