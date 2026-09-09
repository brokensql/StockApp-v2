import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { Search, Plus, X, Package } from 'lucide-react';
import { Product, InventoryFilter } from '../types';
import { ProductDetailModal } from './ProductDetailModal';
import { useProductImages } from '../hooks/useProductImages';

const InventoryCardImage: React.FC<{ src?: string | null; alt: string }> = ({ src, alt }) => {
  const [error, setError] = useState(false);

  if (!src || error) {
    return (
      <div className="absolute inset-0 w-full h-full bg-[#FAFBFB] flex items-center justify-center text-[#8E948F]">
        <Package size={26} strokeWidth={1.5} />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setError(true)}
      className="absolute inset-0 w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
    />
  );
};

interface InventoryScreenProps {
  products: Product[];
  onAddProduct: (product: Product) => void;
  onUpdateProduct: (product: Product) => void;
  onDeleteProduct: (productId: string) => void;
  initialAddModalOpen?: boolean;
  initialSku?: string;
}

export const InventoryScreen: React.FC<InventoryScreenProps> = ({
  products,
  onAddProduct,
  onUpdateProduct,
  onDeleteProduct,
  initialAddModalOpen = false,
  initialSku,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<InventoryFilter>('all');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(initialAddModalOpen);
  const [dynamicInitialSku, setDynamicInitialSku] = useState(initialSku || '');
  const { images } = useProductImages();

  useEffect(() => {
    if (initialAddModalOpen) {
      setSelectedProduct(null);
      setIsModalOpen(true);
    }
  }, [initialAddModalOpen]);

  useEffect(() => {
    if (initialSku) {
      setDynamicInitialSku(initialSku);
    }
  }, [initialSku]);

  // Compute counts for tabs
  const filterCounts = useMemo(() => {
    const total = products.length;
    const inStock = products.filter((p) => p.stock > p.lowStockThreshold).length;
    const lowStock = products.filter((p) => p.stock > 0 && p.stock <= p.lowStockThreshold).length;
    const outOfStock = products.filter((p) => p.stock === 0).length;
    return { all: total, in_stock: inStock, low_stock: lowStock, out_of_stock: outOfStock };
  }, [products]);

  // Filter and search logic
  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      // Search match
      const query = searchQuery.trim().toLowerCase();
      const matchesSearch =
        query === '' ||
        product.name.toLowerCase().includes(query) ||
        product.category.toLowerCase().includes(query) ||
        (product.sku && product.sku.toLowerCase().includes(query));

      if (!matchesSearch) return false;

      // Filter match
      if (activeFilter === 'in_stock') {
        return product.stock > product.lowStockThreshold;
      }
      if (activeFilter === 'low_stock') {
        return product.stock > 0 && product.stock <= product.lowStockThreshold;
      }
      if (activeFilter === 'out_of_stock') {
        return product.stock === 0;
      }
      return true;
    });
  }, [products, searchQuery, activeFilter]);

  const handleOpenAddModal = () => {
    setSelectedProduct(null);
    setDynamicInitialSku('');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (product: Product) => {
    setSelectedProduct(product);
    setDynamicInitialSku('');
    setIsModalOpen(true);
  };

  const handleSaveProduct = (product: Product) => {
    const cleanSku = product.sku?.trim().toLowerCase();
    const cleanName = product.name.trim().toLowerCase();

    // Check if updating currently selected product or if a matching product already exists
    const existing = products.find((p) => {
      if (selectedProduct && p.id === selectedProduct.id) return true;
      if (p.id === product.id) return true;
      const matchesSku = Boolean(cleanSku && p.sku && p.sku.trim().toLowerCase() === cleanSku);
      const matchesName = Boolean(cleanName && p.name.trim().toLowerCase() === cleanName);
      return matchesSku || matchesName;
    });

    if (existing) {
      onUpdateProduct({
        ...existing,
        ...product,
        id: existing.id,
      });
    } else {
      onAddProduct(product);
    }
  };

  const formatCurrency = (val: number) => {
    return `₱${val.toLocaleString('en-PH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const filters: { id: InventoryFilter; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: filterCounts.all },
    { id: 'in_stock', label: 'In stock', count: filterCounts.in_stock },
    { id: 'low_stock', label: 'Low stock', count: filterCounts.low_stock },
    { id: 'out_of_stock', label: 'Out of stock', count: filterCounts.out_of_stock },
  ];

  return (
    <motion.div
      id="inventory-screen-view"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="w-full max-w-[430px] mx-auto flex flex-col"
      style={{ paddingBottom: 'calc(8.5rem + env(safe-area-inset-bottom, 0px))' }}
    >
      {/* Sticky Header with Left-Aligned Title, Curvy Search Bar, and Filter Buttons */}
      <header
        id="page-header"
        className="sticky top-0 z-30 w-full bg-[#f7f9fb]/90 backdrop-blur-md border-b border-transparent select-none"
        style={{
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          paddingTop: 'env(safe-area-inset-top, 0px)',
        }}
      >
        <div className="px-5 pt-3 pb-2.5">
          {/* Header Title on Left */}
          <div className="h-10 sm:h-11 flex items-center justify-start mb-2">
            <h1
              id="page-header-title"
              className="text-[22px] sm:text-[24px] font-bold text-[#252825] tracking-[-0.015em] text-left"
            >
              Inventory
            </h1>
          </div>

          {/* Curvy Search Bar (rounded-full, scanner removed) */}
          <div className="relative mb-2.5">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-[#6E746F]">
              <Search size={18} strokeWidth={2} />
            </div>
            <input
              id="inventory-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search products..."
              className="w-full h-11 sm:h-12 pl-11 pr-10 bg-white border border-[#DEE3DE] rounded-full text-[14.5px] text-[#252825] placeholder:text-[#6E746F]/60 focus:outline-none focus:border-[#4F8065] focus:ring-1 focus:ring-[#4F8065] shadow-[0_2px_6px_rgba(37,40,37,0.02)] transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[#6E746F] hover:text-[#252825] cursor-pointer"
                aria-label="Clear search"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Filter Tabs / Buttons */}
          <nav
            aria-label="Stock status filters"
            className="grid grid-cols-[0.85fr_1.05fr_1.05fr_1.25fr] gap-1.5 sm:gap-2 w-full py-0.5 select-none"
          >
            {filters.map((filter) => {
              const isSelected = activeFilter === filter.id;
              return (
                <button
                  key={filter.id}
                  id={`filter-${filter.id}`}
                  type="button"
                  onClick={() => setActiveFilter(filter.id)}
                  className="relative h-9.5 sm:h-10 px-1 sm:px-2 rounded-full text-[12px] min-[390px]:text-[12.5px] sm:text-[13px] font-medium whitespace-nowrap cursor-pointer flex items-center justify-center border border-[#DEE3DE] bg-white focus:outline-none"
                >
                  {isSelected && (
                    <motion.div
                      layoutId="inventory-filter-active-pill"
                      className="absolute -inset-px bg-[#4F8065] rounded-full shadow-xs"
                      transition={{
                        type: 'tween',
                        ease: [0.25, 0.1, 0.25, 1],
                        duration: 0.2,
                      }}
                    />
                  )}
                  <span
                    className={`relative z-10 transition-colors duration-150 text-center ${
                      isSelected ? 'text-white' : 'text-[#6E746F] hover:text-[#252825]'
                    }`}
                  >
                    {filter.label}
                  </span>
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Products Content List */}
      <section aria-label="Product list" className="px-5 pt-3.5">
        {products.length === 0 ? (
          /* Global Empty State */
          <div
            id="empty-inventory-state"
            className="py-10 sm:py-12 text-center my-2"
          >
            <h2 className="text-[14px] font-semibold text-[#252825] mb-1.5">
              No products yet
            </h2>
            <p className="text-[14px] leading-relaxed text-[#6E746F] max-w-[260px] mx-auto">
              Add your first product to start managing your inventory.
            </p>
          </div>
        ) : filteredProducts.length === 0 ? (
          /* Search / Filter Empty State */
          <div
            id="empty-search-state"
            className="py-10 sm:py-12 text-center my-2"
          >
            <h2 className="text-[14px] font-semibold text-[#252825] mb-1.5">
              No products found
            </h2>
            <p className="text-[14px] text-[#6E746F] mb-5 max-w-[260px] mx-auto">
              {searchQuery
                ? `No products matching "${searchQuery}" in this filter.`
                : 'No products currently match this filter.'}
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setActiveFilter('all');
              }}
              className="h-10 px-4 bg-white border border-[#DEE3DE] text-[#252825] text-[14px] font-medium rounded-xl inline-flex items-center gap-1.5 cursor-pointer hover:bg-gray-50 transition-colors"
            >
              <span>Reset filters</span>
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            {/* Number Total Count Header on top of top product card */}
            <div
              id="inventory-total-count"
              className="flex items-center justify-between px-1 pt-0.5 pb-0.5"
            >
              <div className="flex items-center gap-2">
                <span className="text-[13.5px] font-bold text-[#252825]">
                  {filteredProducts.length} {filteredProducts.length === 1 ? 'product' : 'products'}
                </span>
                {searchQuery && (
                  <span className="text-[12px] text-[#8E948F]">
                    matching &ldquo;{searchQuery}&rdquo;
                  </span>
                )}
              </div>
            </div>

            {/* Individual Horizontal Product Cards (matching user reference) */}
            <div
              id="products-list-container"
              className="space-y-3"
            >
            {filteredProducts.map((product) => {
              const isLowStock = product.stock > 0 && product.stock <= product.lowStockThreshold;
              const isOutOfStock = product.stock === 0;

              return (
                <div
                  key={product.id}
                  id={`product-card-${product.id}`}
                  onClick={() => handleOpenEditModal(product)}
                  className="group bg-white rounded-2xl border border-[#DEE3DE] hover:border-[#4F8065]/50 shadow-2xs hover:shadow-xs transition-all cursor-pointer overflow-hidden flex items-stretch h-[104px] sm:h-[112px] active:scale-[0.995]"
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      handleOpenEditModal(product);
                    }
                  }}
                  aria-label={`View or edit ${product.name}`}
                >
                  {/* Left: Product Image Container (strictly fixed dimensions, matching reference) */}
                  <div className="w-24 sm:w-28 h-full min-w-[96px] sm:min-w-[112px] max-w-[96px] sm:max-w-[112px] bg-[#FAFBFB] relative overflow-hidden flex-shrink-0 flex items-center justify-center border-r border-[#F0F2F0]">
                    <InventoryCardImage
                      src={product.imageUrl || images[product.id]}
                      alt={product.name}
                    />
                  </div>

                  {/* Right: Content details (Product Name, Category, Price, Units with fixed layout) */}
                  <div className="p-3 sm:p-3.5 flex flex-col justify-between flex-1 min-w-0 h-full overflow-hidden">
                    {/* Top: Product Name & Category */}
                    <div className="min-w-0">
                      <h3
                        className="text-[14.5px] sm:text-[15.5px] font-semibold text-[#252825] leading-snug truncate"
                        title={product.name}
                      >
                        {product.name}
                      </h3>
                      {product.category ? (
                        <p className="text-[12px] text-[#6E746F] truncate mt-0.5">
                          {product.category}
                        </p>
                      ) : (
                        <p className="text-[12px] text-transparent select-none mt-0.5" aria-hidden="true">
                          &nbsp;
                        </p>
                      )}
                    </div>

                    {/* Bottom: Price & Units */}
                    <div className="flex items-baseline justify-between gap-x-2 pt-1 mt-auto">
                      <span className="text-[15.5px] sm:text-[17px] font-bold text-[#252825] tabular-nums shrink-0">
                        {formatCurrency(product.price)}
                      </span>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[11.5px] sm:text-[12px] text-[#6E746F] tabular-nums font-medium">
                          {product.stock} {product.stock === 1 ? 'unit' : 'units'}
                        </span>

                        {isOutOfStock ? (
                          <span className="text-[10.5px] font-semibold text-red-700 bg-red-50 border border-red-200/60 px-1.5 py-0.5 rounded-md">
                            Out
                          </span>
                        ) : isLowStock ? (
                          <span className="text-[10.5px] font-semibold text-amber-800 bg-amber-50 border border-amber-200/60 px-1.5 py-0.5 rounded-md">
                            Low
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            </div>
          </div>
        )}
      </section>

      {/* Floating Add Product Action Button (Green container with Plus icon above nav bar) */}
      {typeof document !== 'undefined' &&
        createPortal(
          <div
            id="inventory-fab-portal-container"
            className="fixed left-0 right-0 z-40 flex justify-center pointer-events-none"
            style={{ bottom: 'calc(6.75rem + env(safe-area-inset-bottom, 0px))' }}
          >
            <div className="w-full max-w-[430px] px-5 flex justify-end pointer-events-auto">
              <motion.button
                id="btn-add-product-fab"
                type="button"
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                whileTap={{ scale: 0.92 }}
                whileHover={{ scale: 1.05 }}
                onClick={handleOpenAddModal}
                className="w-13 h-13 sm:w-14 sm:h-14 rounded-full bg-[#4F8065] hover:bg-[#3D684F] active:bg-[#3D684F] text-white flex items-center justify-center shadow-[0_6px_22px_rgba(79,128,101,0.45)] transition-colors cursor-pointer border border-white/20 focus-visible:outline-none focus:ring-2 focus:ring-[#4F8065] focus:ring-offset-2"
                aria-label="Add product"
                title="Add product"
              >
                <Plus size={26} strokeWidth={2.4} />
              </motion.button>
            </div>
          </div>,
          document.body
        )}

      {/* Product Detail / Edit Modal */}
      <ProductDetailModal
        isOpen={isModalOpen}
        product={selectedProduct}
        initialSku={dynamicInitialSku || initialSku}
        products={products}
        onClose={() => {
          setIsModalOpen(false);
          setDynamicInitialSku('');
        }}
        onSave={handleSaveProduct}
        onDelete={onDeleteProduct}
      />
    </motion.div>
  );
};
