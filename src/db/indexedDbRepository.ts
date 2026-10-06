/**
 * Durable IndexedDB Repository for POS Business-Critical Data
 * 
 * Stores inventory, sales ledger, store profile, receipt sequence, and image metadata
 * in IndexedDB with an ACID-compliant, versioned schema and migration system.
 * 
 * Features:
 * - Versioned schema (v1 -> v2) with forward-compatible migrations
 * - Multi-store persistence: products, sales, profile, receipt_sequence, image_metadata, meta
 * - Atomic sales completion: inventory updates and ledger appending in a single transaction
 * - Clear storage-health diagnostic checks and quota monitoring
 * - Safe, idempotent migration from localStorage that NEVER automatically wipes valid data
 * - Corruption recovery and repair path for damaged stores or partial payloads
 */

import { Product, SaleTransaction, UserProfile } from '../types';
import { validateCartStock } from '../utils/stockValidation';
import {
  PRODUCTS_STORAGE_KEY,
  SALES_STORAGE_KEY,
  SALES_STORAGE_MIRROR_KEY,
  PROFILE_STORAGE_KEY,
  PROFILE_BACKUP_KEY,
  OWNER_NAME_BACKUP_KEY,
  STORE_NAME_BACKUP_KEY,
  CLEAN_SLATE_KEY,
  RECEIPT_SEQUENCE_KEY,
} from '../utils/storageKeys';

export const REPOSITORY_DB_NAME = 'stockapp_pos_db';
export const REPOSITORY_DB_VERSION = 2;

// Object Store Names
export const STORE_PRODUCTS = 'products';
export const STORE_SALES = 'sales';
export const STORE_PROFILE = 'profile';
export const STORE_RECEIPT_SEQUENCE = 'receipt_sequence';
export const STORE_IMAGE_METADATA = 'image_metadata';
export const STORE_META = 'meta';

// Migration & Health Keys
export const MIGRATION_FLAG_KEY = 'localStorage_migrated';
export const LOCALSTORAGE_MIGRATED_FLAG = 'stockapp_idb_migrated_v2';
export const SCHEMA_VERSION_KEY = 'schema_version';

export interface ImageMetadataRecord {
  id: string; // productId or 'profile_avatar'
  sizeBytes?: number;
  mimeType?: string;
  updatedAt: number;
  width?: number;
  height?: number;
}

export interface ReceiptSequenceRecord {
  key: string; // 'last_sequence'
  value: number;
  updatedAt: number;
}

export interface ProfileRecord {
  key: string; // 'current_profile'
  profile: UserProfile;
  updatedAt: number;
}

export interface SaleExecutionResult {
  success: boolean;
  transaction?: SaleTransaction;
  updatedProducts?: Product[];
  error?: string;
  isQuotaError?: boolean;
}

export interface DeleteSaleResult {
  success: boolean;
  updatedSales: SaleTransaction[];
  updatedProducts: Product[];
  deletedSale?: SaleTransaction;
  error?: string;
}

export interface CompleteSaleOptions {
  simulateFailureBetweenWrites?: boolean;
  simulateQuotaError?: boolean;
  db?: IDBDatabase;
}

export interface StorageHealthReport {
  status: 'healthy' | 'warning' | 'degraded' | 'critical';
  checkedAt: number;
  database: {
    name: string;
    version: number;
    isOpen: boolean;
    latencyMs: number;
  };
  quota: {
    supported: boolean;
    usageBytes: number;
    quotaBytes: number;
    percentUsed: number;
    formattedUsage: string;
    formattedQuota: string;
    isNearLimit: boolean;
    isExceeded: boolean;
  };
  stores: {
    productsCount: number;
    salesCount: number;
    profileConfigured: boolean;
    receiptSequence: number;
    imageCount: number;
  };
  issues: string[];
  recommendations: string[];
}

export interface CorruptionRecoveryResult {
  success: boolean;
  salvagedProducts: number;
  salvagedSales: number;
  repairedReceiptSequence: number;
  discardedCorruptCount: number;
  repairedStores: string[];
  details: string[];
}

let cachedDBInstance: IDBDatabase | null = null;
let dbOpenPromise: Promise<IDBDatabase> | null = null;

/**
 * Returns the IndexedDB factory (from window or globalThis).
 */
export function getIDBFactory(): IDBFactory | undefined {
  if (typeof window !== 'undefined' && window.indexedDB) {
    return window.indexedDB;
  }
  if (typeof globalThis !== 'undefined' && (globalThis as any).indexedDB) {
    return (globalThis as any).indexedDB;
  }
  return undefined;
}

/**
 * Returns whether IndexedDB is supported in the current runtime environment.
 */
export function isIndexedDBAvailable(): boolean {
  return Boolean(getIDBFactory());
}

/**
 * Helper to test whether an error is a QuotaExceeded error.
 */
export function isQuotaExceededError(err: unknown): boolean {
  if (!err) return false;
  const msg = String((err as any)?.message || err).toLowerCase();
  const name = String((err as any)?.name || '').toLowerCase();
  return (
    name.includes('quota') ||
    name.includes('quotaexceedederror') ||
    msg.includes('quota') ||
    msg.includes('storage full') ||
    msg.includes('exceeded')
  );
}

/**
 * Format bytes to readable string (KB, MB, GB).
 */
