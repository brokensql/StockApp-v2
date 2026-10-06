import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

class MemoryStorage implements Storage {
  private store: Record<string, string> = {};
  get length() {
    return Object.keys(this.store).length;
  }
  clear() {
    this.store = {};
  }
  getItem(key: string) {
    return this.store[key] ?? null;
  }
  key(index: number) {
    return Object.keys(this.store)[index] ?? null;
  }
  removeItem(key: string) {
    delete this.store[key];
  }
  setItem(key: string, value: string) {
    this.store[key] = String(value);
  }
}

if (typeof globalThis.localStorage === 'undefined') {
  (globalThis as any).localStorage = new MemoryStorage();
}

import {
  openRepositoryDB,
  closeRepositoryDB,
  completeSaleTransactionInIDB,
  getAllProducts,
  getAllSales,
  saveAllProducts,
  saveAllSales,
  migrateFromLocalStorage,
  getProfileFromIDB,
  saveProfileToIDB,
  getReceiptSequenceFromIDB,
  saveReceiptSequenceToIDB,
  incrementReceiptSequenceInIDB,
  getImageMetadataFromIDB,
  saveImageMetadataToIDB,
  getAllImageMetadataFromIDB,
  checkStorageHealth,
  recoverCorruptedDatabase,
  LOCALSTORAGE_MIGRATED_FLAG,
  STORE_PRODUCTS,
  STORE_SALES,
  STORE_PROFILE,
  STORE_RECEIPT_SEQUENCE,
  STORE_IMAGE_METADATA,
  STORE_META,
} from './indexedDbRepository';
import { Product, SaleTransaction, UserProfile } from '../types';
import {
  PRODUCTS_STORAGE_KEY,
  SALES_STORAGE_KEY,
  SALES_STORAGE_MIRROR_KEY,
  PROFILE_STORAGE_KEY,
  CLEAN_SLATE_KEY,
  RECEIPT_SEQUENCE_KEY,
} from '../utils/storageKeys';

