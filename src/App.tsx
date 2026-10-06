/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { Toaster, toast } from 'sonner';
import { LottieSplashScreen } from './components/LottieSplashScreen';
import { OnboardingScreen } from './components/OnboardingScreen';
import { HomeScreen } from './components/HomeScreen';
import { StoreScreen } from './components/StoreScreen';
import { SalesScreen } from './components/SalesScreen';
import { StatisticsScreen } from './components/StatisticsScreen';
import { ProfileScreen } from './components/ProfileScreen';
import { ActiveSaleScreen } from './components/ActiveSaleScreen';
import { BottomNav } from './components/BottomNav';
import { OfflineIndicator } from './components/OfflineIndicator';
import { User, ArrowLeft, Plus } from 'lucide-react';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Capacitor } from '@capacitor/core';
import { NavTab, Product, SaleItem, SaleTransaction, UserProfile } from './types';
import { validateCartStock } from './utils/stockValidation';
import {
  loadProducts,
  saveProducts,
  loadSales,
  saveSales,
  loadProfile,
  saveProfile,
  completeSaleTransaction,
  deleteSaleTransaction,
  migrateFromLocalStorage,
  getAllProducts,
  getAllSales,
  getProfileFromIDB,
} from './services/storageService';
import {
  deleteProductImage,
  clearAllProductImages,
  pruneOrphanProductImages,
  getProfileImage,
  deleteProfileImage,
} from './utils/imageStorage';
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
} from './utils/storageKeys';

function getInitialOnboarded(): boolean {
  try {
    // 1. Direct explicit onboarded flag
    if (localStorage.getItem(ONBOARDED_STORAGE_KEY) === 'true') {
      return true;
    }

    // 2. Explicit entered name marker
    if (localStorage.getItem(HAS_ENTERED_NAME_KEY) === 'true') {
      localStorage.setItem(ONBOARDED_STORAGE_KEY, 'true');
      return true;
    }

    // 3. User already saved their custom name in standalone backup
    const savedName = localStorage.getItem(OWNER_NAME_BACKUP_KEY);
    if (savedName && savedName.trim() !== '' && savedName !== 'Store Owner') {
      localStorage.setItem(ONBOARDED_STORAGE_KEY, 'true');
      return true;
    }

    // 4. User profile already saved in localStorage with entered name or store
    const savedProfileStr =
      localStorage.getItem(PROFILE_STORAGE_KEY) ||
      localStorage.getItem(PROFILE_BACKUP_KEY);
    if (savedProfileStr) {
      const parsed = JSON.parse(savedProfileStr);
      if (
        (parsed.ownerName && parsed.ownerName.trim() !== '' && parsed.ownerName !== 'Store Owner') ||
        (parsed.storeName && parsed.storeName.trim() !== '' && parsed.storeName !== 'My Store')
      ) {
        localStorage.setItem(ONBOARDED_STORAGE_KEY, 'true');
        return true;
      }
    }

    // 5. Existing active store with saved products or sales
    const savedProductsStr = localStorage.getItem(PRODUCTS_STORAGE_KEY);
    if (savedProductsStr) {
      try {
        const prods = JSON.parse(savedProductsStr);
        if (Array.isArray(prods) && prods.length > 0) {
          localStorage.setItem(ONBOARDED_STORAGE_KEY, 'true');
          return true;
        }
      } catch {
        // Corrupted storage handled cleanly by safeParseStorage on boot
      }
    }

    const savedSalesStr = localStorage.getItem(SALES_STORAGE_KEY);
    if (savedSalesStr) {
      try {
        const salesList = JSON.parse(savedSalesStr);
        if (Array.isArray(salesList) && salesList.length > 0) {
          localStorage.setItem(ONBOARDED_STORAGE_KEY, 'true');
          return true;
        }
      } catch {
        // Corrupted storage handled cleanly by safeParseStorage on boot
      }
    }
  } catch (e) {
    console.error('Failed to load onboarded state from localStorage', e);
  }
  return false;
}

function getInitialProfile(): UserProfile {
  return loadProfile();
}

function getInitialProducts(): Product[] {
  return loadProducts();
}

function getInitialSales(): SaleTransaction[] {
  return loadSales();
}

