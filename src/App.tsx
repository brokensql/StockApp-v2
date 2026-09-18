/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { Toaster, toast } from 'sonner';
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
import { INITIAL_PRODUCTS } from './data/initialProducts';
import { INITIAL_SALES } from './data/initialSales';
import { validateCartStock } from './utils/stockValidation';
import {
  deleteProductImage,
  clearAllProductImages,
  pruneOrphanProductImages,
} from './utils/imageStorage';

const PROFILE_STORAGE_KEY = 'store_user_profile';
const PROFILE_BACKUP_KEY = 'sage_user_profile_backup';
const OWNER_NAME_BACKUP_KEY = 'sage_owner_name_backup';
const STORE_NAME_BACKUP_KEY = 'sage_store_name_backup';
const HAS_ENTERED_NAME_KEY = 'sage_user_has_entered_name';
const PRODUCTS_STORAGE_KEY = 'store_products';
const SALES_STORAGE_KEY = 'store_sales';
const ONBOARDED_STORAGE_KEY = 'sage_onboarding_completed';
const CLEAN_SLATE_KEY = 'sage_clean_slate_initialized_v2';

const DEFAULT_PROFILE: UserProfile = {
  ownerName: 'Store Owner',
  storeName: 'My Store',
  email: '',
  phone: '',
  address: '',
  businessType: 'Retail & Grocery',
  currency: 'PHP (₱)',
};

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
      const prods = JSON.parse(savedProductsStr);
      if (Array.isArray(prods) && prods.length > 0) {
        localStorage.setItem(ONBOARDED_STORAGE_KEY, 'true');
        return true;
      }
    }

    const savedSalesStr = localStorage.getItem(SALES_STORAGE_KEY);
    if (savedSalesStr) {
      const salesList = JSON.parse(savedSalesStr);
      if (Array.isArray(salesList) && salesList.length > 0) {
        localStorage.setItem(ONBOARDED_STORAGE_KEY, 'true');
        return true;
      }
    }
  } catch (e) {
    console.error('Failed to load onboarded state from localStorage', e);
  }
  return false;
}

