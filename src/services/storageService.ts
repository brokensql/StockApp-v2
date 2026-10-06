import { Product, SaleTransaction, UserProfile, SaleItem } from '../types';
import { validateCartStock } from '../utils/stockValidation';
import {
  PRODUCTS_STORAGE_KEY,
  SALES_STORAGE_KEY,
  SALES_STORAGE_MIRROR_KEY,
  PROFILE_STORAGE_KEY,
  PROFILE_BACKUP_KEY,
  OWNER_NAME_BACKUP_KEY,
  STORE_NAME_BACKUP_KEY,
  HAS_ENTERED_NAME_KEY,
  ONBOARDED_STORAGE_KEY,
  CLEAN_SLATE_KEY,
  RECEIPT_SEQUENCE_KEY,
} from '../utils/storageKeys';
import {
  openRepositoryDB,
  closeRepositoryDB,
  migrateFromLocalStorage,
  getAllProducts,
  getAllSales,
  saveAllProducts,
  saveAllSales,
  completeSaleTransactionInIDB,
  deleteSaleTransactionInIDB,
  clearSalesTransactionsInIDB,
  isIndexedDBAvailable,
  getProfileFromIDB,
  saveProfileToIDB,
  getReceiptSequenceFromIDB,
  saveReceiptSequenceToIDB,
  incrementReceiptSequenceInIDB,
  getImageMetadataFromIDB,
  saveImageMetadataToIDB,
  getAllImageMetadataFromIDB,
  deleteImageMetadataFromIDB,
  checkStorageHealth,
  recoverCorruptedDatabase,
  CompleteSaleOptions,
  SaleExecutionResult,
  DeleteSaleResult,
  StorageHealthReport,
  CorruptionRecoveryResult,
} from '../db/indexedDbRepository';

const DEFAULT_PROFILE: UserProfile = {
  ownerName: 'Store Owner',
  storeName: 'My Store',
  email: '',
  phone: '',
  address: '',
  businessType: 'Retail & Grocery',
  currency: 'PHP (₱)',
};

/**
 * Safely parses JSON from localStorage with corrupt-data protection.
 */
function safeParseStorage<T>(key: string): { data: T | null; isCorrupted: boolean } {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { data: null, isCorrupted: false };
    const parsed = JSON.parse(raw);
    return { data: parsed, isCorrupted: false };
  } catch (e) {
    console.error(`Corrupted storage detected for key "${key}":`, e);
    return { data: null, isCorrupted: true };
  }
}

/**
 * Ensures products have unique IDs and clean, non-duplicated SKUs.
 */
function deduplicateProducts(prods: Product[]): Product[] {
  const seenIds = new Set<string>();
  const seenSkus = new Set<string>();
  const deduplicated: Product[] = [];

  for (const p of prods) {
    if (!p || !p.id || seenIds.has(p.id)) continue;
    const cleanSku = p.sku ? p.sku.trim().toLowerCase() : '';

    if (cleanSku && seenSkus.has(cleanSku)) continue;

    seenIds.add(p.id);
    if (cleanSku) seenSkus.add(cleanSku);
    deduplicated.push(p);
  }

  return deduplicated;
}

/**
 * Loads products from offline storage.
 * 
 * CRITICAL RULE: Does NOT automatically wipe valid data merely because CLEAN_SLATE_KEY
 * or another marker key is missing! If products exist, they are preserved.
 */
export function loadProducts(): Product[] {
  try {
    const { data } = safeParseStorage<Product[]>(PRODUCTS_STORAGE_KEY);
    if (data && Array.isArray(data) && data.length > 0) {
      if (typeof localStorage !== 'undefined' && !localStorage.getItem(CLEAN_SLATE_KEY)) {
        localStorage.setItem(CLEAN_SLATE_KEY, 'true');
      }
      return deduplicateProducts(data);
    }

    const hasCleanSlate = localStorage.getItem(CLEAN_SLATE_KEY);
    if (!hasCleanSlate) {
      // New installation: mark clean slate without wiping existing keys
      localStorage.setItem(CLEAN_SLATE_KEY, 'true');
      return [];
    }

    if (data && Array.isArray(data)) {
      return deduplicateProducts(data);
    }
  } catch (e) {
    console.error('Failed to load products from localStorage', e);
  }
  return [];
}

/**
 * Safely persists products to storage, writing to IndexedDB and mirroring to localStorage.
 */