describe('Durable IndexedDB Repository - ACID Sales, Versioned Schema, Migration & Health', () => {
  let testDbName: string;
  let db: IDBDatabase;

  beforeEach(async () => {
    testDbName = `test_stockapp_db_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    db = await openRepositoryDB(testDbName);

    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
    closeRepositoryDB();
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  it('1. Success: Completes sale, updates inventory, and appends sale ledger in one transaction', async () => {
    const productA: Product = {
      id: 'prod_a',
      name: 'Organic Milk 1L',
      category: 'Dairy',
      stock: 15,
      price: 95,
      lowStockThreshold: 3,
      sku: 'MILK-001',
    };

    const productB: Product = {
      id: 'prod_b',
      name: 'Whole Wheat Bread',
      category: 'Bakery',
      stock: 20,
      price: 65,
      lowStockThreshold: 5,
      sku: 'BREAD-001',
    };

    await saveAllProducts([productA, productB], db);

    const updatedProducts: Product[] = [
      { ...productA, stock: 12 },
      { ...productB, stock: 18 },
    ];

    const saleTransaction: SaleTransaction = {
      id: 'tx_success_001',
      transactionNumber: 'REC-0001',
      timestamp: '2026-10-04 10:00:00',
      createdAt: Date.now(),
      items: [
        { productId: 'prod_a', name: 'Organic Milk 1L', quantity: 3, unitPrice: 95 },
        { productId: 'prod_b', name: 'Whole Wheat Bread', quantity: 2, unitPrice: 65 },
      ],
      subtotal: 415,
      total: 415,
      paymentMethod: 'cash',
      itemCount: 5,
      primaryItemName: 'Organic Milk 1L',
    };

    const result = await completeSaleTransactionInIDB(
      saleTransaction,
      updatedProducts,
      [productA, productB],
      { db }
    );

    expect(result.success).toBe(true);
    expect(result.transaction?.id).toBe('tx_success_001');

    const persistedProducts = await getAllProducts(db);
    expect(persistedProducts).toHaveLength(2);
    expect(persistedProducts.find((p) => p.id === 'prod_a')?.stock).toBe(12);
    expect(persistedProducts.find((p) => p.id === 'prod_b')?.stock).toBe(18);

    const persistedSales = await getAllSales(db);
    expect(persistedSales).toHaveLength(1);
    expect(persistedSales[0].id).toBe('tx_success_001');
    expect(persistedSales[0].total).toBe(415);
  });

  it('2. Quota/write failure: Rolls back transaction completely; neither inventory nor ledger changes persist', async () => {
    const initialProduct: Product = {
      id: 'prod_quota_test',
      name: 'Gourmet Coffee Beans',
      category: 'Beverages',
      stock: 10,
      price: 350,
      lowStockThreshold: 2,
    };

    await saveAllProducts([initialProduct], db);

    const updatedProduct = { ...initialProduct, stock: 7 };
    const saleTransaction: SaleTransaction = {
      id: 'tx_quota_fail',
      transactionNumber: 'REC-QUOTA',
      timestamp: '2026-10-04 10:15:00',
      items: [{ productId: 'prod_quota_test', name: 'Gourmet Coffee Beans', quantity: 3, unitPrice: 350 }],
      subtotal: 1050,
      total: 1050,
      paymentMethod: 'cash',
      itemCount: 3,
      primaryItemName: 'Gourmet Coffee Beans',
    };

    const result = await completeSaleTransactionInIDB(
      saleTransaction,
      [updatedProduct],
      [initialProduct],
      { db, simulateQuotaError: true }
    );

    expect(result.success).toBe(false);
    expect(result.isQuotaError).toBe(true);
    expect(result.error).toMatch(/quota exceeded/i);

    const persistedProducts = await getAllProducts(db);
    expect(persistedProducts.find((p) => p.id === 'prod_quota_test')?.stock).toBe(10);

    const persistedSales = await getAllSales(db);
    expect(persistedSales).toHaveLength(0);
  });

  it('3. Duplicate submission: Rejects duplicate sale ID and aborts transaction without modifying inventory', async () => {
    const product: Product = {
      id: 'prod_dup_test',
      name: 'Green Tea 100g',
      category: 'Beverages',
      stock: 10,
      price: 120,
      lowStockThreshold: 2,
    };
    await saveAllProducts([product], db);

    const saleTransaction: SaleTransaction = {
      id: 'tx_unique_123',
      transactionNumber: 'REC-DUP-01',
      timestamp: '2026-10-04 10:30:00',
      items: [{ productId: 'prod_dup_test', name: 'Green Tea 100g', quantity: 2, unitPrice: 120 }],
      subtotal: 240,
      total: 240,
      paymentMethod: 'cash',
      itemCount: 2,
      primaryItemName: 'Green Tea 100g',
    };

    const firstResult = await completeSaleTransactionInIDB(
      saleTransaction,
      [{ ...product, stock: 8 }],
      [product],
      { db }
    );
    expect(firstResult.success).toBe(true);

    const midProducts = await getAllProducts(db);
    expect(midProducts.find((p) => p.id === 'prod_dup_test')?.stock).toBe(8);

    const secondResult = await completeSaleTransactionInIDB(
      saleTransaction,
      [{ ...product, stock: 6 }],
      midProducts,
      { db }
    );

    expect(secondResult.success).toBe(false);
    expect(secondResult.error).toMatch(/duplicate sale submission/i);

    const finalProducts = await getAllProducts(db);
    expect(finalProducts.find((p) => p.id === 'prod_dup_test')?.stock).toBe(8);

    const finalSales = await getAllSales(db);
    expect(finalSales).toHaveLength(1);
  });

  it('4. Simulated failure between inventory and ledger writes: Verifies atomic rollback', async () => {
    const initialProduct: Product = {
      id: 'prod_crash_test',
      name: 'Fresh Mangoes 1kg',
      category: 'Fruits',
      stock: 50,
      price: 180,
      lowStockThreshold: 5,
    };
    await saveAllProducts([initialProduct], db);

    const updatedProduct = { ...initialProduct, stock: 45 };
    const saleTransaction: SaleTransaction = {
      id: 'tx_crash_sim',
      transactionNumber: 'REC-CRASH',
      timestamp: '2026-10-04 10:45:00',
      items: [{ productId: 'prod_crash_test', name: 'Fresh Mangoes 1kg', quantity: 5, unitPrice: 180 }],
      subtotal: 900,
      total: 900,
      paymentMethod: 'cash',
      itemCount: 5,
      primaryItemName: 'Fresh Mangoes 1kg',
    };

    const result = await completeSaleTransactionInIDB(
      saleTransaction,
      [updatedProduct],
      [initialProduct],
      { db, simulateFailureBetweenWrites: true }
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/simulated failure between inventory/i);

    const persistedProducts = await getAllProducts(db);
    expect(persistedProducts.find((p) => p.id === 'prod_crash_test')?.stock).toBe(50);

    const persistedSales = await getAllSales(db);
    expect(persistedSales).toHaveLength(0);
  });

  it('5. Stores business-critical profile, receipt sequence, and image metadata in IndexedDB', async () => {
    // 1. Verify object stores exist in database
    expect(db.objectStoreNames.contains(STORE_PRODUCTS)).toBe(true);
    expect(db.objectStoreNames.contains(STORE_SALES)).toBe(true);
    expect(db.objectStoreNames.contains(STORE_PROFILE)).toBe(true);
    expect(db.objectStoreNames.contains(STORE_RECEIPT_SEQUENCE)).toBe(true);
    expect(db.objectStoreNames.contains(STORE_IMAGE_METADATA)).toBe(true);

    // 2. Test Profile persistence in IDB
    const profile: UserProfile = {
      ownerName: 'Maria Santos',
      storeName: 'Sari-Sari Store Manila',
      email: 'maria@example.com',
      phone: '09171234567',
      address: 'Manila, Philippines',
      businessType: 'Retail & Grocery',
      currency: 'PHP (₱)',
    };
    const savedProf = await saveProfileToIDB(profile, db);
    expect(savedProf).toBe(true);

    const loadedProf = await getProfileFromIDB(db);
    expect(loadedProf?.ownerName).toBe('Maria Santos');
    expect(loadedProf?.storeName).toBe('Sari-Sari Store Manila');

    // 3. Test Monotonic Receipt Sequence in IDB
    await saveReceiptSequenceToIDB(42, db);
    const loadedSeq = await getReceiptSequenceFromIDB(db);
    expect(loadedSeq).toBe(42);

    const nextSeq = await incrementReceiptSequenceInIDB(db);
    expect(nextSeq).toBe(43);
    expect(await getReceiptSequenceFromIDB(db)).toBe(43);

    // 4. Test Image Metadata in IDB
    await saveImageMetadataToIDB(
      {
        id: 'prod_coffee_beans',
        sizeBytes: 25400,
        mimeType: 'image/webp',
        updatedAt: Date.now(),
      },
      db
    );

    const meta = await getImageMetadataFromIDB('prod_coffee_beans', db);
    expect(meta?.id).toBe('prod_coffee_beans');
    expect(meta?.sizeBytes).toBe(25400);

    const allMeta = await getAllImageMetadataFromIDB(db);
    expect(allMeta).toHaveLength(1);
  });

  it('6. Safe and idempotent multi-store migration from localStorage', async () => {
    const legacyProducts: Product[] = [
      { id: 'p1', name: 'Product 1', category: 'General', stock: 10, price: 50, lowStockThreshold: 2 },
      { id: 'p2', name: 'Product 2', category: 'General', stock: 20, price: 100, lowStockThreshold: 5 },
    ];
    const legacySales: SaleTransaction[] = [
      {
        id: 'tx_legacy',
        transactionNumber: 'SA-05',
        timestamp: '2026-10-01 10:00:00',
        items: [{ productId: 'p1', name: 'Product 1', quantity: 1, unitPrice: 50 }],
        subtotal: 50,
        total: 50,
        paymentMethod: 'cash',
        itemCount: 1,
        primaryItemName: 'Product 1',
      },
    ];
    const legacyProfile: UserProfile = {
      ownerName: 'Juan Dela Cruz',
      storeName: 'Juan Store',
      email: '',
      phone: '',
      address: '',
      businessType: 'Retail & Grocery',
      currency: 'PHP (₱)',
    };

    localStorage.setItem(PRODUCTS_STORAGE_KEY, JSON.stringify(legacyProducts));
    localStorage.setItem(SALES_STORAGE_KEY, JSON.stringify(legacySales));
    localStorage.setItem(SALES_STORAGE_MIRROR_KEY, JSON.stringify(legacySales));
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(legacyProfile));
    localStorage.setItem(RECEIPT_SEQUENCE_KEY, '5');

    const firstRun = await migrateFromLocalStorage(db);
    expect(firstRun.migrated).toBe(true);
    expect(firstRun.productCount).toBe(2);
    expect(firstRun.saleCount).toBe(1);
    expect(firstRun.profileMigrated).toBe(true);
    expect(firstRun.receiptSeqMigrated).toBe(true);

    // Verify all stores
    const productsInDb = await getAllProducts(db);
    expect(productsInDb).toHaveLength(2);

    const salesInDb = await getAllSales(db);
    expect(salesInDb).toHaveLength(1);

    const profileInDb = await getProfileFromIDB(db);
    expect(profileInDb?.ownerName).toBe('Juan Dela Cruz');

    const seqInDb = await getReceiptSequenceFromIDB(db);
    expect(seqInDb).toBe(5);

    // Second run: must be idempotent and not duplicate
    const secondRun = await migrateFromLocalStorage(db);
    expect(secondRun.migrated).toBe(false);
    expect(secondRun.productCount).toBe(2);
    expect(secondRun.saleCount).toBe(1);
  });

  it('7. Do not automatically wipe valid data merely because a marker key is missing', async () => {
    // Scenario: User cleared cookies or marker key is absent, but IndexedDB contains valid inventory
    const valuableProduct: Product = {
      id: 'valuable_item_99',
      name: 'Premium Silk Fabric',
      category: 'Textiles',
      stock: 500,
      price: 1200,
      lowStockThreshold: 10,
    };
    await saveAllProducts([valuableProduct], db);

    // Explicitly ensure migration and clean-slate flags are missing
    localStorage.removeItem(LOCALSTORAGE_MIGRATED_FLAG);
    localStorage.removeItem(CLEAN_SLATE_KEY);

    // Run migration/check
    const result = await migrateFromLocalStorage(db);

    // The repository MUST NOT wipe or drop existing products!
    const existingProducts = await getAllProducts(db);
    expect(existingProducts).toHaveLength(1);
    expect(existingProducts[0].id).toBe('valuable_item_99');
    expect(existingProducts[0].stock).toBe(500);
  });

  it('8. Storage health check provides accurate diagnostic status and store metrics', async () => {
    await saveAllProducts(
      [
        { id: 'p1', name: 'Item 1', category: 'General', stock: 10, price: 20, lowStockThreshold: 2 },
        { id: 'p2', name: 'Item 2', category: 'General', stock: 5, price: 40, lowStockThreshold: 1 },
      ],
      db
    );
    await saveReceiptSequenceToIDB(15, db);
    await saveProfileToIDB(
      {
        ownerName: 'Owner',
        storeName: 'Test Store',
        email: '',
        phone: '',
        address: '',
        businessType: 'Retail & Grocery',
        currency: 'PHP (₱)',
      },
      db
    );

    const report = await checkStorageHealth(db);

    expect(report.status).toBe('healthy');
    expect(report.database.isOpen).toBe(true);
    expect(report.stores.productsCount).toBe(2);
    expect(report.stores.profileConfigured).toBe(true);
    expect(report.stores.receiptSequence).toBe(15);
    expect(report.issues).toHaveLength(0);
  });

  it('9. Corruption recovery: Salvages valid products and sales from damaged records without destroying intact data', async () => {
    // Seed products store with 2 valid items and 1 corrupted/unreadable item (missing ID)
    const tx = db.transaction([STORE_PRODUCTS, STORE_SALES], 'readwrite');
    const prodStore = tx.objectStore(STORE_PRODUCTS);
    const salesStore = tx.objectStore(STORE_SALES);

    prodStore.put({ id: 'valid_p1', name: 'Valid Product 1', stock: 10, price: 100 });
    prodStore.put({ id: 'valid_p2', name: 'Valid Product 2', stock: 25, price: 50 });
    prodStore.put({ id: '', name: 'Damaged Product No ID', stock: 'corrupted' as any, price: NaN });

    salesStore.put({
      id: 'tx_valid_1',
      transactionNumber: 'SA-10',
      timestamp: '2026-10-04 12:00:00',
      items: [{ productId: 'valid_p1', name: 'Valid Product 1', quantity: 1, unitPrice: 100 }],
      total: 100,
    });
    salesStore.put({
      id: '', // Corrupted sale without ID
      transactionNumber: 'BROKEN',
      items: [],
      total: NaN,
    });

    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
    });

    // Run recovery
    const recoveryResult = await recoverCorruptedDatabase(db);

    expect(recoveryResult.success).toBe(true);
    expect(recoveryResult.salvagedProducts).toBe(2);
    expect(recoveryResult.salvagedSales).toBe(1);
    expect(recoveryResult.discardedCorruptCount).toBe(2);
    expect(recoveryResult.repairedReceiptSequence).toBe(10);

    // Verify sanitized store contents
    const cleanProducts = await getAllProducts(db);
    expect(cleanProducts).toHaveLength(2);
    expect(cleanProducts.map((p) => p.id)).toEqual(['valid_p1', 'valid_p2']);

    const cleanSales = await getAllSales(db);
    expect(cleanSales).toHaveLength(1);
    expect(cleanSales[0].id).toBe('tx_valid_1');
  });
});
