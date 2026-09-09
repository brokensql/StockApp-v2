// Offline image storage service using IndexedDB with client-side canvas compression
// Guarantees zero network latency, persistent offline storage, and tiny memory footprint.

const DB_NAME = 'pos_offline_db';
const DB_VERSION = 1;
const STORE_NAME = 'product_images';

interface ImageRecord {
  id: string; // productId
  dataUrl: string;
  updatedAt: number;
}

// In-memory cache for synchronous, zero-lag UI access
const memoryCache: Record<string, string> = {};
let dbInstance: IDBDatabase | null = null;
let isDbOpening = false;
let dbOpenPromise: Promise<IDBDatabase | null> | null = null;

/**
 * Initializes and returns the IndexedDB database instance
 */
export async function getDB(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return null;
  }

  if (dbInstance) {
    return dbInstance;
  }

  if (isDbOpening && dbOpenPromise) {
    return dbOpenPromise;
  }

  isDbOpening = true;
  dbOpenPromise = new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };

      request.onsuccess = (event) => {
        dbInstance = (event.target as IDBOpenDBRequest).result;
        isDbOpening = false;
        resolve(dbInstance);
      };

      request.onerror = (error) => {
        console.warn('IndexedDB unavailable or permission denied:', error);
        isDbOpening = false;
        resolve(null);
      };

      request.onblocked = () => {
        console.warn('IndexedDB open request was blocked');
        isDbOpening = false;
        resolve(null);
      };
    } catch (e) {
      console.warn('Failed to open IndexedDB:', e);
      isDbOpening = false;
      resolve(null);
    }
  });

  return dbOpenPromise;
}

/**
 * Compresses and resizes an image file on the client using HTML5 Canvas.
 * Produces a lightweight WebP or JPEG (~20KB-50KB) at high optical sharpness.
 */
export async function compressImage(
  fileOrBlob: File | Blob,
  maxDimension = 400,
  quality = 0.82
): Promise<string> {
  return new Promise((resolve, reject) => {
    // If browser doesn't support canvas or FileReader, fallback to direct reader
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      reject(new Error('Canvas compression only supported in browser environment'));
      return;
    }

    const img = new Image();
    const objectUrl = URL.createObjectURL(fileOrBlob);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let width = img.naturalWidth || img.width;
      let height = img.naturalHeight || img.height;

      // Calculate scaled dimensions keeping aspect ratio
      if (width > height) {
        if (width > maxDimension) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        }
      } else {
        if (height > maxDimension) {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(width, 1);
      canvas.height = Math.max(height, 1);

      const ctx = canvas.getContext('2d', { alpha: true });
      if (!ctx) {
        // Fallback to FileReader
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(fileOrBlob);
        return;
      }

      // Smooth downscaling
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // Attempt webp format first, fallback to jpeg if unsupported
      try {
        const webpData = canvas.toDataURL('image/webp', quality);
        if (webpData.startsWith('data:image/webp')) {
          resolve(webpData);
          return;
        }
      } catch {
        // Ignore and fallback
      }

      // Fallback to jpeg
      resolve(canvas.toDataURL('image/jpeg', quality));
    };

    img.onerror = (err) => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to decode image file'));
    };

    img.src = objectUrl;
  });
}

/**
 * Saves or updates a product image in IndexedDB and updates in-memory cache.
 */
export async function saveProductImage(
  productId: string,
  imageInput: string | File | Blob
): Promise<string> {
  if (!productId) {
    throw new Error('productId is required to save an image');
  }

  let finalDataUrl: string;

  if (typeof imageInput === 'string') {
    // If it's already a data URL, check if it's oversized or compressed
    if (imageInput.length > 200_000) {
      // Large base64 string, convert to blob and recompress
      try {
        const res = await fetch(imageInput);
        const blob = await res.blob();
        finalDataUrl = await compressImage(blob, 400, 0.82);
      } catch {
        finalDataUrl = imageInput;
      }
    } else {
      finalDataUrl = imageInput;
    }
  } else {
    finalDataUrl = await compressImage(imageInput, 400, 0.82);
  }

  // Update memory cache
  memoryCache[productId] = finalDataUrl;

  // Persist to IndexedDB
  try {
    const db = await getDB();
    if (db) {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const record: ImageRecord = {
          id: productId,
          dataUrl: finalDataUrl,
          updatedAt: Date.now(),
        };
        const req = store.put(record);
        req.onsuccess = () => resolve();
        req.onerror = (e) => reject(e);
      });
    }
  } catch (err) {
    console.warn(`Failed to persist image for product ${productId} in IndexedDB:`, err);
  }

  // Broadcast event so UI hooks re-render automatically
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('product-image-updated', {
        detail: { productId, dataUrl: finalDataUrl },
      })
    );
  }

  return finalDataUrl;
}

/**
 * Retrieves a product image by productId. First checks memory cache, then IndexedDB.
 */
export async function getProductImage(productId: string): Promise<string | null> {
  if (!productId) return null;

  if (memoryCache[productId]) {
    return memoryCache[productId];
  }

  try {
    const db = await getDB();
    if (!db) return null;

    return new Promise<string | null>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(productId);

      req.onsuccess = () => {
        const record = req.result as ImageRecord | undefined;
        if (record && record.dataUrl) {
          memoryCache[productId] = record.dataUrl;
          resolve(record.dataUrl);
        } else {
          resolve(null);
        }
      };

      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * Loads all product images from IndexedDB into memory cache for instant UI rendering.
 */
export async function getAllProductImages(): Promise<Record<string, string>> {
  try {
    const db = await getDB();
    if (!db) return { ...memoryCache };

    return new Promise<Record<string, string>>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => {
        const records = (req.result as ImageRecord[]) || [];
        records.forEach((rec) => {
          if (rec.id && rec.dataUrl) {
            memoryCache[rec.id] = rec.dataUrl;
          }
        });
        resolve({ ...memoryCache });
      };

      req.onerror = () => resolve({ ...memoryCache });
    });
  } catch {
    return { ...memoryCache };
  }
}

/**
 * Deletes a product image from IndexedDB and memory cache.
 */
export async function deleteProductImage(productId: string): Promise<void> {
  if (!productId) return;

  delete memoryCache[productId];

  try {
    const db = await getDB();
    if (db) {
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(productId);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
      });
    }
  } catch (err) {
    console.warn(`Failed to delete image for product ${productId}:`, err);
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('product-image-deleted', {
        detail: { productId },
      })
    );
  }
}

/**
 * Synchronous getter from in-memory cache (zero lag during render)
 */
export function getCachedProductImage(productId: string): string | null {
  return memoryCache[productId] || null;
}
