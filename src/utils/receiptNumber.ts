import { SaleTransaction } from '../types';

const LAST_RECEIPT_SEQ_KEY = 'sage_last_receipt_seq';

/**
 * Helper to safely extract a sequence number from an SA-XX formatted string.
 */
export function parseReceiptNumber(value?: string | null): number | null {
  if (!value) return null;
  const match = value.trim().match(/^SA-(\d+)$/i);
  if (!match) return null;
  const num = parseInt(match[1], 10);
  return isNaN(num) ? null : num;
}

/**
 * Generates the next sequential, collision-free Receipt ID starting from "SA-01", "SA-02", etc.
 * Protects numbering consistency even when historical transactions are deleted.
 * Ignores internal UUIDs so they are never confused with receipt numbers.
 */
export function getNextReceiptId(existingSales: SaleTransaction[] = []): string {
  let maxSeq = 0;
  const existingIdentifiers = new Set<string>();

  // 1. Check monotonically stored highest receipt sequence from device storage
  try {
    const rawStored = localStorage.getItem(LAST_RECEIPT_SEQ_KEY);
    if (rawStored) {
      const parsed = parseInt(rawStored, 10);
      if (!isNaN(parsed) && parsed > maxSeq) {
        maxSeq = parsed;
      }
    }
  } catch {
    // Graceful fallback for non-storage environments
  }

  // 2. Scan existing sales array
  if (Array.isArray(existingSales)) {
    for (const s of existingSales) {
      if (!s) continue;
      if (s.transactionNumber) {
        existingIdentifiers.add(s.transactionNumber.toUpperCase());
        const seq = parseReceiptNumber(s.transactionNumber);
        if (seq !== null && seq > maxSeq) {
          maxSeq = seq;
        }
      } else if (s.id) {
        // Fallback for legacy schema where id was used as receipt number
        const legacySeq = parseReceiptNumber(s.id);
        if (legacySeq !== null) {
          existingIdentifiers.add(s.id.toUpperCase());
          if (legacySeq > maxSeq) {
            maxSeq = legacySeq;
          }
        }
      }
    }
  }

  // 3. Fallback: if sales exist without SA- format, use length as safe baseline
  if (maxSeq === 0 && existingSales && existingSales.length > 0) {
    maxSeq = existingSales.length;
  }

  let candidateSeq = maxSeq + 1;
  let candidateId = `SA-${String(candidateSeq).padStart(2, '0')}`;

  // 4. Assert uniqueness against all existing receipt numbers in history
  while (existingIdentifiers.has(candidateId.toUpperCase())) {
    candidateSeq++;
    candidateId = `SA-${String(candidateSeq).padStart(2, '0')}`;
  }

  // 5. Monotonically record the assigned sequence
  try {
    localStorage.setItem(LAST_RECEIPT_SEQ_KEY, String(candidateSeq));
  } catch {
    // Ignore storage errors on read-only/private modes
  }

  return candidateId;
}