export function saveProducts(products: Product[]): boolean {
  try {
    const safeProducts = products.map(({ imageUrl, ...rest }) => rest);
    localStorage.setItem(PRODUCTS_STORAGE_KEY, JSON.stringify(safeProducts));
    if (isIndexedDBAvailable()) {
      saveAllProducts(products).catch((err) =>
        console.warn('Background IndexedDB products save error:', err)
      );
    }
    return true;
  } catch (e) {
    console.error('Failed to save products to localStorage:', e);
    if (isIndexedDBAvailable()) {
      saveAllProducts(products).catch((err) =>
        console.warn('Background IndexedDB products save error after localStorage fail:', err)
      );
      return true;
    }
    return false;
  }
}

/**
 * Loads sales from primary storage, falling back to backup mirror if corrupted.
 * 
 * CRITICAL RULE: Preserves existing sales even if CLEAN_SLATE_KEY is missing!
 */
export function loadSales(): SaleTransaction[] {
  try {
    const primary = safeParseStorage<SaleTransaction[]>(SALES_STORAGE_KEY);
    if (primary.data && Array.isArray(primary.data) && primary.data.length > 0) {
      return primary.data;
    }

    // Mirror fallback if primary key missing or corrupted
    const mirror = safeParseStorage<SaleTransaction[]>(SALES_STORAGE_MIRROR_KEY);
    if (mirror.data && Array.isArray(mirror.data) && mirror.data.length > 0) {
      console.warn('Recovered sales from backup mirror after storage issue.');
      return mirror.data;
    }

    const hasCleanSlate = localStorage.getItem(CLEAN_SLATE_KEY);
    if (!hasCleanSlate) {
      localStorage.setItem(CLEAN_SLATE_KEY, 'true');
      return [];
    }

    if (primary.data && Array.isArray(primary.data)) {
      return primary.data;
    }
    if (mirror.data && Array.isArray(mirror.data)) {
      return mirror.data;
    }
  } catch (e) {
    console.error('Failed to load sales from localStorage', e);
  }
  return [];
}

/**
 * Safely persists sales to both primary and mirror storage keys, and IndexedDB.
 */
export function saveSales(sales: SaleTransaction[]): boolean {
  try {
    const serialized = JSON.stringify(sales);
    localStorage.setItem(SALES_STORAGE_KEY, serialized);
    try {
      localStorage.setItem(SALES_STORAGE_MIRROR_KEY, serialized);
    } catch {
      // Mirror failure shouldn't abort if primary succeeded
    }
    if (isIndexedDBAvailable()) {
      saveAllSales(sales).catch((err) =>
        console.warn('Background IndexedDB sales save error:', err)
      );
    }
    return true;
  } catch (e) {
    console.error('Failed to save sales to localStorage:', e);
    if (isIndexedDBAvailable()) {
      saveAllSales(sales).catch((err) =>
        console.warn('Background IndexedDB sales save error after localStorage fail:', err)
      );
      return true;
    }
    return false;
  }
}

/**
 * Loads profile settings from storage with fallback recovery.
 */
export function loadProfile(): UserProfile {
  try {
    const saved =
      localStorage.getItem(PROFILE_STORAGE_KEY) ||
      localStorage.getItem(PROFILE_BACKUP_KEY);
    let profile = { ...DEFAULT_PROFILE };
    if (saved) {
      profile = { ...DEFAULT_PROFILE, ...JSON.parse(saved) };
      delete profile.avatarUrl;
    }

    const ownerBackup = localStorage.getItem(OWNER_NAME_BACKUP_KEY);
    if (ownerBackup && ownerBackup.trim()) {
      profile.ownerName = ownerBackup;
    }
    const storeBackup = localStorage.getItem(STORE_NAME_BACKUP_KEY);
    if (storeBackup && storeBackup.trim()) {
      profile.storeName = storeBackup;
    }
    return profile;
  } catch (e) {
    console.error('Failed to load profile from localStorage', e);
  }
  return DEFAULT_PROFILE;
}

/**
 * Persists profile settings to localStorage and IndexedDB.
 */