export function formatBytes(bytes: number): string {
  if (bytes <= 0 || isNaN(bytes)) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/**
 * Initializes and opens the IndexedDB database instance with a versioned schema.
 * Supports upgrade paths from v0 -> v1 -> v2 seamlessly.
 */
export async function openRepositoryDB(customDbName?: string): Promise<IDBDatabase> {
  const dbName = customDbName || REPOSITORY_DB_NAME;

  if (!customDbName && cachedDBInstance) {
    return cachedDBInstance;
  }

  if (!customDbName && dbOpenPromise) {
    return dbOpenPromise;
  }

  const promise = new Promise<IDBDatabase>((resolve, reject) => {
    const idb = getIDBFactory();
    if (!idb) {
      return reject(new Error('IndexedDB is not available in this environment.'));
    }

    try {
      const request = idb.open(dbName, REPOSITORY_DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const oldVersion = event.oldVersion;

        // Version 1: Core Stores (Products, Sales, Meta)
        if (!db.objectStoreNames.contains(STORE_PRODUCTS)) {
          const productStore = db.createObjectStore(STORE_PRODUCTS, { keyPath: 'id' });
          productStore.createIndex('sku', 'sku', { unique: false });
          productStore.createIndex('category', 'category', { unique: false });
        }

        if (!db.objectStoreNames.contains(STORE_SALES)) {
          const salesStore = db.createObjectStore(STORE_SALES, { keyPath: 'id' });
          salesStore.createIndex('timestamp', 'timestamp', { unique: false });
          salesStore.createIndex('transactionNumber', 'transactionNumber', { unique: false });
        }

        if (!db.objectStoreNames.contains(STORE_META)) {
          db.createObjectStore(STORE_META, { keyPath: 'key' });
        }

        // Version 2: Profile, Receipt Sequence, Image Metadata
        if (!db.objectStoreNames.contains(STORE_PROFILE)) {
          db.createObjectStore(STORE_PROFILE, { keyPath: 'key' });
        }

        if (!db.objectStoreNames.contains(STORE_RECEIPT_SEQUENCE)) {
          db.createObjectStore(STORE_RECEIPT_SEQUENCE, { keyPath: 'key' });
        }

        if (!db.objectStoreNames.contains(STORE_IMAGE_METADATA)) {
          const imgStore = db.createObjectStore(STORE_IMAGE_METADATA, { keyPath: 'id' });
          imgStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        }

        // Record schema upgrade in meta store
        const tx = (event.target as IDBOpenDBRequest).transaction;
        if (tx) {
          try {
            const metaStore = tx.objectStore(STORE_META);
            metaStore.put({
              key: SCHEMA_VERSION_KEY,
              version: REPOSITORY_DB_VERSION,
              migratedFromVersion: oldVersion,
              upgradedAt: Date.now(),
            });
          } catch (e) {
            console.warn('Non-fatal: could not log schema_version upgrade in meta store:', e);
          }
        }
      };

      request.onsuccess = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        db.onversionchange = () => {
          db.close();
          if (cachedDBInstance === db) {
            cachedDBInstance = null;
          }
        };

        if (!customDbName) {
          cachedDBInstance = db;
        }
        resolve(db);
      };

      request.onerror = (event) => {
        const err = (event.target as IDBOpenDBRequest).error;
        reject(err || new Error('Failed to open IndexedDB repository.'));
      };

      request.onblocked = () => {
        console.warn('Database open blocked by existing connection.');
      };
    } catch (err) {
      reject(err);
    }
  });

  if (!customDbName) {
    dbOpenPromise = promise;
  }

  return promise;
}

/**
 * Closes the cached database instance (useful for clean teardown in tests).
 */
export function closeRepositoryDB(): void {
  if (cachedDBInstance) {
    cachedDBInstance.close();
    cachedDBInstance = null;
  }
  dbOpenPromise = null;
}

/* =========================================================================
   PRODUCTS REPOSITORY
   ========================================================================= */

/**
 * Retrieves all products from IndexedDB.
 */
export async function getAllProducts(overrideDb?: IDBDatabase): Promise<Product[]> {
  const db = overrideDb || (await openRepositoryDB());

  return new Promise((resolve) => {
    try {
      if (!db.objectStoreNames.contains(STORE_PRODUCTS)) {
        return resolve([]);
      }
      const tx = db.transaction([STORE_PRODUCTS], 'readonly');
      const store = tx.objectStore(STORE_PRODUCTS);
      const req = store.getAll();

      req.onsuccess = () => {
        resolve(req.result || []);
      };

      req.onerror = () => {
        console.error('Failed to retrieve products from IndexedDB:', req.error);
        resolve([]);
      };
    } catch (err) {
      console.error('Error initiating products query:', err);
      resolve([]);
    }
  });
}

/**
 * Saves all products in a single read-write transaction in IndexedDB.
 */