export default function App() {
  const [showSplash, setShowSplash] = useState<boolean>(true);
  const [hasOnboarded, setHasOnboarded] = useState<boolean>(getInitialOnboarded);
  const [activeTab, setActiveTab] = useState<NavTab>('home');
  const [products, setProducts] = useState<Product[]>(getInitialProducts);
  const [sales, setSales] = useState<SaleTransaction[]>(getInitialSales);
  const [userProfile, setUserProfile] = useState<UserProfile>(getInitialProfile);
  const [homeClickTrigger, setHomeClickTrigger] = useState<number>(0);

  useEffect(() => {
    // Request persistent storage from browser engine to prevent storage eviction
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(() => {});
    }
    // Prune any orphan images in IDB that don't match any active products
    pruneOrphanProductImages(products.map((p) => p.id)).catch(() => {});

    // Migrate existing localStorage data once, safely and idempotently into IndexedDB
    migrateFromLocalStorage()
      .then(async ({ migrated, productCount, saleCount }) => {
        if (migrated) {
          console.info(`Migrated ${productCount} products and ${saleCount} sales to IndexedDB repository.`);
        }
        // Hydrate from IndexedDB repository if populated
        try {
          const [dbProducts, dbSales, dbProfile] = await Promise.all([
            getAllProducts(),
            getAllSales(),
            getProfileFromIDB(),
          ]);
          if (dbProducts && dbProducts.length > 0) {
            setProducts(dbProducts);
          }
          if (dbSales && dbSales.length > 0) {
            setSales(dbSales);
          }
          if (dbProfile && dbProfile.storeName) {
            setUserProfile((prev) => ({ ...prev, ...dbProfile }));
          }
        } catch (fetchErr) {
          console.warn('Failed to hydrate from IndexedDB:', fetchErr);
        }
      })
      .catch((err) => {
        console.warn('IndexedDB migration notice:', err);
      });

    // Load offline profile avatar stored on device/phone
    getProfileImage().then((avatar) => {
      if (avatar) {
        setUserProfile((prev) => (prev.avatarUrl === avatar ? prev : { ...prev, avatarUrl: avatar }));
      } else {
        setUserProfile((prev) => (prev.avatarUrl ? { ...prev, avatarUrl: undefined } : prev));
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    saveProfile(userProfile);
  }, [userProfile]);

  useEffect(() => {
    const saved = saveProducts(products);
    if (!saved) {
      toast.error(
        'Storage full — your last change was NOT saved. Clear some product images or export a backup now.',
        { duration: 8000 }
      );
    }
  }, [products]);

  useEffect(() => {
    const saved = saveSales(sales);
    if (!saved) {
      toast.error(
        'Storage full — your last change was NOT saved. Clear some product images or export a backup now.',
        { duration: 8000 }
      );
    }
  }, [sales]);

  useEffect(() => {
    const handleOffline = () => {
      toast.error('No internet');
    };

    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleFinishOnboarding = (data: { ownerName: string; storeName: string }) => {
    const updated: UserProfile = {
      ...userProfile,
      ownerName: data.ownerName || userProfile.ownerName || 'Store Owner',
      storeName: data.storeName || userProfile.storeName || 'My Store',
    };
    setUserProfile(updated);
    setHasOnboarded(true);
    try {
      localStorage.setItem(ONBOARDED_STORAGE_KEY, 'true');
      localStorage.setItem(HAS_ENTERED_NAME_KEY, 'true');
      localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(updated));
      localStorage.setItem(PROFILE_BACKUP_KEY, JSON.stringify(updated));
      if (updated.ownerName && updated.ownerName !== 'Store Owner') {
        localStorage.setItem(OWNER_NAME_BACKUP_KEY, updated.ownerName);
      }
      if (updated.storeName && updated.storeName !== 'My Store') {
        localStorage.setItem(STORE_NAME_BACKUP_KEY, updated.storeName);
      }
    } catch (e) {
      console.error('Failed to save onboarded state', e);
    }
    setActiveTab('home');
  };

  const handleSkipOnboarding = () => {
    setHasOnboarded(true);
    try {
      localStorage.setItem(ONBOARDED_STORAGE_KEY, 'true');
      localStorage.setItem(HAS_ENTERED_NAME_KEY, 'true');
    } catch (e) {
      console.error('Failed to save onboarded state', e);
    }
    setActiveTab('home');
  };

  const handleOpenStoreProfileSetup = () => {
    // Allows updating store identity via setup wizard without deleting data or resetting state
    setHasOnboarded(false);
  };

  const handleResetAllData = () => {
    clearAllProductImages().catch((err) =>
      console.error('Failed to clear product images from IDB on reset:', err)
    );
    deleteProfileImage().catch((err) =>
      console.error('Failed to clear profile image from IDB on reset:', err)
    );
    setProducts([]);
    setSales([]);
    const defaultProfile: UserProfile = {
      ownerName: '',
      storeName: '',
      email: '',
      phone: '',
      address: '',
      businessType: 'Retail & Grocery',
      currency: 'PHP (₱)',
    };
    setUserProfile(defaultProfile);
    setHasOnboarded(false);
    try {
      localStorage.removeItem(ONBOARDED_STORAGE_KEY);
      localStorage.removeItem(HAS_ENTERED_NAME_KEY);
      localStorage.removeItem(OWNER_NAME_BACKUP_KEY);
      localStorage.removeItem(STORE_NAME_BACKUP_KEY);
      localStorage.removeItem(SALES_PAGE_CLEARED_IDS_KEY);
      localStorage.setItem(PRODUCTS_STORAGE_KEY, JSON.stringify([]));
      localStorage.removeItem(SALES_STORAGE_KEY);
      localStorage.removeItem(SALES_STORAGE_MIRROR_KEY);
      localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(defaultProfile));
      localStorage.setItem(PROFILE_BACKUP_KEY, JSON.stringify(defaultProfile));
    } catch (e) {
      console.error('Failed to clear products and sales in localStorage', e);
    }
  };

  const [storeSubTab, setStoreSubTab] = useState<'inventory' | 'sales'>('inventory');
  const [isStartingSaleImmediately, setIsStartingSaleImmediately] = useState(false);
  const [isAddProductImmediately, setIsAddProductImmediately] = useState(false);
  const [newProductInitialSku, setNewProductInitialSku] = useState<string | null>(null);
  const [activeSaleSession, setActiveSaleSession] = useState<{
    isOpen: boolean;
    initialItems?: SaleItem[];
  }>({ isOpen: false });

  // Cooperative deferral: track active sale state and dispatch pos-sale-closed when sale finishes
  const prevSaleActiveRef = useRef<boolean>(false);
  useEffect(() => {
    (window as unknown as { __posSaleActive?: boolean }).__posSaleActive = activeSaleSession.isOpen;
    if (prevSaleActiveRef.current && !activeSaleSession.isOpen) {
      window.dispatchEvent(new CustomEvent('pos-sale-closed'));
    }
    prevSaleActiveRef.current = activeSaleSession.isOpen;
  }, [activeSaleSession.isOpen]);

  // Dynamically synchronize Capacitor Android / iOS Status Bar style with current screen
  useEffect(() => {
    try {
      const isCapacitorNative =
        Capacitor.isNativePlatform() ||
        (typeof (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
          .Capacitor?.isNativePlatform === 'function' &&
          (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
            .Capacitor!.isNativePlatform!());

      if (isCapacitorNative) {
        if (activeTab === 'home' && !activeSaleSession.isOpen) {
          // Home screen has rich green header: use dark style (crisp white text/icons)
          StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
          StatusBar.setBackgroundColor({ color: '#2F7D32' }).catch(() => {});
        } else {
          // Other screens have off-white #F7F9FB header: use light style (crisp dark text/icons)
          StatusBar.setStyle({ style: Style.Light }).catch(() => {});
          StatusBar.setBackgroundColor({ color: '#F7F9FB' }).catch(() => {});
        }
      }
    } catch {
      // Graceful fallback for non-native environments
    }
  }, [activeTab, activeSaleSession.isOpen]);

  const handleSelectTab = (tab: NavTab) => {
    if (tab === 'home') {
      setHomeClickTrigger((prev) => prev + 1);
      setActiveTab('home');
    } else if (tab === 'inventory') {
      setStoreSubTab('inventory');
      setActiveTab('store');
    } else if (tab === 'sales') {
      setStoreSubTab('sales');
      setActiveTab('sales');
    } else {
      setActiveTab(tab);
    }
    setIsStartingSaleImmediately(false);
    setIsAddProductImmediately(false);
  };

  const handleQuickNewSale = () => {
    setActiveSaleSession({
      isOpen: true,
      initialItems: [],
    });
  };

  const handleQuickAddProduct = () => {
    setIsAddProductImmediately(true);
    setIsStartingSaleImmediately(false);
    setStoreSubTab('inventory');
    setActiveTab('store');
  };

  const handleAddProduct = (newProduct: Product) => {
    const cleanSku = newProduct.sku?.trim().toLowerCase();
    const cleanName = newProduct.name.trim().toLowerCase();

    // Match ONLY on id or non-empty SKU for the merge/update path (F1)
    const existingIndex = products.findIndex((p) => {
      if (p.id === newProduct.id) return true;
      return Boolean(cleanSku && p.sku && p.sku.trim().toLowerCase() === cleanSku);
    });

    if (existingIndex >= 0) {
      setProducts((prev) => {
        const targetId = products[existingIndex].id;
        const idx = prev.findIndex((p) => p.id === targetId);
        if (idx < 0) return [newProduct, ...prev];
        const existing = prev[idx];
        const updatedList = [...prev];
        updatedList[idx] = {
          ...existing,
          ...newProduct,
          id: existing.id, // Preserve original id
        };
        return updatedList;
      });
      toast.success('Completed');
      return;
    }

    // Check if only the name matches an existing product
    const isNameOnlyCollision = products.some(
      (p) => Boolean(cleanName && p.name.trim().toLowerCase() === cleanName)
    );

    setProducts((prev) => [newProduct, ...prev]);

    if (isNameOnlyCollision) {
      toast.warning('A different product with this name already exists — added as a new item.');
    } else {
      toast.success('Completed');
    }
  };

  const handleUpdateProduct = (updatedProduct: Product) => {
    setProducts((prev) =>
      prev.map((p) => (p.id === updatedProduct.id ? updatedProduct : p))
    );
    toast.success('Updated');
  };

  const handleDeleteProduct = (productId: string) => {
    deleteProductImage(productId).catch((err) =>
      console.error('Failed to delete product image from IDB:', err)
    );
    setProducts((prev) => prev.filter((p) => p.id !== productId));
    toast.success('Deleted');
  };

  const handleCompleteSale = async (
    newTransaction: SaleTransaction,
    updatedProducts: Product[]
  ): Promise<boolean> => {
    // Atomically validate and persist inventory change and sale record in IndexedDB
    const result = await completeSaleTransaction(
      newTransaction,
      updatedProducts,
      sales,
      products
    );

    if (!result.success) {
      if (result.isQuotaError) {
        toast.error(
          'Storage Quota Exceeded! Neither inventory nor sale was saved. Please export a backup from Settings to protect your records.',
          { duration: 10000 }
        );
      } else {
        toast.error(result.error || 'Failed to complete sale.');
      }
      return false;
    }

    setSales((prev) => [newTransaction, ...prev]);
    setProducts(updatedProducts);
    toast.success('Sale completed');
    return true;
  };

  const handleDeleteSale = async (transactionId: string, restoreStock = false) => {
    const result = await deleteSaleTransaction(
      transactionId,
      sales,
      products,
      restoreStock
    );

    if (!result.success) {
      toast.error(result.error || 'Failed to delete sale.');
      return;
    }

    setSales(result.updatedSales);
    setProducts(result.updatedProducts);

    const txNum = result.deletedSale?.transactionNumber || 'Sale';
    toast.success(
      restoreStock
        ? `Sale ${txNum} deleted & stock restored`
        : `Sale ${txNum} deleted from history`
    );
  };

  const getHeaderTitle = (tab: NavTab): string => {
    switch (tab) {
      case 'home':
        return 'Home';
      case 'store':
      case 'inventory':
        return 'Inventory';
      case 'sales':
        return 'Sales';
      case 'statistics':
        return 'Stats';
      case 'profile':
        return 'Profile';
      default:
        return 'Inventory';
    }
  };

  return (
    <div id="app-root" className="w-full min-h-[100dvh] bg-[#F7F9FB] font-sans antialiased text-[#202522] flex flex-col items-center">
      <Toaster
        position="top-center"
        toastOptions={{
          unstyled: false,
          className: 'custom-navy-toast',
          style: {
            backgroundColor: '#0F172A',
            color: '#FFFFFF',
            border: '1px solid rgba(51, 65, 85, 0.4)',
            outline: 'none',
            boxShadow: '0 8px 24px -4px rgba(15, 23, 42, 0.45)',
            borderRadius: '14px',
            padding: '8px 15px',
            minHeight: 'unset',
            fontSize: '13.5px',
            width: 'fit-content',
            maxWidth: 'calc(100vw - 32px)',
            left: 0,
            right: 0,
            marginLeft: 'auto',
            marginRight: 'auto',
          },
        }}
      />
      <OfflineIndicator />
      {showSplash && (
        <LottieSplashScreen
          appName={userProfile.storeName || 'StockApp'}
          onFinish={() => setShowSplash(false)}
        />
      )}
      {!hasOnboarded ? (
        <OnboardingScreen
          currentProfile={userProfile}
          onFinish={handleFinishOnboarding}
          onSkip={handleSkipOnboarding}
          onCancel={() => setHasOnboarded(true)}
        />
      ) : activeSaleSession.isOpen ? (
        /* Dedicated 1 Whole Page Sale / Checkout Screen */
        <div className="w-full max-w-[430px] min-h-[100dvh] flex flex-col relative bg-[#F7F9FB]">
          <ActiveSaleScreen
            products={products}
            existingSales={sales}
            storeName={userProfile.storeName}
            onCompleteSale={handleCompleteSale}
            onCancelSale={() =>
              setActiveSaleSession({
                isOpen: false,
                initialItems: [],
              })
            }
            initialItems={activeSaleSession.initialItems}
          />
        </div>
      ) : (
        <div className="w-full max-w-[430px] min-h-[100dvh] flex flex-col relative bg-[#F7F9FB]">
          {/* Glassmorphic Page Header */}
          {activeTab !== 'home' && activeTab !== 'store' && activeTab !== 'inventory' && (
            <header
              id="page-header"
              className="sticky top-0 z-30 w-full bg-[#F7F9FB]/85 backdrop-blur-md select-none border-b border-transparent"
              style={{
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                paddingTop: 'var(--safe-area-top, env(safe-area-inset-top, 0px))',
              }}
            >
              {activeTab === 'sales' ? (
                <div className="h-16 sm:h-[68px] px-5 flex items-center gap-2 relative">
                  <button
                    type="button"
                    onClick={() => handleSelectTab('home')}
                    className="p-1 -ml-1 text-[#202522] hover:text-[#68716C] active:scale-95 transition-all cursor-pointer flex items-center justify-center rounded-full hover:bg-black/5"
                    aria-label="Back to home"
                  >
                    <ArrowLeft size={24} strokeWidth={2.2} />
                  </button>
                  <h1
                    id="page-header-title"
                    className="text-[26px] sm:text-[28px] font-bold text-[#202522] tracking-[-0.02em] text-left leading-tight"
                  >
                    Sales
                  </h1>
                </div>
              ) : (
                <div className="h-16 sm:h-[68px] px-5 flex items-center justify-start relative">
                  <h1
                    id="page-header-title"
                    className="text-[26px] sm:text-[28px] font-bold text-[#202522] tracking-[-0.02em] text-left"
                  >
                    {getHeaderTitle(activeTab)}
                  </h1>
                </div>
              )}
            </header>
          )}

          {/* Screen Content */}
          <main className="flex-1">
            {activeTab === 'home' && (
              <HomeScreen
                products={products}
                sales={sales}
                userProfile={userProfile}
                homeClickTrigger={homeClickTrigger}
                onNavigate={handleSelectTab}
                onAddProductClick={() => {
                  setStoreSubTab('inventory');
                  setIsAddProductImmediately(true);
                  setActiveTab('store');
                }}
                onNewSaleClick={() => {
                  setActiveSaleSession({
                    isOpen: true,
                    initialItems: [],
                    initialUnrecognizedBarcode: null,
                  });
                }}
              />
            )}

            {(activeTab === 'store' || activeTab === 'inventory') && (
              <StoreScreen
                products={products}
                sales={sales}
                onAddProduct={handleAddProduct}
                onUpdateProduct={handleUpdateProduct}
                onDeleteProduct={handleDeleteProduct}
                onCompleteSale={handleCompleteSale}
                initialSubTab={storeSubTab}
                initialAddModalOpen={isAddProductImmediately}
                initialSku={newProductInitialSku || undefined}
                isStartingSaleImmediately={isStartingSaleImmediately}
              />
            )}

            {activeTab === 'sales' && (
              <SalesScreen
                products={products}
                sales={sales}
                storeName={userProfile.storeName}
                onCompleteSale={handleCompleteSale}
                onDeleteSale={handleDeleteSale}
                onBack={() => setActiveTab('home')}
                onStartNewSale={handleQuickNewSale}
              />
            )}

            {activeTab === 'statistics' && (
              <StatisticsScreen
                products={products}
                sales={sales}
                onNavigateToStore={(subTab) => {
                  if (subTab) setStoreSubTab(subTab);
                  setActiveTab('store');
                }}
              />
            )}

            {activeTab === 'profile' && (
              <ProfileScreen
                profile={userProfile}
                onUpdateProfile={(updated) => {
                  if (!updated.avatarUrl) {
                    deleteProfileImage().catch(() => {});
                  }
                  setUserProfile(updated);
                }}
                onResetAllData={handleResetAllData}
              />
            )}
          </main>

          {/* Persistent Floating Bottom Navigation */}
          <BottomNav
            activeTab={activeTab}
            onSelectTab={handleSelectTab}
            products={products}
            sales={sales}
            onAddProduct={handleAddProduct}
            onCompleteSale={handleCompleteSale}
            onQuickNewSale={handleQuickNewSale}
            onQuickAddProduct={handleQuickAddProduct}
            onOpenActiveSale={({ items }) => {
              setActiveSaleSession({
                isOpen: true,
                initialItems: items || [],
              });
            }}
          />
        </div>
      )}
    </div>
  );
}