export function saveProfile(userProfile: UserProfile): boolean {
  try {
    const { avatarUrl, ...profileWithoutAvatar } = userProfile;
    const serialized = JSON.stringify(profileWithoutAvatar);
    localStorage.setItem(PROFILE_STORAGE_KEY, serialized);
    localStorage.setItem(PROFILE_BACKUP_KEY, serialized);

    if (userProfile.ownerName && userProfile.ownerName.trim() && userProfile.ownerName !== 'Store Owner') {
      localStorage.setItem(OWNER_NAME_BACKUP_KEY, userProfile.ownerName);
      localStorage.setItem(HAS_ENTERED_NAME_KEY, 'true');
      localStorage.setItem(ONBOARDED_STORAGE_KEY, 'true');
    }
    if (userProfile.storeName && userProfile.storeName.trim() && userProfile.storeName !== 'My Store') {
      localStorage.setItem(STORE_NAME_BACKUP_KEY, userProfile.storeName);
      localStorage.setItem(HAS_ENTERED_NAME_KEY, 'true');
      localStorage.setItem(ONBOARDED_STORAGE_KEY, 'true');
    }

    if (isIndexedDBAvailable()) {
      saveProfileToIDB(userProfile).catch((err) =>
        console.warn('Background IndexedDB profile save error:', err)
      );
    }
    return true;
  } catch (e) {
    console.error('Failed to save profile to localStorage:', e);
    if (isIndexedDBAvailable()) {
      saveProfileToIDB(userProfile).catch(() => {});
      return true;
    }
    return false;
  }
}

/**
 * Atomically completes a sale transaction:
 * 1. Validates cart items against current shelf stock.
 * 2. Uses durable IndexedDB read-write transaction (when available) ensuring
 *    inventory updates and sale ledger write both persist or neither persists.
 * 3. Keeps localStorage mirror synchronized for fast boot and backwards compatibility.
 */
export async function completeSaleTransaction(
  newTransaction: SaleTransaction,
  updatedProducts: Product[],
  currentSales: SaleTransaction[],
  currentProducts: Product[],
  options?: CompleteSaleOptions
): Promise<SaleExecutionResult> {
  // Step 1: Validate stock
  const validation = validateCartStock(newTransaction.items, currentProducts);
  if (!validation.isValid) {
    const names = validation.invalidItems.map((i) => `"${i.name}"`).join(', ');
    return {
      success: false,
      error: `Cannot complete sale: ${names} ${validation.invalidItems.length === 1 ? 'is' : 'are'} out of stock.`,
    };
  }

  // Step 2: Use IndexedDB atomic transaction if available
  if (isIndexedDBAvailable()) {
    const idbResult = await completeSaleTransactionInIDB(
      newTransaction,
      updatedProducts,
      currentProducts,
      options
    );

    if (!idbResult.success) {
      return idbResult;
    }

    // Mirror to localStorage on commit
    try {
      const safeProducts = updatedProducts.map(({ imageUrl, ...rest }) => rest);
      localStorage.setItem(PRODUCTS_STORAGE_KEY, JSON.stringify(safeProducts));
      const nextSales = [newTransaction, ...currentSales];
      localStorage.setItem(SALES_STORAGE_KEY, JSON.stringify(nextSales));
      localStorage.setItem(SALES_STORAGE_MIRROR_KEY, JSON.stringify(nextSales));

      const match = (newTransaction.transactionNumber || '').match(/^SA-(\d+)$/i);
      if (match) {
        localStorage.setItem(RECEIPT_SEQUENCE_KEY, match[1]);
      }
    } catch {
      // Non-fatal if localStorage quota exceeded, since IDB is our durable primary repository
    }

    return idbResult;
  }

  // Fallback for non-IndexedDB environments (SSR / test runner without IDB)
  const previousProductsRaw = localStorage.getItem(PRODUCTS_STORAGE_KEY);
  const previousSalesRaw = localStorage.getItem(SALES_STORAGE_KEY);
  const previousMirrorRaw = localStorage.getItem(SALES_STORAGE_MIRROR_KEY);

  const nextSales = [newTransaction, ...currentSales];

  const productsSaved = saveProducts(updatedProducts);
  if (!productsSaved) {
    if (previousProductsRaw !== null) localStorage.setItem(PRODUCTS_STORAGE_KEY, previousProductsRaw);
    return {
      success: false,
      error: 'Storage full: could not save updated inventory. Sale aborted.',
    };
  }

  const salesSaved = saveSales(nextSales);
  if (!salesSaved) {
    if (previousProductsRaw !== null) localStorage.setItem(PRODUCTS_STORAGE_KEY, previousProductsRaw);
    if (previousSalesRaw !== null) localStorage.setItem(SALES_STORAGE_KEY, previousSalesRaw);
    if (previousMirrorRaw !== null) localStorage.setItem(SALES_STORAGE_MIRROR_KEY, previousMirrorRaw);
    return {
      success: false,
      error: 'Storage full: could not record sale in history. Inventory unchanged.',
    };
  }

  return {
    success: true,
    transaction: newTransaction,
    updatedProducts,
  };
}

