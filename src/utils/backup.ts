import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Media } from '@capacitor-community/media';
import { Product, SaleTransaction, UserProfile, BackupSummary } from '../types';
import {
  getAllProducts,
  getAllSales,
  getProfileFromIDB,
  getReceiptSequenceFromIDB,
  saveAllProducts,
  saveAllSales,
  saveProfileToIDB,
  saveReceiptSequenceToIDB,
  isIndexedDBAvailable,
} from '../db/indexedDbRepository';
import {
  getAllProductImages,
  saveProductImage,
  clearAllProductImages,
  getProfileImage,
  saveProfileImage,
  deleteProfileImage,
  pruneOrphanProductImages,
} from './imageStorage';
import { getPHTParts } from './philippineDate';
import {
  PROFILE_STORAGE_KEY,
  PROFILE_BACKUP_KEY,
  OWNER_NAME_BACKUP_KEY,
  STORE_NAME_BACKUP_KEY,
  HAS_ENTERED_NAME_KEY,
  PRODUCTS_STORAGE_KEY,
  SALES_STORAGE_KEY,
  SALES_STORAGE_MIRROR_KEY,
  ONBOARDED_STORAGE_KEY,
  CLEAN_SLATE_KEY,
  SALES_PAGE_CLEARED_IDS_KEY,
} from './storageKeys';

export interface BackupPayload {
  schemaVersion: 1 | 2;
  exportedAt: string;
  storeName: string;
  products: Product[];
  sales: SaleTransaction[];
  profile: UserProfile;
  images: Record<string, string>;
  profileImage?: string | null;
  lastReceiptSeq?: number | string;
}

/**
 * Builds the comprehensive on-device backup JSON string containing all products,
 * sales ledger history, store identity, and compressed offline image assets.
 * Uses schemaVersion 2: normalized structure where product metadata and image assets
 * are cleanly separated to prevent multi-megabyte image duplication.
 */
export async function buildBackupPayload(): Promise<string> {
  // Load products from IndexedDB as primary, localStorage as fallback
  let products: Product[] = [];
  if (isIndexedDBAvailable()) {
    try {
      products = await getAllProducts();
    } catch (e) {
      console.warn('IDB products read fallback to localStorage:', e);
    }
  }
  if (products.length === 0) {
    try {
      const rawProds = localStorage.getItem(PRODUCTS_STORAGE_KEY);
      if (rawProds) {
        products = JSON.parse(rawProds);
      }
    } catch (e) {
      console.error('Failed to read products for backup:', e);
    }
  }

  // Load sales from IndexedDB as primary, localStorage as fallback
  let sales: SaleTransaction[] = [];
  if (isIndexedDBAvailable()) {
    try {
      sales = await getAllSales();
    } catch (e) {
      console.warn('IDB sales read fallback to localStorage:', e);
    }
  }
  if (sales.length === 0) {
    try {
      const rawSales = localStorage.getItem(SALES_STORAGE_KEY);
      if (rawSales) {
        sales = JSON.parse(rawSales);
      }
    } catch (e) {
      console.error('Failed to read sales for backup:', e);
    }
  }

  // Load profile
  let profile: UserProfile = {
    ownerName: 'Store Owner',
    storeName: 'My Store',
    email: '',
    phone: '',
    address: '',
    businessType: 'Retail & Grocery',
    currency: 'PHP (₱)',
  };
  if (isIndexedDBAvailable()) {
    try {
      const idbProf = await getProfileFromIDB();
      if (idbProf) {
        profile = { ...profile, ...idbProf };
      }
    } catch (e) {
      console.warn('IDB profile read fallback:', e);
    }
  }
  try {
    const rawProfile =
      localStorage.getItem(PROFILE_STORAGE_KEY) ||
      localStorage.getItem(PROFILE_BACKUP_KEY);
    if (rawProfile) {
      profile = { ...profile, ...JSON.parse(rawProfile) };
    }
    const ownerBackup = localStorage.getItem(OWNER_NAME_BACKUP_KEY);
    if (ownerBackup && ownerBackup.trim()) profile.ownerName = ownerBackup;
    const storeBackup = localStorage.getItem(STORE_NAME_BACKUP_KEY);
    if (storeBackup && storeBackup.trim()) profile.storeName = storeBackup;
  } catch (e) {
    console.error('Failed to read profile for backup:', e);
  }

  // Fetch images from IndexedDB
  const images = await getAllProductImages();
  const profileImage = await getProfileImage();

  // Normalized schemaVersion 2: store metadata only in products, images in separate map
  const cleanProducts: Product[] = products.map(({ imageUrl, ...rest }) => rest);

  // Derive last receipt sequence
  let maxSeq = 0;
  const storedSeq = localStorage.getItem('sage_last_receipt_seq');
  if (storedSeq) {
    const n = parseInt(storedSeq, 10);
    if (!isNaN(n)) maxSeq = n;
  }
  for (const s of sales) {
    const match = (s.transactionNumber || s.id || '').match(/SA-(\d+)/i);
    if (match) {
      const n = parseInt(match[1], 10);
      if (!isNaN(n) && n > maxSeq) maxSeq = n;
    }
  }

  const payload: BackupPayload = {
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    storeName: profile.storeName || 'My Store',
    products: cleanProducts,
    sales,
    profile,
    images,
    profileImage,
    lastReceiptSeq: maxSeq,
  };

  return JSON.stringify(payload, null, 2);
}

