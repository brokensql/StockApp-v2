import { SaleTransaction } from '../types';

/**
 * Generates the next sequential, collision-free Receipt ID starting from "SA-01", "SA-02", etc.
 * The sales array is the single source of truth (no external side-counters).
 */
export function getNextReceiptId(existingSales: SaleTransaction[] = []): string {
  let maxSeq = 0;
  const existingIdentifiers = new Set<string>();

  if (Array.isArray(existingSales)) {
    for (const s of existingSales) {
      if (!s) continue;
      if (s.transactionNumber) existingIdentifiers.add(s.transactionNumber.toUpperCase());
      if (s.id) existingIdentifiers.add(s.id.toUpperCase());

      const txNum = s.transactionNumber || s.id || '';
      const match = txNum.match(/SA-(\d+)/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxSeq) {
          maxSeq = num;
        }
      }
    }
  }

  // If existing sales exist but none had SA- format, use existingSales.length as base
  if (maxSeq === 0 && existingSales && existingSales.length > 0) {
    maxSeq = existingSales.length;
  }

  let candidateSeq = maxSeq + 1;
  let candidateId = `SA-${String(candidateSeq).padStart(2, '0')}`;

  // Assert uniqueness against both transactionNumber and id
  while (existingIdentifiers.has(candidateId.toUpperCase())) {
    candidateSeq++;
    candidateId = `SA-${String(candidateSeq).padStart(2, '0')}`;
  }

  return candidateId;
}
