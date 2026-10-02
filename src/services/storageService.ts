/**
 * Storage Service & Repository Layer
 * Provides safe, transactional, offline-first persistence for products, sales, and profile.
 * Ensures sales completion and inventory adjustments are atomically validated and persisted.
 */

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
} from '../utils/storageKeys';

export const DEFAULT_PROFILE: UserProfile = {
  ownerName: 'Store Owner',
  storeName: 'My Store',
  email: '',
  phone: '',
  address: '',
  businessType: 'Retail & Grocery',
  currency: 'PHP (₱)',
};

/**
 * Safe JSON parser with auto-quarantine for corrupted records.
 * Preserves the corrupted string with a timestamped key instead of silently wiping it.
 */
export function safeParseStorage<T>(key: string): { data: T | null; corrupted: boolean } {
  try {
    const raw = localStorage.getItem(key);
    if (!raw || !raw.trim()) {
      return { data: null, corrupted: false };
    }
    try {
      const parsed = JSON.parse(raw);
      return { data: parsed, corrupted: false };
    } catch {
      const corruptKey = `${key}_corrupt_${Date.now()}`;
      try {
        localStorage.setItem(corruptKey, raw);
        localStorage.removeItem(key);
      } catch (storageErr) {
        console.error('Failed to preserve corrupt data', storageErr);
      }
      return { data: null, corrupted: true };
    }
  } catch {
    return { data: null, corrupted: false };
  }
}

/**
 * Deduplicates product records by unique ID and trimmed SKU.
 */
export function deduplicateProducts(prods: Product[]): Product[] {
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
 */
export function loadProducts(): Product[] {
  try {
    const hasCleanSlate = localStorage.getItem(CLEAN_SLATE_KEY);
    if (!hasCleanSlate) {
      localStorage.setItem(CLEAN_SLATE_KEY, 'true');
      localStorage.setItem(PRODUCTS_STORAGE_KEY, JSON.stringify([]));
      localStorage.setItem(SALES_STORAGE_KEY, JSON.stringify([]));
      localStorage.setItem(SALES_STORAGE_MIRROR_KEY, JSON.stringify([]));
      return [];
    }

    const { data } = safeParseStorage<Product[]>(PRODUCTS_STORAGE_KEY);
    if (data && Array.isArray(data)) {
      return deduplicateProducts(data);
    }
  } catch (e) {
    console.error('Failed to load products from localStorage', e);
  }
  return [];
}

/**
 * Safely persists products to localStorage, stripping large data URLs to protect storage quota.
 */
export function saveProducts(products: Product[]): boolean {
  try {
    const safeProducts = products.map(({ imageUrl, ...rest }) => rest);
    localStorage.setItem(PRODUCTS_STORAGE_KEY, JSON.stringify(safeProducts));
    return true;
  } catch (e) {
    console.error('Failed to save products to localStorage:', e);
    return false;
  }
}

/**
 * Loads sales from primary storage, falling back to backup mirror if corrupted.
 */
export function loadSales(): SaleTransaction[] {
  try {
    const hasCleanSlate = localStorage.getItem(CLEAN_SLATE_KEY);
    if (!hasCleanSlate) {
      return [];
    }

    const primary = safeParseStorage<SaleTransaction[]>(SALES_STORAGE_KEY);
    if (primary.data && Array.isArray(primary.data)) {
      return primary.data;
    }

    // Mirror fallback if primary key missing or corrupted
    const mirror = safeParseStorage<SaleTransaction[]>(SALES_STORAGE_MIRROR_KEY);
    if (mirror.data && Array.isArray(mirror.data)) {
      console.warn('Recovered sales from backup mirror after storage issue.');
      return mirror.data;
    }
  } catch (e) {
    console.error('Failed to load sales from localStorage', e);
  }
  return [];
}

/**
 * Safely persists sales to both primary and mirror storage keys.
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
    return true;
  } catch (e) {
    console.error('Failed to save sales to localStorage:', e);
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
 * Persists profile settings to localStorage.
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
    return true;
  } catch (e) {
    console.error('Failed to save profile to localStorage:', e);
    return false;
  }
}

export interface SaleExecutionResult {
  success: boolean;
  transaction?: SaleTransaction;
  updatedProducts?: Product[];
  error?: string;
}

/**
 * Atomically completes a sale transaction:
 * 1. Validates cart items against current shelf stock.
 * 2. Deducts sold quantities from inventory.
 * 3. Persists both updated products and the sales ledger.
 * 4. Only marks operation successful after storage write succeeds; rolls back on quota failure.
 */
export function completeSaleTransaction(
  newTransaction: SaleTransaction,
  updatedProducts: Product[],
  currentSales: SaleTransaction[],
  currentProducts: Product[]
): SaleExecutionResult {
  // Step 1: Validate stock
  const validation = validateCartStock(newTransaction.items, currentProducts);
  if (!validation.isValid) {
    const names = validation.invalidItems.map((i) => `"${i.name}"`).join(', ');
    return {
      success: false,
      error: `Cannot complete sale: ${names} ${validation.invalidItems.length === 1 ? 'is' : 'are'} out of stock.`,
    };
  }

  // Preserve previous state snapshot for rollback if persistence fails
  const previousProductsRaw = localStorage.getItem(PRODUCTS_STORAGE_KEY);
  const previousSalesRaw = localStorage.getItem(SALES_STORAGE_KEY);
  const previousMirrorRaw = localStorage.getItem(SALES_STORAGE_MIRROR_KEY);

  const nextSales = [newTransaction, ...currentSales];

  // Step 2 & 3: Attempt atomic persistence
  const productsSaved = saveProducts(updatedProducts);
  if (!productsSaved) {
    // Rollback
    if (previousProductsRaw !== null) localStorage.setItem(PRODUCTS_STORAGE_KEY, previousProductsRaw);
    return {
      success: false,
      error: 'Storage full: could not save updated inventory. Sale aborted.',
    };
  }

  const salesSaved = saveSales(nextSales);
  if (!salesSaved) {
    // Rollback both products and sales
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

export interface DeleteSaleResult {
  success: boolean;
  updatedSales: SaleTransaction[];
  updatedProducts: Product[];
  deletedSale?: SaleTransaction;
  error?: string;
}

/**
 * Safely deletes a sale from history, optionally restoring the items to shelf stock.
 * Persists the resulting state atomically.
 */
export function deleteSaleTransaction(
  transactionId: string,
  currentSales: SaleTransaction[],
  currentProducts: Product[],
  restoreStock = false
): DeleteSaleResult {
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

  // Snapshot for rollback
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
export function clearSalesTransactions(
  saleIdsToDelete: string[],
  currentSales: SaleTransaction[]
): { success: boolean; updatedSales: SaleTransaction[]; error?: string } {
  if (!saleIdsToDelete || saleIdsToDelete.length === 0) {
    return { success: true, updatedSales: currentSales };
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