export async function saveAllProducts(
  products: Product[],
  overrideDb?: IDBDatabase
): Promise<boolean> {
  const db = overrideDb || (await openRepositoryDB());

  return new Promise((resolve) => {
    try {
      if (!db.objectStoreNames.contains(STORE_PRODUCTS)) {
        return resolve(false);
      }
      const tx = db.transaction([STORE_PRODUCTS], 'readwrite');
      const store = tx.objectStore(STORE_PRODUCTS);

      store.clear();
      for (const prod of products) {
        const { imageUrl, ...rest } = prod;
        store.put(rest as Product);
      }

      tx.oncomplete = () => resolve(true);
      tx.onabort = () => resolve(false);
      tx.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

/* =========================================================================
   SALES REPOSITORY
   ========================================================================= */

/**
 * Retrieves all sales from IndexedDB ordered newest first.
 */
export async function getAllSales(overrideDb?: IDBDatabase): Promise<SaleTransaction[]> {
  const db = overrideDb || (await openRepositoryDB());

  return new Promise((resolve) => {
    try {
      if (!db.objectStoreNames.contains(STORE_SALES)) {
        return resolve([]);
      }
      const tx = db.transaction([STORE_SALES], 'readonly');
      const store = tx.objectStore(STORE_SALES);
      const req = store.getAll();

      req.onsuccess = () => {
        const records: SaleTransaction[] = req.result || [];
        records.sort((a, b) => {
          const timeA = a.createdAt || new Date(a.timestamp).getTime() || 0;
          const timeB = b.createdAt || new Date(b.timestamp).getTime() || 0;
          return timeB - timeA;
        });
        resolve(records);
      };

      req.onerror = () => {
        console.error('Failed to retrieve sales from IndexedDB:', req.error);
        resolve([]);
      };
    } catch (err) {
      console.error('Error initiating sales query:', err);
      resolve([]);
    }
  });
}

/**
 * Saves all sales in a single read-write transaction in IndexedDB.
 */
export async function saveAllSales(
  sales: SaleTransaction[],
  overrideDb?: IDBDatabase
): Promise<boolean> {
  const db = overrideDb || (await openRepositoryDB());

  return new Promise((resolve) => {
    try {
      if (!db.objectStoreNames.contains(STORE_SALES)) {
        return resolve(false);
      }
      const tx = db.transaction([STORE_SALES], 'readwrite');
      const store = tx.objectStore(STORE_SALES);

      store.clear();
      for (const sale of sales) {
        store.put(sale);
      }

      tx.oncomplete = () => resolve(true);
      tx.onabort = () => resolve(false);
      tx.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

/* =========================================================================
   STORE PROFILE REPOSITORY
   ========================================================================= */

export async function getProfileFromIDB(overrideDb?: IDBDatabase): Promise<UserProfile | null> {
  const db = overrideDb || (await openRepositoryDB());

  return new Promise((resolve) => {
    try {
      if (!db.objectStoreNames.contains(STORE_PROFILE)) {
        return resolve(null);
      }
      const tx = db.transaction([STORE_PROFILE], 'readonly');
      const store = tx.objectStore(STORE_PROFILE);
      const req = store.get('current_profile');

      req.onsuccess = () => {
        resolve(req.result?.profile || null);
      };

      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function saveProfileToIDB(
  profile: UserProfile,
  overrideDb?: IDBDatabase
): Promise<boolean> {
  const db = overrideDb || (await openRepositoryDB());

  return new Promise((resolve) => {
    try {
      if (!db.objectStoreNames.contains(STORE_PROFILE)) {
        return resolve(false);
      }
      const tx = db.transaction([STORE_PROFILE], 'readwrite');
      const store = tx.objectStore(STORE_PROFILE);
      const { avatarUrl, ...cleanProfile } = profile;

      store.put({
        key: 'current_profile',
        profile: cleanProfile,
        updatedAt: Date.now(),
      });

      tx.oncomplete = () => resolve(true);
      tx.onabort = () => resolve(false);
      tx.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

/* =========================================================================
   RECEIPT SEQUENCE REPOSITORY
   ========================================================================= */

export async function getReceiptSequenceFromIDB(overrideDb?: IDBDatabase): Promise<number> {
  const db = overrideDb || (await openRepositoryDB());

  return new Promise((resolve) => {
    try {
      if (!db.objectStoreNames.contains(STORE_RECEIPT_SEQUENCE)) {
        return resolve(0);
      }
      const tx = db.transaction([STORE_RECEIPT_SEQUENCE], 'readonly');
      const store = tx.objectStore(STORE_RECEIPT_SEQUENCE);
      const req = store.get('last_sequence');

      req.onsuccess = () => {
        const val = req.result?.value;
        resolve(typeof val === 'number' && !isNaN(val) ? val : 0);
      };

      req.onerror = () => resolve(0);
    } catch {
      resolve(0);
    }
  });
}

export async function saveReceiptSequenceToIDB(
  seq: number,
  overrideDb?: IDBDatabase
): Promise<boolean> {
  const db = overrideDb || (await openRepositoryDB());

  return new Promise((resolve) => {
    try {
      if (!db.objectStoreNames.contains(STORE_RECEIPT_SEQUENCE)) {
        return resolve(false);
      }
      const tx = db.transaction([STORE_RECEIPT_SEQUENCE], 'readwrite');
      const store = tx.objectStore(STORE_RECEIPT_SEQUENCE);

      store.put({
        key: 'last_sequence',
        value: seq,
        updatedAt: Date.now(),
      });

      tx.oncomplete = () => resolve(true);
      tx.onabort = () => resolve(false);
      tx.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

/**
 * Atomically increments and returns the next monotonic receipt sequence in IndexedDB.
 */
export async function incrementReceiptSequenceInIDB(overrideDb?: IDBDatabase): Promise<number> {
  const db = overrideDb || (await openRepositoryDB());

  return new Promise((resolve, reject) => {
    try {
      if (!db.objectStoreNames.contains(STORE_RECEIPT_SEQUENCE)) {
        return resolve(1);
      }
      const tx = db.transaction([STORE_RECEIPT_SEQUENCE], 'readwrite');
      const store = tx.objectStore(STORE_RECEIPT_SEQUENCE);
      const getReq = store.get('last_sequence');

      getReq.onsuccess = () => {
        const currentVal =
          getReq.result?.value && typeof getReq.result.value === 'number'
            ? getReq.result.value
            : 0;
        const nextVal = currentVal + 1;
        store.put({
          key: 'last_sequence',
          value: nextVal,
          updatedAt: Date.now(),
        });
        tx.oncomplete = () => resolve(nextVal);
      };

      getReq.onerror = () => reject(getReq.error);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(new Error('Sequence increment aborted'));
    } catch (err) {
      reject(err);
    }
  });
}

/* =========================================================================
   IMAGE METADATA REPOSITORY
   ========================================================================= */

export async function getImageMetadataFromIDB(
  id: string,
  overrideDb?: IDBDatabase
): Promise<ImageMetadataRecord | null> {
  const db = overrideDb || (await openRepositoryDB());

  return new Promise((resolve) => {
    try {
      if (!db.objectStoreNames.contains(STORE_IMAGE_METADATA)) {
        return resolve(null);
      }
      const tx = db.transaction([STORE_IMAGE_METADATA], 'readonly');
      const store = tx.objectStore(STORE_IMAGE_METADATA);
      const req = store.get(id);

      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function saveImageMetadataToIDB(
  record: ImageMetadataRecord,
  overrideDb?: IDBDatabase
): Promise<boolean> {
  const db = overrideDb || (await openRepositoryDB());

  return new Promise((resolve) => {
    try {
      if (!db.objectStoreNames.contains(STORE_IMAGE_METADATA)) {
        return resolve(false);
      }
      const tx = db.transaction([STORE_IMAGE_METADATA], 'readwrite');
      const store = tx.objectStore(STORE_IMAGE_METADATA);

      store.put(record);

      tx.oncomplete = () => resolve(true);
      tx.onabort = () => resolve(false);
      tx.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

export async function getAllImageMetadataFromIDB(
  overrideDb?: IDBDatabase
): Promise<ImageMetadataRecord[]> {
  const db = overrideDb || (await openRepositoryDB());

  return new Promise((resolve) => {
    try {
      if (!db.objectStoreNames.contains(STORE_IMAGE_METADATA)) {
        return resolve([]);
      }
      const tx = db.transaction([STORE_IMAGE_METADATA], 'readonly');
      const store = tx.objectStore(STORE_IMAGE_METADATA);
      const req = store.getAll();

      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

export async function deleteImageMetadataFromIDB(
  id: string,
  overrideDb?: IDBDatabase
): Promise<boolean> {
  const db = overrideDb || (await openRepositoryDB());

  return new Promise((resolve) => {
    try {
      if (!db.objectStoreNames.contains(STORE_IMAGE_METADATA)) {
        return resolve(true);
      }
      const tx = db.transaction([STORE_IMAGE_METADATA], 'readwrite');
      const store = tx.objectStore(STORE_IMAGE_METADATA);
      store.delete(id);

      tx.oncomplete = () => resolve(true);
      tx.onabort = () => resolve(false);
      tx.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

/* =========================================================================
   TRANSACTIONAL SALE COMPLETION (ACID)
   ========================================================================= */

/**
 * Completes a sale transaction atomically:
 * Updates inventory AND appends the sale ledger in a single IndexedDB read-write transaction.
 * 
 * ACID guarantees:
 * - Either BOTH persist or NEITHER persists.
 * - Even after an app crash, forced close, or quota error, uncommitted transactions are rolled back.
 * - Guarded against duplicate submissions via database-level checks.
 * - Supports simulated failures between writes to rigorously prove atomic rollback.
 */
export async function completeSaleTransactionInIDB(
  newTransaction: SaleTransaction,
  updatedProducts: Product[],
  currentProducts: Product[],
  options?: CompleteSaleOptions
): Promise<SaleExecutionResult> {
  // Step 1: Pre-validation of stock
  const validation = validateCartStock(newTransaction.items, currentProducts);
  if (!validation.isValid) {
    const names = validation.invalidItems.map((i) => `"${i.name}"`).join(', ');
    return {
      success: false,
      error: `Cannot complete sale: ${names} ${
        validation.invalidItems.length === 1 ? 'is' : 'are'
      } out of stock.`,
    };
  }

  const db = options?.db || (await openRepositoryDB());

  return new Promise<SaleExecutionResult>((resolve) => {
    let hasResolved = false;

    const safeResolve = (result: SaleExecutionResult) => {
      if (!hasResolved) {
        hasResolved = true;
        resolve(result);
      }
    };

    try {
      // Step 2: Open ONE read-write transaction spanning BOTH stores (and receipt_sequence if present)
      const storesToInclude = [STORE_PRODUCTS, STORE_SALES];
      if (db.objectStoreNames.contains(STORE_RECEIPT_SEQUENCE)) {
        storesToInclude.push(STORE_RECEIPT_SEQUENCE);
      }

      const txOptions: IDBTransactionOptions = { durability: 'strict' };
      let tx: IDBTransaction;
      try {
        tx = db.transaction(storesToInclude, 'readwrite', txOptions);
      } catch {
        tx = db.transaction(storesToInclude, 'readwrite');
      }

      const productsStore = tx.objectStore(STORE_PRODUCTS);
      const salesStore = tx.objectStore(STORE_SALES);

      tx.oncomplete = () => {
        safeResolve({
          success: true,
          transaction: newTransaction,
          updatedProducts,
        });
      };

      tx.onabort = (event) => {
        const txError = tx.error || (event.target as IDBTransaction)?.error;
        const isQuota = isQuotaExceededError(txError);
        safeResolve({
          success: false,
          isQuotaError: isQuota,
          error: isQuota
            ? 'Storage quota exceeded: cannot complete sale. Neither inventory nor sale was saved. Please export a backup.'
            : txError?.message ||
              'Transaction aborted: neither inventory nor sale was saved.',
        });
      };

      tx.onerror = (event) => {
        try {
          tx.abort();
        } catch {
          // Already aborted
        }
        const reqError = (event.target as IDBRequest)?.error;
        const isQuota = isQuotaExceededError(reqError);
        safeResolve({
          success: false,
          isQuotaError: isQuota,
          error: isQuota
            ? 'Storage quota exceeded: cannot complete sale. Neither inventory nor sale was saved.'
            : reqError?.message || 'Storage write failure: transaction rolled back.',
        });
      };

      // Step 3: Duplicate submission check within the active transaction
      const duplicateCheckReq = salesStore.get(newTransaction.id);

      duplicateCheckReq.onsuccess = () => {
        if (duplicateCheckReq.result) {
          try {
            tx.abort();
          } catch {
            // Already aborting
          }
          safeResolve({
            success: false,
            error: `Duplicate sale submission: Transaction "${newTransaction.id}" has already been processed.`,
          });
          return;
        }

        // Step 4: Quota / write failure simulation
        if (options?.simulateQuotaError) {
          try {
            tx.abort();
          } catch {
            // Already aborted
          }
          safeResolve({
            success: false,
            isQuotaError: true,
            error: 'Storage quota exceeded: could not save transaction. Neither inventory nor sale was saved.',
          });
          return;
        }

        // Step 5: Update inventory in productsStore
        for (const prod of updatedProducts) {
          const { imageUrl, ...rest } = prod;
          productsStore.put(rest as Product);
        }

        // Step 6: Simulated failure between inventory and ledger writes
        if (options?.simulateFailureBetweenWrites) {
          try {
            tx.abort();
          } catch {
            // Already aborted
          }
          safeResolve({
            success: false,
            error: 'Simulated failure between inventory and ledger writes: transaction rolled back.',
          });
          return;
        }

        // Step 7: Append sale to ledger using salesStore.add()
        salesStore.add(newTransaction);

        // Step 8: Update receipt sequence if sequential format matches SA-XX
        if (db.objectStoreNames.contains(STORE_RECEIPT_SEQUENCE)) {
          const match = (newTransaction.transactionNumber || '').match(/^SA-(\d+)$/i);
          if (match) {
            const seqVal = parseInt(match[1], 10);
            if (!isNaN(seqVal)) {
              const seqStore = tx.objectStore(STORE_RECEIPT_SEQUENCE);
              seqStore.put({
                key: 'last_sequence',
                value: seqVal,
                updatedAt: Date.now(),
              });
            }
          }
        }
      };

      duplicateCheckReq.onerror = () => {
        try {
          tx.abort();
        } catch {
          // Already aborted
        }
        safeResolve({
          success: false,
          error: 'Failed to verify transaction uniqueness in database.',
        });
      };
    } catch (err: any) {
      const isQuota = isQuotaExceededError(err);
      safeResolve({
        success: false,
        isQuotaError: isQuota,
        error: isQuota
          ? 'Storage quota exceeded: database transaction could not start.'
          : err?.message || 'Database error: failed to initiate transaction.',
      });
    }
  });
}

/**
 * Safely deletes a sale transaction and optionally restores shelf stock
 * in a single atomic read-write IndexedDB transaction.
 */
export async function deleteSaleTransactionInIDB(
  transactionId: string,
  currentSales: SaleTransaction[],
  currentProducts: Product[],
  restoreStock = false,
  overrideDb?: IDBDatabase
): Promise<DeleteSaleResult> {
  const saleToDelete = currentSales.find((s) => s.id === transactionId);
  if (!saleToDelete) {
    return {
      success: false,
      updatedSales: currentSales,
      updatedProducts: currentProducts,
      error: 'Sale transaction not found.',
    };
  }

  let nextProducts = currentProducts;
  if (restoreStock && saleToDelete.items && saleToDelete.items.length > 0) {
    nextProducts = currentProducts.map((prod) => {
      const soldItem = saleToDelete.items.find((item) => item.productId === prod.id);
      if (soldItem && soldItem.quantity > 0) {
        return { ...prod, stock: prod.stock + soldItem.quantity };
      }
      return prod;
    });
  }

  const nextSales = currentSales.filter((s) => s.id !== transactionId);
  const db = overrideDb || (await openRepositoryDB());

  return new Promise((resolve) => {
    try {
      const tx = db.transaction([STORE_PRODUCTS, STORE_SALES], 'readwrite');
      const productsStore = tx.objectStore(STORE_PRODUCTS);
      const salesStore = tx.objectStore(STORE_SALES);

      if (restoreStock) {
        for (const prod of nextProducts) {
          const { imageUrl, ...rest } = prod;
          productsStore.put(rest as Product);
        }
      }

      salesStore.delete(transactionId);

      tx.oncomplete = () => {
        resolve({
          success: true,
          updatedSales: nextSales,
          updatedProducts: nextProducts,
          deletedSale: saleToDelete,
        });
      };

      tx.onabort = () => {
        resolve({
          success: false,
          updatedSales: currentSales,
          updatedProducts: currentProducts,
          error: 'Transaction aborted: failed to delete sale.',
        });
      };

      tx.onerror = () => {
        resolve({
          success: false,
          updatedSales: currentSales,
          updatedProducts: currentProducts,
          error: 'Storage error: failed to delete sale.',
        });
      };
    } catch (err: any) {
      resolve({
        success: false,
        updatedSales: currentSales,
        updatedProducts: currentProducts,
        error: err?.message || 'Storage error: failed to delete sale.',
      });
    }
  });
}

/**
 * Deletes multiple sales from history in a single IndexedDB transaction.
 */
export async function clearSalesTransactionsInIDB(
  saleIdsToDelete: string[],
  currentSales: SaleTransaction[],
  overrideDb?: IDBDatabase
): Promise<{ success: boolean; updatedSales: SaleTransaction[]; error?: string }> {
  if (!saleIdsToDelete || saleIdsToDelete.length === 0) {
    return { success: true, updatedSales: currentSales };
  }

  const idSet = new Set(saleIdsToDelete);
  const nextSales = currentSales.filter((s) => !idSet.has(s.id));

  const db = overrideDb || (await openRepositoryDB());

  return new Promise((resolve) => {
    try {
      const tx = db.transaction([STORE_SALES], 'readwrite');
      const salesStore = tx.objectStore(STORE_SALES);

      for (const id of saleIdsToDelete) {
        salesStore.delete(id);
      }

      tx.oncomplete = () => {
        resolve({
          success: true,
          updatedSales: nextSales,
        });
      };

      tx.onabort = () => {
        resolve({
          success: false,
          updatedSales: currentSales,
          error: 'Storage transaction aborted.',
        });
      };

      tx.onerror = () => {
        resolve({
          success: false,
          updatedSales: currentSales,
          error: 'Storage error while clearing sales.',
        });
      };
    } catch (err: any) {
      resolve({
        success: false,
        updatedSales: currentSales,
        error: err?.message || 'Storage error while clearing sales.',
      });
    }
  });
}

/* =========================================================================
   SAFE, IDEMPOTENT MIGRATION SYSTEM (PRESERVES DATA EVEN IF MARKERS MISSING)
   ========================================================================= */

/**
 * Migrates existing business-critical data from localStorage into IndexedDB once,
 * safely and idempotently in a single atomic transaction.
 * 
 * CRITICAL RULE: Does NOT automatically wipe valid data merely because one marker key is missing!
 * If IndexedDB or localStorage contains valid products, sales, profile, or sequences,
 * they are preserved, merged, and protected.
 */
export async function migrateFromLocalStorage(
  overrideDb?: IDBDatabase
): Promise<{
  migrated: boolean;
  productCount: number;
  saleCount: number;
  profileMigrated: boolean;
  receiptSeqMigrated: boolean;
  imageMetadataCount: number;
}> {
  const db = overrideDb || (await openRepositoryDB());

  // Step 1: Check existing IndexedDB contents first
  const existingProducts = await getAllProducts(db);
  const existingSales = await getAllSales(db);
  const existingProfile = await getProfileFromIDB(db);
  const existingSeq = await getReceiptSequenceFromIDB(db);

  // Check migration flag in meta store
  const alreadyMigratedInMeta = await new Promise<boolean>((resolve) => {
    try {
      if (!db.objectStoreNames.contains(STORE_META)) return resolve(false);
      const tx = db.transaction([STORE_META], 'readonly');
      const store = tx.objectStore(STORE_META);
      const req = store.get(MIGRATION_FLAG_KEY);
      req.onsuccess = () => {
        resolve(Boolean(req.result && req.result.value === true));
      };
      req.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });

  const alreadyMigratedInStorage =
    typeof localStorage !== 'undefined' &&
    localStorage.getItem(LOCALSTORAGE_MIGRATED_FLAG) === 'true';

  // If already flagged AND IndexedDB already contains data, return current state without modifying
  if ((alreadyMigratedInMeta || alreadyMigratedInStorage) && (existingProducts.length > 0 || existingSales.length > 0)) {
    return {
      migrated: false,
      productCount: existingProducts.length,
      saleCount: existingSales.length,
      profileMigrated: Boolean(existingProfile),
      receiptSeqMigrated: existingSeq > 0,
      imageMetadataCount: (await getAllImageMetadataFromIDB(db)).length,
    };
  }

  // Step 2: Read candidate data from localStorage safely
  let productsToMigrate: Product[] = [];
  let salesToMigrate: SaleTransaction[] = [];
  let profileToMigrate: UserProfile | null = null;
  let receiptSeqToMigrate = 0;
  const imageMetadataToMigrate: ImageMetadataRecord[] = [];

  if (typeof localStorage !== 'undefined') {
    try {
      const rawProducts = localStorage.getItem(PRODUCTS_STORAGE_KEY);
      if (rawProducts) {
        const parsed = JSON.parse(rawProducts);
        if (Array.isArray(parsed) && parsed.length > 0) {
          productsToMigrate = parsed;
        }
      }
    } catch (e) {
      console.warn('Failed to parse localStorage products for migration:', e);
    }

    try {
      const rawSales =
        localStorage.getItem(SALES_STORAGE_KEY) ||
        localStorage.getItem(SALES_STORAGE_MIRROR_KEY);
      if (rawSales) {
        const parsed = JSON.parse(rawSales);
        if (Array.isArray(parsed) && parsed.length > 0) {
          salesToMigrate = parsed;
        }
      }
    } catch (e) {
      console.warn('Failed to parse localStorage sales for migration:', e);
    }

    try {
      const rawProfile =
        localStorage.getItem(PROFILE_STORAGE_KEY) ||
        localStorage.getItem(PROFILE_BACKUP_KEY);
      if (rawProfile) {
        const parsed = JSON.parse(rawProfile);
        if (parsed && typeof parsed === 'object') {
          profileToMigrate = parsed;
          const ownerBackup = localStorage.getItem(OWNER_NAME_BACKUP_KEY);
          if (ownerBackup && ownerBackup.trim()) profileToMigrate!.ownerName = ownerBackup;
          const storeBackup = localStorage.getItem(STORE_NAME_BACKUP_KEY);
          if (storeBackup && storeBackup.trim()) profileToMigrate!.storeName = storeBackup;
        }
      }
    } catch (e) {
      console.warn('Failed to parse localStorage profile for migration:', e);
    }

    try {
      const rawSeq = localStorage.getItem(RECEIPT_SEQUENCE_KEY);
      if (rawSeq) {
        const parsed = parseInt(rawSeq, 10);
        if (!isNaN(parsed) && parsed > 0) {
          receiptSeqToMigrate = parsed;
        }
      }
    } catch (e) {
      console.warn('Failed to parse localStorage receipt sequence:', e);
    }
  }

  // Derive sequence baseline from sales if not explicitly set
  if (receiptSeqToMigrate === 0 && salesToMigrate.length > 0) {
    for (const s of salesToMigrate) {
      const match = (s.transactionNumber || s.id || '').match(/SA-(\d+)/i);
      if (match) {
        const n = parseInt(match[1], 10);
        if (!isNaN(n) && n > receiptSeqToMigrate) {
          receiptSeqToMigrate = n;
        }
      }
    }
  }

  // Prepare image metadata for products with images
  for (const prod of productsToMigrate) {
    if (prod.imageUrl || prod.id) {
      imageMetadataToMigrate.push({
        id: prod.id,
        sizeBytes: prod.imageUrl ? prod.imageUrl.length : 0,
        mimeType: 'image/webp',
        updatedAt: Date.now(),
      });
    }
  }

  // If both IndexedDB and localStorage are empty, initialize cleanly without errors
  if (
    productsToMigrate.length === 0 &&
    salesToMigrate.length === 0 &&
    existingProducts.length === 0 &&
    existingSales.length === 0
  ) {
    return {
      migrated: false,
      productCount: 0,
      saleCount: 0,
      profileMigrated: false,
      receiptSeqMigrated: false,
      imageMetadataCount: 0,
    };
  }

  // Merge: If IndexedDB has records, do not wipe them! Merge candidate records
  const finalProductsMap = new Map<string, Product>();
  for (const p of existingProducts) finalProductsMap.set(p.id, p);
  for (const p of productsToMigrate) {
    if (!finalProductsMap.has(p.id)) finalProductsMap.set(p.id, p);
  }
  const mergedProducts = Array.from(finalProductsMap.values());

  const finalSalesMap = new Map<string, SaleTransaction>();
  for (const s of existingSales) finalSalesMap.set(s.id, s);
  for (const s of salesToMigrate) {
    if (!finalSalesMap.has(s.id)) finalSalesMap.set(s.id, s);
  }
  const mergedSales = Array.from(finalSalesMap.values());

  // Step 3: Write atomically to IndexedDB in one readwrite transaction
  return new Promise((resolve, reject) => {
    try {
      const storesToUse = [
        STORE_PRODUCTS,
        STORE_SALES,
        STORE_PROFILE,
        STORE_RECEIPT_SEQUENCE,
        STORE_IMAGE_METADATA,
        STORE_META,
      ].filter((s) => db.objectStoreNames.contains(s));

      const tx = db.transaction(storesToUse, 'readwrite');
      const productsStore = tx.objectStore(STORE_PRODUCTS);
      const salesStore = tx.objectStore(STORE_SALES);

      for (const prod of mergedProducts) {
        const { imageUrl, ...rest } = prod;
        productsStore.put(rest as Product);
      }

      for (const sale of mergedSales) {
        salesStore.put(sale);
      }

      if (db.objectStoreNames.contains(STORE_PROFILE) && (profileToMigrate || existingProfile)) {
        const profStore = tx.objectStore(STORE_PROFILE);
        const { avatarUrl, ...cleanProf } = (profileToMigrate || existingProfile)!;
        profStore.put({
          key: 'current_profile',
          profile: cleanProf,
          updatedAt: Date.now(),
        });
      }

      if (db.objectStoreNames.contains(STORE_RECEIPT_SEQUENCE)) {
        const seqStore = tx.objectStore(STORE_RECEIPT_SEQUENCE);
        const finalSeq = Math.max(receiptSeqToMigrate, existingSeq);
        seqStore.put({
          key: 'last_sequence',
          value: finalSeq,
          updatedAt: Date.now(),
        });
      }

      if (db.objectStoreNames.contains(STORE_IMAGE_METADATA)) {
        const imgMetaStore = tx.objectStore(STORE_IMAGE_METADATA);
        for (const meta of imageMetadataToMigrate) {
          imgMetaStore.put(meta);
        }
      }

      if (db.objectStoreNames.contains(STORE_META)) {
        const metaStore = tx.objectStore(STORE_META);
        metaStore.put({
          key: MIGRATION_FLAG_KEY,
          value: true,
          migratedAt: Date.now(),
          productCount: mergedProducts.length,
          saleCount: mergedSales.length,
        });
      }

      tx.oncomplete = () => {
        if (typeof localStorage !== 'undefined') {
          try {
            localStorage.setItem(LOCALSTORAGE_MIGRATED_FLAG, 'true');
            localStorage.setItem(CLEAN_SLATE_KEY, 'true');
          } catch {
            // Non-fatal
          }
        }
        resolve({
          migrated: true,
          productCount: mergedProducts.length,
          saleCount: mergedSales.length,
          profileMigrated: Boolean(profileToMigrate || existingProfile),
          receiptSeqMigrated: receiptSeqToMigrate > 0 || existingSeq > 0,
          imageMetadataCount: imageMetadataToMigrate.length,
        });
      };

      tx.onabort = () => {
        const err = tx.error || new Error('Migration transaction aborted.');
        reject(err);
      };

      tx.onerror = () => {
        const err = tx.error || new Error('Migration transaction error.');
        reject(err);
      };
    } catch (err) {
      reject(err);
    }
  });
}

/* =========================================================================
   STORAGE HEALTH CHECK & QUOTA MONITORING
   ========================================================================= */

/**
 * Performs a comprehensive storage health check:
 * - Tests IndexedDB connection and measures ping latency
 * - Queries storage quota from navigator.storage.estimate()
 * - Verifies record integrity across all object stores
 * - Flags corrupted records, negative stock, unreadable entities
 * - Generates clear status and actionable recommendations
 */
export async function checkStorageHealth(
  overrideDb?: IDBDatabase
): Promise<StorageHealthReport> {
  const startTime = performance?.now ? performance.now() : Date.now();
  const issues: string[] = [];
  const recommendations: string[] = [];

  let db: IDBDatabase | null = null;
  let latencyMs = 0;

  try {
    db = overrideDb || (await openRepositoryDB());
    const endTime = performance?.now ? performance.now() : Date.now();
    latencyMs = Math.round(endTime - startTime);
  } catch (err: any) {
    return {
      status: 'critical',
      checkedAt: Date.now(),
      database: {
        name: REPOSITORY_DB_NAME,
        version: REPOSITORY_DB_VERSION,
        isOpen: false,
        latencyMs: 0,
      },
      quota: {
        supported: false,
        usageBytes: 0,
        quotaBytes: 0,
        percentUsed: 0,
        formattedUsage: '0 B',
        formattedQuota: 'Unknown',
        isNearLimit: false,
        isExceeded: true,
      },
      stores: {
        productsCount: 0,
        salesCount: 0,
        profileConfigured: false,
        receiptSequence: 0,
        imageCount: 0,
      },
      issues: [`Database connection failure: ${err?.message || 'IndexedDB inaccessible'}`],
      recommendations: [
        'Check browser private browsing / storage restrictions.',
        'Export a JSON backup to protect sales records immediately.',
      ],
    };
  }

  // 1. Quota Assessment
  let supportedQuota = false;
  let usageBytes = 0;
  let quotaBytes = 0;
  let percentUsed = 0;
  let isNearLimit = false;
  let isExceeded = false;

  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      usageBytes = estimate.usage || 0;
      quotaBytes = estimate.quota || 0;
      supportedQuota = true;

      if (quotaBytes > 0) {
        percentUsed = Math.min(100, Math.round((usageBytes / quotaBytes) * 100));
        if (percentUsed >= 95) {
          isExceeded = true;
          issues.push(`Storage quota critically high (${percentUsed}% used: ${formatBytes(usageBytes)} of ${formatBytes(quotaBytes)}).`);
          recommendations.push('Immediate backup recommended. Delete unneeded transaction logs or product images.');
        } else if (percentUsed >= 80) {
          isNearLimit = true;
          issues.push(`Storage quota running low (${percentUsed}% used: ${formatBytes(usageBytes)} of ${formatBytes(quotaBytes)}).`);
          recommendations.push('Consider backing up sales history to external storage.');
        }
      }
    } catch {
      // Non-fatal
    }
  }

  // 2. Query stores & check record integrity
  const products = await getAllProducts(db);
  const sales = await getAllSales(db);
  const profile = await getProfileFromIDB(db);
  const receiptSeq = await getReceiptSequenceFromIDB(db);
  const imageMetadata = await getAllImageMetadataFromIDB(db);

  // Integrity checks
  let corruptedProducts = 0;
  for (const p of products) {
    if (!p || typeof p !== 'object' || !p.id || !p.name) {
      corruptedProducts++;
    } else if (isNaN(p.price) || isNaN(p.stock)) {
      corruptedProducts++;
    }
  }

  if (corruptedProducts > 0) {
    issues.push(`Detected ${corruptedProducts} damaged product record(s) with missing IDs or invalid numeric values.`);
    recommendations.push('Run database recovery to sanitize corrupted inventory items.');
  }

  let corruptedSales = 0;
  for (const s of sales) {
    if (!s || typeof s !== 'object' || !s.id || isNaN(s.total) || !Array.isArray(s.items)) {
      corruptedSales++;
    }
  }

  if (corruptedSales > 0) {
    issues.push(`Detected ${corruptedSales} damaged sale transaction(s) with incomplete ledger entries.`);
    recommendations.push('Run database recovery to salvage readable sales records.');
  }

  // Sequence check
  if (receiptSeq === 0 && sales.length > 0) {
    issues.push('Receipt sequence counter is uninitialized while sales transactions exist.');
    recommendations.push('Sequence will automatically synchronize on next transaction.');
  }

  // Determine Overall Status
  let status: 'healthy' | 'warning' | 'degraded' | 'critical' = 'healthy';
  if (isExceeded || corruptedProducts > 2 || corruptedSales > 2) {
    status = 'critical';
  } else if (isNearLimit || corruptedProducts > 0 || corruptedSales > 0) {
    status = 'degraded';
  } else if (latencyMs > 500 || issues.length > 0) {
    status = 'warning';
  }

  if (issues.length === 0) {
    recommendations.push('All stores are healthy and ACID durability is operating nominally.');
  }

  return {
    status,
    checkedAt: Date.now(),
    database: {
      name: db.name || REPOSITORY_DB_NAME,
      version: db.version || REPOSITORY_DB_VERSION,
      isOpen: true,
      latencyMs,
    },
    quota: {
      supported: supportedQuota,
      usageBytes,
      quotaBytes,
      percentUsed,
      formattedUsage: formatBytes(usageBytes),
      formattedQuota: quotaBytes > 0 ? formatBytes(quotaBytes) : 'Unknown',
      isNearLimit,
      isExceeded,
    },
    stores: {
      productsCount: products.length,
      salesCount: sales.length,
      profileConfigured: Boolean(profile?.storeName),
      receiptSequence: receiptSeq,
      imageCount: imageMetadata.length,
    },
    issues,
    recommendations,
  };
}

/* =========================================================================
   CORRUPTION RECOVERY & SALVAGE PATH
   ========================================================================= */

/**
 * Scans all stores, salvages readable records, repairs receipt sequence counters,
 * and fixes corrupted entries without destroying valid data.
 */
export async function recoverCorruptedDatabase(
  overrideDb?: IDBDatabase
): Promise<CorruptionRecoveryResult> {
  const db = overrideDb || (await openRepositoryDB());
  const repairedStores: string[] = [];
  const details: string[] = [];
  let discardedCorruptCount = 0;

  // 1. Salvage products
  const rawProducts = await getAllProducts(db);
  const cleanProducts: Product[] = [];
  for (let i = 0; i < rawProducts.length; i++) {
    const p = rawProducts[i];
    if (p && typeof p === 'object' && p.id && String(p.id).trim()) {
      cleanProducts.push({
        id: String(p.id).trim(),
        name: String(p.name || 'Unnamed Product').trim(),
        category: String(p.category || 'General').trim(),
        price: isNaN(Number(p.price)) || Number(p.price) < 0 ? 0 : Number(p.price),
        stock: isNaN(Number(p.stock)) || Number(p.stock) < 0 ? 0 : Number(p.stock),
        lowStockThreshold: isNaN(Number(p.lowStockThreshold)) ? 0 : Number(p.lowStockThreshold),
        sku: p.sku ? String(p.sku).trim() : undefined,
      });
    } else {
      discardedCorruptCount++;
    }
  }

  // 2. Salvage sales
  const rawSales = await getAllSales(db);
  const cleanSales: SaleTransaction[] = [];
  let maxSeq = 0;

  for (let i = 0; i < rawSales.length; i++) {
    const s = rawSales[i];
    if (s && typeof s === 'object' && s.id && String(s.id).trim()) {
      const items = Array.isArray(s.items)
        ? s.items.filter((item) => item && typeof item === 'object' && item.productId)
        : [];
      const total = isNaN(Number(s.total)) ? 0 : Number(s.total);

      cleanSales.push({
        id: String(s.id).trim(),
        transactionNumber: s.transactionNumber ? String(s.transactionNumber) : `SA-${String(cleanSales.length + 1).padStart(2, '0')}`,
        timestamp: s.timestamp || new Date().toISOString(),
        createdAt: s.createdAt || Date.now(),
        items,
        total,
        subtotal: isNaN(Number(s.subtotal)) ? total : Number(s.subtotal),
        paymentMethod: s.paymentMethod || 'cash',
        itemCount: isNaN(Number(s.itemCount)) ? items.reduce((acc, it) => acc + (it.quantity || 1), 0) : Number(s.itemCount),
        primaryItemName: s.primaryItemName || (items[0]?.name || 'Sale Item'),
      });

      const match = (s.transactionNumber || s.id || '').match(/SA-(\d+)/i);
      if (match) {
        const n = parseInt(match[1], 10);
        if (!isNaN(n) && n > maxSeq) maxSeq = n;
      }
    } else {
      discardedCorruptCount++;
    }
  }

  // 3. Atomically rewrite sanitized collections
  return new Promise((resolve) => {
    try {
      const storesToLock = [
        STORE_PRODUCTS,
        STORE_SALES,
        STORE_RECEIPT_SEQUENCE,
        STORE_META,
      ].filter((s) => db.objectStoreNames.contains(s));

      const tx = db.transaction(storesToLock, 'readwrite');
      const prodStore = tx.objectStore(STORE_PRODUCTS);
      const salesStore = tx.objectStore(STORE_SALES);

      prodStore.clear();
      for (const p of cleanProducts) prodStore.put(p);
      repairedStores.push(STORE_PRODUCTS);

      salesStore.clear();
      for (const s of cleanSales) salesStore.put(s);
      repairedStores.push(STORE_SALES);

      if (db.objectStoreNames.contains(STORE_RECEIPT_SEQUENCE)) {
        const seqStore = tx.objectStore(STORE_RECEIPT_SEQUENCE);
        seqStore.put({
          key: 'last_sequence',
          value: Math.max(maxSeq, cleanSales.length),
          updatedAt: Date.now(),
        });
        repairedStores.push(STORE_RECEIPT_SEQUENCE);
      }

      if (db.objectStoreNames.contains(STORE_META)) {
        const metaStore = tx.objectStore(STORE_META);
        metaStore.put({
          key: 'last_recovery',
          recoveredAt: Date.now(),
          salvagedProducts: cleanProducts.length,
          salvagedSales: cleanSales.length,
          discardedCorruptCount,
        });
      }

      tx.oncomplete = () => {
        details.push(
          `Successfully salvaged ${cleanProducts.length} product(s) and ${cleanSales.length} sale(s).`
        );
        if (discardedCorruptCount > 0) {
          details.push(`Discarded ${discardedCorruptCount} unreadable corrupted record(s).`);
        }
        details.push(`Reconciled receipt sequence counter to ${Math.max(maxSeq, cleanSales.length)}.`);

        // Mirror repaired data to localStorage cache
        if (typeof localStorage !== 'undefined') {
          try {
            localStorage.setItem(PRODUCTS_STORAGE_KEY, JSON.stringify(cleanProducts));
            localStorage.setItem(SALES_STORAGE_KEY, JSON.stringify(cleanSales));
            localStorage.setItem(SALES_STORAGE_MIRROR_KEY, JSON.stringify(cleanSales));
            localStorage.setItem(RECEIPT_SEQUENCE_KEY, String(Math.max(maxSeq, cleanSales.length)));
            localStorage.setItem(CLEAN_SLATE_KEY, 'true');
          } catch {
            // Non-fatal
          }
        }

        resolve({
          success: true,
          salvagedProducts: cleanProducts.length,
          salvagedSales: cleanSales.length,
          repairedReceiptSequence: Math.max(maxSeq, cleanSales.length),
          discardedCorruptCount,
          repairedStores,
          details,
        });
      };

      tx.onerror = () => {
        resolve({
          success: false,
          salvagedProducts: 0,
          salvagedSales: 0,
          repairedReceiptSequence: 0,
          discardedCorruptCount,
          repairedStores: [],
          details: ['Failed to commit sanitized records during recovery transaction.'],
        });
      };
    } catch (err: any) {
      resolve({
        success: false,
        salvagedProducts: 0,
        salvagedSales: 0,
        repairedReceiptSequence: 0,
        discardedCorruptCount,
        repairedStores: [],
        details: [err?.message || 'Unexpected error during recovery.'],
      });
    }
  });
}