/**
 * Serializes and writes the backup file to on-device Documents (native) or downloads it (browser/PWA).
 * Returns the saved path or filename.
 */
export async function saveBackupFile(): Promise<string> {
  const payloadStr = await buildBackupPayload();
  const parts = getPHTParts(new Date());
  const yyyy = parts.year;
  const mm = String(parts.month).padStart(2, '0');
  const dd = String(parts.day).padStart(2, '0');
  const hh = String(parts.hour).padStart(2, '0');
  const min = String(parts.minute).padStart(2, '0');
  const filename = `stockapp-backup-${yyyy}${mm}${dd}-${hh}${min}.json`;

  const isNative =
    typeof window !== 'undefined' &&
    (Capacitor.isNativePlatform() ||
      (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.());

  if (isNative) {
    // UTF-8 safe base64 encoding
    const base64Data = btoa(unescape(encodeURIComponent(payloadStr)));
    await Filesystem.writeFile({
      path: filename,
      data: base64Data,
      directory: Directory.Documents,
      recursive: true,
    });

    try {
      if (typeof (Media as unknown as { scanFile?: (opts: { path: string }) => Promise<void> }).scanFile === 'function') {
        await (Media as unknown as { scanFile: (opts: { path: string }) => Promise<void> }).scanFile({
          path: filename,
        });
      }
    } catch {
      // Optional gallery/file scan hook
    }

    return `Documents/${filename}`;
  }

  // Web / PWA browser environment
  const blob = new Blob([payloadStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  return filename;
}

/**
 * Validates an individual product record from backup payload.
 */
function validateProductRecord(p: unknown, index: number): Product {
  if (!p || typeof p !== 'object') {
    throw new Error(`Corrupted product record at index ${index}: expected an object.`);
  }
  const obj = p as Record<string, unknown>;
  if (typeof obj.id !== 'string' || !obj.id.trim()) {
    throw new Error(`Corrupted product at index ${index}: missing or invalid product ID.`);
  }
  if (typeof obj.name !== 'string' || !obj.name.trim()) {
    throw new Error(`Corrupted product "${String(obj.id)}": missing or invalid product name.`);
  }
  const price = Number(obj.price);
  if (isNaN(price) || price < 0) {
    throw new Error(`Corrupted product "${String(obj.name)}": invalid price.`);
  }
  const stock = Number(obj.stock);
  if (isNaN(stock)) {
    throw new Error(`Corrupted product "${String(obj.name)}": invalid stock.`);
  }
  return {
    id: String(obj.id).trim(),
    name: String(obj.name).trim(),
    price,
    stock,
    category: typeof obj.category === 'string' ? obj.category : 'General',
    sku: typeof obj.sku === 'string' ? obj.sku : undefined,
    lowStockThreshold: typeof obj.lowStockThreshold === 'number' && !isNaN(obj.lowStockThreshold) ? obj.lowStockThreshold : 5,
    unit: typeof obj.unit === 'string' ? obj.unit : 'pcs',
  };
}

/**
 * Validates an individual sale transaction record from backup payload.
 */
function validateSaleRecord(s: unknown, index: number): SaleTransaction {
  if (!s || typeof s !== 'object') {
    throw new Error(`Corrupted sale record at index ${index}: expected an object.`);
  }
  const obj = s as Record<string, unknown>;
  if (typeof obj.id !== 'string' || !obj.id.trim()) {
    throw new Error(`Corrupted sale at index ${index}: missing or invalid transaction ID.`);
  }
  const total = Number(obj.total);
  if (isNaN(total) || total < 0) {
    throw new Error(`Corrupted sale at index ${index}: invalid total amount.`);
  }
  return obj as unknown as SaleTransaction;
}

/**
 * Validates an uploaded backup file and returns a summary without applying destructive changes.
 * Supports both schemaVersion 1 and schemaVersion 2.
 */
export async function restoreBackupFromFile(file: File): Promise<BackupSummary> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('The selected file is not a valid JSON document.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid backup file structure: Root must be an object.');
  }

  const data = parsed as Record<string, unknown>;

  const version = Number(data.schemaVersion);
  if (version !== 1 && version !== 2) {
    throw new Error(
      `Unsupported backup schema version (${String(data.schemaVersion)}). Expected version 1 or 2.`
    );
  }

  if (!Array.isArray(data.products)) {
    throw new Error('Corrupted backup file: "products" must be a valid array.');
  }

  if (!Array.isArray(data.sales)) {
    throw new Error('Corrupted backup file: "sales" must be a valid array.');
  }

  // Deep validation of products and sales
  for (let i = 0; i < data.products.length; i++) {
    validateProductRecord(data.products[i], i);
  }
  for (let i = 0; i < data.sales.length; i++) {
    validateSaleRecord(data.sales[i], i);
  }

  const images = (data.images && typeof data.images === 'object') ? (data.images as Record<string, string>) : {};
  let imageCount = Object.keys(images).length;

  // For schemaVersion 1, also count embedded product images
  if (version === 1 && imageCount === 0) {
    let embeddedCount = 0;
    for (const p of data.products as Product[]) {
      if (p && p.imageUrl && typeof p.imageUrl === 'string' && p.imageUrl.startsWith('data:')) {
        embeddedCount++;
      }
    }
    imageCount = embeddedCount;
  }

  const storeName =
    typeof data.storeName === 'string' && data.storeName.trim()
      ? data.storeName
      : (data.profile as Record<string, unknown> | undefined)?.storeName
      ? String((data.profile as Record<string, unknown>).storeName)
      : 'My Store';

  return {
    schemaVersion: version as 1 | 2,
    exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : new Date().toISOString(),
    storeName,
    productCount: data.products.length,
    salesCount: data.sales.length,
    imageCount,
    backupData: data,
  };
}

/**
 * Restores all records wholesale from a validated backup payload in a staged, transactional manner.
 * 1. Validates all records and image payloads.
 * 2. Takes complete snapshots of existing localStorage and IndexedDB states.
 * 3. Stages and writes images to IndexedDB. If write fails, rolls back IndexedDB to original snapshot.
 * 4. Commits verified state to localStorage. If commit fails, rolls back both localStorage and IndexedDB.
 * 5. Only after successful commit, prunes obsolete orphan images and reloads.
 */
export async function applyRestorePayload(backupData: unknown): Promise<void> {
  if (!backupData || typeof backupData !== 'object') {
    throw new Error('Invalid backup data payload.');
  }

  const payload = backupData as BackupPayload;
  if (!Array.isArray(payload.products) || !Array.isArray(payload.sales)) {
    throw new Error('Backup data contains invalid product or sales structures.');
  }

  // 1. Validate all product and sale entities before touching any storage
  const validatedProducts = payload.products.map((p, i) => validateProductRecord(p, i));
  const validatedSales = payload.sales.map((s, i) => validateSaleRecord(s, i));

  // 2. Snapshot current localStorage state for rollback
  const localStorageSnapshot: Record<string, string | null> = {
    [PRODUCTS_STORAGE_KEY]: localStorage.getItem(PRODUCTS_STORAGE_KEY),
    [SALES_STORAGE_KEY]: localStorage.getItem(SALES_STORAGE_KEY),
    [SALES_STORAGE_MIRROR_KEY]: localStorage.getItem(SALES_STORAGE_MIRROR_KEY),
    [PROFILE_STORAGE_KEY]: localStorage.getItem(PROFILE_STORAGE_KEY),
    [PROFILE_BACKUP_KEY]: localStorage.getItem(PROFILE_BACKUP_KEY),
    [OWNER_NAME_BACKUP_KEY]: localStorage.getItem(OWNER_NAME_BACKUP_KEY),
    [STORE_NAME_BACKUP_KEY]: localStorage.getItem(STORE_NAME_BACKUP_KEY),
    [ONBOARDED_STORAGE_KEY]: localStorage.getItem(ONBOARDED_STORAGE_KEY),
    [HAS_ENTERED_NAME_KEY]: localStorage.getItem(HAS_ENTERED_NAME_KEY),
    [CLEAN_SLATE_KEY]: localStorage.getItem(CLEAN_SLATE_KEY),
    sage_last_receipt_seq: localStorage.getItem('sage_last_receipt_seq'),
  };

  // 3. Snapshot current IndexedDB image state for rollback
  const originalImages = await getAllProductImages();
  const originalAvatar = await getProfileImage();

  // Rollback helper for IndexedDB
  const rollbackIndexedDB = async () => {
    try {
      await clearAllProductImages();
      for (const [id, dataUrl] of Object.entries(originalImages)) {
        await saveProductImage(id, dataUrl);
      }
      if (originalAvatar) {
        await saveProfileImage(originalAvatar);
      } else {
        await deleteProfileImage();
      }
    } catch (e) {
      console.error('Critical rollback failure in IndexedDB:', e);
    }
  };

  // Rollback helper for localStorage
  const rollbackLocalStorage = () => {
    for (const [key, val] of Object.entries(localStorageSnapshot)) {
      if (val !== null) {
        localStorage.setItem(key, val);
      } else {
        localStorage.removeItem(key);
      }
    }
  };

  // 4. Stage images from payload (supporting both v2 images map and legacy v1 embedded images)
  const stagedImages: Record<string, string> = {};
  if (payload.images && typeof payload.images === 'object') {
    for (const [productId, dataUrl] of Object.entries(payload.images)) {
      if (typeof dataUrl === 'string' && dataUrl.startsWith('data:')) {
        stagedImages[productId] = dataUrl;
      }
    }
  }

  // Legacy v1 embedded image fallback
  for (const p of payload.products) {
    if (p.id && p.imageUrl && typeof p.imageUrl === 'string' && p.imageUrl.startsWith('data:')) {
      if (!stagedImages[p.id]) {
        stagedImages[p.id] = p.imageUrl;
      }
    }
  }

  const avatarDataUrl =
    (typeof payload.profileImage === 'string' && payload.profileImage.startsWith('data:') && payload.profileImage) ||
    (typeof payload.profile?.avatarUrl === 'string' && payload.profile.avatarUrl.startsWith('data:') && payload.profile.avatarUrl) ||
    null;

  // 5. Transactional write to IndexedDB
  try {
    for (const [productId, dataUrl] of Object.entries(stagedImages)) {
      await saveProductImage(productId, dataUrl);
    }

    if (avatarDataUrl) {
      await saveProfileImage(avatarDataUrl);
    } else {
      await deleteProfileImage();
    }
  } catch (err) {
    console.error('Failed to write images during restore, rolling back IndexedDB:', err);
    await rollbackIndexedDB();
    throw new Error(
      `Image restoration failed (${err instanceof Error ? err.message : 'storage quota exceeded'}). Original state was preserved.`
    );
  }

  // 6. Clean products for localStorage
  const safeProducts = validatedProducts.map(({ imageUrl, ...rest }) => rest);

  // 7. Clean profile without embedded avatar dataUrl
  const userProfile = payload.profile || {
    ownerName: 'Store Owner',
    storeName: payload.storeName || 'My Store',
    email: '',
    phone: '',
    address: '',
    businessType: 'Retail & Grocery',
    currency: 'PHP (₱)',
  };
  const { avatarUrl, ...cleanProfile } = userProfile;

  // 8. Commit to localStorage with automatic rollback of both localStorage & IndexedDB on error
  try {
    localStorage.setItem(CLEAN_SLATE_KEY, 'true');
    localStorage.setItem(ONBOARDED_STORAGE_KEY, 'true');
    localStorage.setItem(PRODUCTS_STORAGE_KEY, JSON.stringify(safeProducts));
    localStorage.setItem(SALES_STORAGE_KEY, JSON.stringify(validatedSales));
    localStorage.setItem(SALES_STORAGE_MIRROR_KEY, JSON.stringify(validatedSales));
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(cleanProfile));
    localStorage.setItem(PROFILE_BACKUP_KEY, JSON.stringify(cleanProfile));

    if (cleanProfile.ownerName && cleanProfile.ownerName.trim()) {
      localStorage.setItem(OWNER_NAME_BACKUP_KEY, cleanProfile.ownerName);
      localStorage.setItem(HAS_ENTERED_NAME_KEY, 'true');
    }
    if (cleanProfile.storeName && cleanProfile.storeName.trim()) {
      localStorage.setItem(STORE_NAME_BACKUP_KEY, cleanProfile.storeName);
      localStorage.setItem(HAS_ENTERED_NAME_KEY, 'true');
    }

    localStorage.removeItem(SALES_PAGE_CLEARED_IDS_KEY);

    if (payload.lastReceiptSeq) {
      const seq = parseInt(String(payload.lastReceiptSeq), 10);
      if (!isNaN(seq) && seq > 0) {
        localStorage.setItem('sage_last_receipt_seq', String(seq));
      }
    }
  } catch (err) {
    console.error('Failed to commit localStorage during restore, rolling back all stores:', err);
    rollbackLocalStorage();
    await rollbackIndexedDB();
    throw new Error(
      `Restore failed during commit (${err instanceof Error ? err.message : 'storage quota exceeded'}). Original state was restored.`
    );
  }

  // 8b. Commit to IndexedDB stores for durable persistence
  if (isIndexedDBAvailable()) {
    try {
      await saveAllProducts(validatedProducts);
      await saveAllSales(validatedSales);
      await saveProfileToIDB(cleanProfile);
      if (payload.lastReceiptSeq) {
        const seq = parseInt(String(payload.lastReceiptSeq), 10);
        if (!isNaN(seq) && seq > 0) {
          await saveReceiptSequenceToIDB(seq);
        }
      }
    } catch (idbErr) {
      console.warn('Non-fatal: IDB restore sync error:', idbErr);
    }
  }

  // 9. Prune obsolete orphan images that are no longer part of restored product set
  try {
    const activeProductIds = validatedProducts.map((p) => p.id);
    await pruneOrphanProductImages(activeProductIds, Boolean(avatarDataUrl));
  } catch (pruneErr) {
    console.warn('Non-fatal: failed to prune orphan images after restore commit:', pruneErr);
  }

  // 10. Reload application to cleanly mount all state from verified restored data
  window.location.reload();
}
