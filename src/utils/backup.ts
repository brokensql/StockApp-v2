import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Media } from '@capacitor-community/media';
import { Product, SaleTransaction, UserProfile, BackupSummary } from '../types';
import {
  getAllProductImages,
  saveProductImage,
  clearAllProductImages,
  getProfileImage,
  saveProfileImage,
  deleteProfileImage,
} from './imageStorage';
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
} from './storageKeys';

export interface BackupPayload {
  schemaVersion: 1;
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
 */
export async function buildBackupPayload(): Promise<string> {
  // Load products from localStorage
  let products: Product[] = [];
  try {
    const rawProds = localStorage.getItem(PRODUCTS_STORAGE_KEY);
    if (rawProds) {
      products = JSON.parse(rawProds);
    }
  } catch (e) {
    console.error('Failed to read products for backup:', e);
  }

  // Load sales from localStorage
  let sales: SaleTransaction[] = [];
  try {
    const rawSales = localStorage.getItem(SALES_STORAGE_KEY);
    if (rawSales) {
      sales = JSON.parse(rawSales);
    }
  } catch (e) {
    console.error('Failed to read sales for backup:', e);
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

  // Merge images into products array for portable completeness
  const productsWithImages: Product[] = products.map((prod) => ({
    ...prod,
    imageUrl: prod.imageUrl || images[prod.id] || undefined,
  }));

  // Derive last receipt sequence
  let maxSeq = 0;
  for (const s of sales) {
    const match = (s.transactionNumber || s.id || '').match(/SA-(\d+)/i);
    if (match) {
      const n = parseInt(match[1], 10);
      if (!isNaN(n) && n > maxSeq) maxSeq = n;
    }
  }

  const payload: BackupPayload = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    storeName: profile.storeName || 'My Store',
    products: productsWithImages,
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
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
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
 * Validates an uploaded backup file and returns a summary without applying destructive changes.
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

  if (data.schemaVersion !== 1) {
    throw new Error(
      `Unsupported backup schema version (${String(data.schemaVersion)}). Expected version 1.`
    );
  }

  if (!Array.isArray(data.products)) {
    throw new Error('Corrupted backup file: "products" must be a valid array.');
  }

  if (!Array.isArray(data.sales)) {
    throw new Error('Corrupted backup file: "sales" must be a valid array.');
  }

  const images = (data.images && typeof data.images === 'object') ? data.images : {};
  const imageCount = Object.keys(images).length;
  const storeName =
    typeof data.storeName === 'string' && data.storeName.trim()
      ? data.storeName
      : (data.profile as Record<string, unknown> | undefined)?.storeName
      ? String((data.profile as Record<string, unknown>).storeName)
      : 'My Store';

  return {
    schemaVersion: 1,
    exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : new Date().toISOString(),
    storeName,
    productCount: data.products.length,
    salesCount: data.sales.length,
    imageCount,
    backupData: data,
  };
}

/**
 * Restores all records wholesale from a validated backup payload and reloads the application.
 * Never merges — fully replaces existing on-device data.
 */
export async function applyRestorePayload(backupData: unknown): Promise<void> {
  if (!backupData || typeof backupData !== 'object') {
    throw new Error('Invalid backup data payload.');
  }

  const payload = backupData as BackupPayload;

  // 1. Clear existing IndexedDB image stores
  await clearAllProductImages().catch(() => {});
  await deleteProfileImage().catch(() => {});

  // 2. Restore images into IndexedDB
  if (payload.images && typeof payload.images === 'object') {
    for (const [productId, dataUrl] of Object.entries(payload.images)) {
      if (typeof dataUrl === 'string' && dataUrl.startsWith('data:')) {
        await saveProductImage(productId, dataUrl).catch(() => {});
      }
    }
  }

  // Also check if any product has an embedded dataUrl
  for (const p of payload.products) {
    if (p.imageUrl && p.imageUrl.startsWith('data:')) {
      await saveProductImage(p.id, p.imageUrl).catch(() => {});
    }
  }

  // Restore avatar if present
  if (payload.profileImage && typeof payload.profileImage === 'string' && payload.profileImage.startsWith('data:')) {
    await saveProfileImage(payload.profileImage).catch(() => {});
  } else if (payload.profile?.avatarUrl && payload.profile.avatarUrl.startsWith('data:')) {
    await saveProfileImage(payload.profile.avatarUrl).catch(() => {});
  }

  // 3. Clean products for localStorage to avoid quota overflow
  const safeProducts = payload.products.map(({ imageUrl, ...rest }) => rest);

  // 4. Clean profile without embedded avatar dataUrl
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

  // 5. Write to localStorage
  localStorage.setItem(CLEAN_SLATE_KEY, 'true');
  localStorage.setItem(ONBOARDED_STORAGE_KEY, 'true');
  localStorage.setItem(PRODUCTS_STORAGE_KEY, JSON.stringify(safeProducts));
  localStorage.setItem(SALES_STORAGE_KEY, JSON.stringify(payload.sales));
  localStorage.setItem(SALES_STORAGE_MIRROR_KEY, JSON.stringify(payload.sales));
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

  // 6. Reload application to cleanly mount all state from fresh restored data
  window.location.reload();
}