/**
 * Safely deletes a sale from history, optionally restoring the items to shelf stock.
 * Persists the resulting state atomically in IndexedDB with localStorage mirroring.
 */
export async function deleteSaleTransaction(
  transactionId: string,
  currentSales: SaleTransaction[],
  currentProducts: Product[],
  restoreStock = false
): Promise<DeleteSaleResult> {
  if (isIndexedDBAvailable()) {
    const idbResult = await deleteSaleTransactionInIDB(
      transactionId,
      currentSales,
      currentProducts,
      restoreStock
    );

    if (idbResult.success) {
      try {
        saveProducts(idbResult.updatedProducts);
        saveSales(idbResult.updatedSales);
      } catch {}
    }

    return idbResult;
  }

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

  const previousProductsRaw = localStorage.getItem(PRODUCTS_STORAGE_KEY);
  const previousSalesRaw = localStorage.getItem(SALES_STORAGE_KEY);
  const previousMirrorRaw = localStorage.getItem(SALES_STORAGE_MIRROR_KEY);

  const productsSaved = saveProducts(nextProducts);
  const salesSaved = saveSales(nextSales);

  if (!productsSaved || !salesSaved) {
    if (previousProductsRaw !== null) localStorage.setItem(PRODUCTS_STORAGE_KEY, previousProductsRaw);
    if (previousSalesRaw !== null) localStorage.setItem(SALES_STORAGE_KEY, previousSalesRaw);
    if (previousMirrorRaw !== null) localStorage.setItem(SALES_STORAGE_MIRROR_KEY, previousMirrorRaw);
    return {
      success: false,
      updatedSales: currentSales,
      updatedProducts: currentProducts,
      error: 'Storage error: failed to update records.',
    };
  }

  return {
    success: true,
    updatedSales: nextSales,
    updatedProducts: nextProducts,
    deletedSale: saleToDelete,
  };
}

/**
 * Safely deletes multiple sales from history and persists the updated ledger.
 */
export async function clearSalesTransactions(
  saleIdsToDelete: string[],
  currentSales: SaleTransaction[]
): Promise<{ success: boolean; updatedSales: SaleTransaction[]; error?: string }> {
  if (!saleIdsToDelete || saleIdsToDelete.length === 0) {
    return { success: true, updatedSales: currentSales };
  }

  if (isIndexedDBAvailable()) {
    const idbResult = await clearSalesTransactionsInIDB(
      saleIdsToDelete,
      currentSales
    );

    if (idbResult.success) {
      try {
        saveSales(idbResult.updatedSales);
      } catch {}
    }

    return idbResult;
  }

  const idSet = new Set(saleIdsToDelete);
  const nextSales = currentSales.filter((s) => !idSet.has(s.id));

  const previousSalesRaw = localStorage.getItem(SALES_STORAGE_KEY);
  const previousMirrorRaw = localStorage.getItem(SALES_STORAGE_MIRROR_KEY);
  const saved = saveSales(nextSales);

  if (!saved) {
    if (previousSalesRaw !== null) localStorage.setItem(SALES_STORAGE_KEY, previousSalesRaw);
    if (previousMirrorRaw !== null) localStorage.setItem(SALES_STORAGE_MIRROR_KEY, previousMirrorRaw);
    return {
      success: false,
      updatedSales: currentSales,
      error: 'Storage error: failed to update sales ledger.',
    };
  }

  return {
    success: true,
    updatedSales: nextSales,
  };
}

export {
  openRepositoryDB,
  closeRepositoryDB,
  migrateFromLocalStorage,
  getAllProducts,
  getAllSales,
  completeSaleTransactionInIDB,
  deleteSaleTransactionInIDB,
  clearSalesTransactionsInIDB,
  isIndexedDBAvailable,
  getProfileFromIDB,
  saveProfileToIDB,
  getReceiptSequenceFromIDB,
  saveReceiptSequenceToIDB,
  incrementReceiptSequenceInIDB,
  getImageMetadataFromIDB,
  saveImageMetadataToIDB,
  getAllImageMetadataFromIDB,
  deleteImageMetadataFromIDB,
  checkStorageHealth,
  recoverCorruptedDatabase,
};

export type {
  CompleteSaleOptions,
  SaleExecutionResult,
  DeleteSaleResult,
  StorageHealthReport,
  CorruptionRecoveryResult,
};