function getInitialProfile(): UserProfile {
  try {
    const saved =
      localStorage.getItem(PROFILE_STORAGE_KEY) ||
      localStorage.getItem(PROFILE_BACKUP_KEY);
    let profile = { ...DEFAULT_PROFILE };
    if (saved) {
      profile = { ...DEFAULT_PROFILE, ...JSON.parse(saved) };
    }

    // Redundant restoration from individual keys if available
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

function deduplicateProducts(prods: Product[]): Product[] {
  const seenIds = new Set<string>();
  const seenSkus = new Set<string>();
  const seenNames = new Set<string>();
  const deduplicated: Product[] = [];

  for (const p of prods) {
    if (seenIds.has(p.id)) continue;
    const cleanSku = p.sku ? p.sku.trim().toLowerCase() : '';
    const cleanName = p.name ? p.name.trim().toLowerCase() : '';

    if (cleanSku && seenSkus.has(cleanSku)) continue;
    if (cleanName && seenNames.has(cleanName)) continue;

    seenIds.add(p.id);
    if (cleanSku) seenSkus.add(cleanSku);
    if (cleanName) seenNames.add(cleanName);
    deduplicated.push(p);
  }

  return deduplicated;
}

function getInitialProducts(): Product[] {
  try {
    // Migration: ensure clean slate on first run or when reset
    const hasCleanSlate = localStorage.getItem(CLEAN_SLATE_KEY);
    if (!hasCleanSlate) {
      localStorage.setItem(CLEAN_SLATE_KEY, 'true');
      localStorage.setItem(PRODUCTS_STORAGE_KEY, JSON.stringify([]));
      localStorage.setItem(SALES_STORAGE_KEY, JSON.stringify([]));
      return [];
    }

    const saved = localStorage.getItem(PRODUCTS_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return deduplicateProducts(parsed);
      }
    }
  } catch (e) {
    console.error('Failed to load products from localStorage', e);
  }
  return [];
}

function getInitialSales(): SaleTransaction[] {
  try {
    const hasCleanSlate = localStorage.getItem(CLEAN_SLATE_KEY);
    if (!hasCleanSlate) {
      return [];
    }
    const saved = localStorage.getItem(SALES_STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error('Failed to load sales from localStorage', e);
  }
  return [];
}

export default function App() {
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
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(userProfile));
      localStorage.setItem(PROFILE_BACKUP_KEY, JSON.stringify(userProfile));
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
    } catch (e) {
      console.error('Failed to save profile to localStorage', e);
    }
  }, [userProfile]);

  useEffect(() => {
    try {
      // Store products in localStorage without raw image strings to guarantee localStorage never exceeds quota
      const safeProducts = products.map(({ imageUrl, ...rest }) => rest);
      localStorage.setItem(PRODUCTS_STORAGE_KEY, JSON.stringify(safeProducts));
    } catch (e) {
      console.error('Failed to save products to localStorage', e);
    }
  }, [products]);

  useEffect(() => {
    try {
      localStorage.setItem(SALES_STORAGE_KEY, JSON.stringify(sales));
    } catch (e) {
      console.error('Failed to save sales to localStorage', e);
    }
  }, [sales]);

  useEffect(() => {
    const handleOnline = () => {
      toast.success('Online');
    };
    const handleOffline = () => {
      toast.error('No internet');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
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
      localStorage.setItem(PRODUCTS_STORAGE_KEY, JSON.stringify([]));
      localStorage.setItem(SALES_STORAGE_KEY, JSON.stringify([]));
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
    initialUnrecognizedBarcode?: string | null;
  }>({ isOpen: false });

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
          // Other screens have off-white #F9FAF8 header: use light style (crisp dark text/icons)
          StatusBar.setStyle({ style: Style.Light }).catch(() => {});
          StatusBar.setBackgroundColor({ color: '#F9FAF8' }).catch(() => {});
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
      initialUnrecognizedBarcode: null,
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

    setProducts((prev) => {
      const existingIndex = prev.findIndex((p) => {
        if (p.id === newProduct.id) return true;
        const matchesSku = Boolean(cleanSku && p.sku && p.sku.trim().toLowerCase() === cleanSku);
        const matchesName = Boolean(cleanName && p.name.trim().toLowerCase() === cleanName);
        return matchesSku || matchesName;
      });

      if (existingIndex >= 0) {
        const existing = prev[existingIndex];
        const updatedList = [...prev];
        updatedList[existingIndex] = {
          ...existing,
          ...newProduct,
          id: existing.id, // Preserve original id
        };
        return updatedList;
      }

      return [newProduct, ...prev];
    });
    toast.success('Completed');
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

  const handleCompleteSale = (
    newTransaction: SaleTransaction,
    updatedProducts: Product[]
  ) => {
    // Robust centralized validation: verify that no item in transaction was out of stock or exceeds stock
    const validation = validateCartStock(newTransaction.items, products);
    if (!validation.isValid) {
      const names = validation.invalidItems.map((i) => `"${i.name}"`).join(', ');
      toast.error(`Cannot complete sale: ${names} ${validation.invalidItems.length === 1 ? 'is' : 'are'} out of stock.`);
      return;
    }

    setSales((prev) => [newTransaction, ...prev]);
    setProducts(updatedProducts);
    toast.success('Sale completed');
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
    <div id="app-root" className="w-full min-h-[100dvh] bg-[#F9FAF8] font-sans antialiased text-[#202522] flex flex-col items-center">
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
      {!hasOnboarded ? (
        <OnboardingScreen
          currentProfile={userProfile}
          onFinish={handleFinishOnboarding}
          onSkip={handleSkipOnboarding}
          onCancel={() => setHasOnboarded(true)}
        />
      ) : activeSaleSession.isOpen ? (
        /* Dedicated 1 Whole Page Sale / Checkout Screen */
        <div className="w-full max-w-[430px] min-h-[100dvh] flex flex-col relative bg-[#F9FAF8]">
          <ActiveSaleScreen
            products={products}
            existingSales={sales}
            storeName={userProfile.storeName}
            onCompleteSale={handleCompleteSale}
            onCancelSale={() =>
              setActiveSaleSession({
                isOpen: false,
                initialItems: [],
                initialUnrecognizedBarcode: null,
              })
            }
            initialItems={activeSaleSession.initialItems}
            initialUnrecognizedBarcode={activeSaleSession.initialUnrecognizedBarcode}
            onAddNewProductWithBarcode={(barcode) => {
              setActiveSaleSession({
                isOpen: false,
                initialItems: [],
                initialUnrecognizedBarcode: null,
              });
              setStoreSubTab('inventory');
              setNewProductInitialSku(barcode);
              setIsAddProductImmediately(true);
              setActiveTab('store');
            }}
          />
        </div>
      ) : (
        <div className="w-full max-w-[430px] min-h-[100dvh] flex flex-col relative bg-[#F9FAF8]">
          {/* Glassmorphic Page Header */}
          {activeTab !== 'home' && activeTab !== 'store' && activeTab !== 'inventory' && (
            <header
              id="page-header"
              className="sticky top-0 z-30 w-full bg-[#F9FAF8]/85 backdrop-blur-md select-none border-b border-transparent"
              style={{
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                paddingTop: 'var(--safe-area-top, env(safe-area-inset-top, 0px))',
              }}
            >
              {activeTab === 'sales' ? (
                <div className="px-5 pt-3 pb-1 flex flex-col items-start relative">
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
                    className="text-[26px] sm:text-[28px] font-bold text-[#202522] tracking-[-0.02em] text-left leading-tight mt-1"
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
                  setUserProfile(updated);
                  toast.success('Saved');
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
            onOpenActiveSale={({ items, unrecognizedBarcode }) => {
              setActiveSaleSession({
                isOpen: true,
                initialItems: items || [],
                initialUnrecognizedBarcode: unrecognizedBarcode || null,
              });
            }}
          />
        </div>
      )}
    </div>
  );
}


