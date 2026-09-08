import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Trash2, AlertCircle, Camera, Check, ChevronDown, ScanLine } from 'lucide-react';
import { Product } from '../types';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import { STANDARD_CATEGORIES } from '../data/categories';

interface ProductDetailModalProps {
  isOpen: boolean;
  product: Product | null; // null means adding a new product
  initialSku?: string;
  products?: Product[];
  onClose: () => void;
  onSave: (product: Product) => void;
  onDelete?: (productId: string) => void;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  isOpen,
  product,
  initialSku,
  products = [],
  onClose,
  onSave,
  onDelete,
}) => {
  const isEditing = Boolean(product);

  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');
  const [threshold, setThreshold] = useState('5');
  const [sku, setSku] = useState('');
  const [isBarcodeScannerOpen, setIsBarcodeScannerOpen] = useState(false);
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  const [error, setError] = useState('');

  // Standard category list, ensuring any existing product custom category is retained
  const categoryList = useMemo(() => {
    if (category && !STANDARD_CATEGORIES.includes(category as (typeof STANDARD_CATEGORIES)[number])) {
      return [...STANDARD_CATEGORIES, category];
    }
    return STANDARD_CATEGORIES;
  }, [category]);

  useEffect(() => {
    if (product) {
      setName(product.name);
      setCategory(product.category);
      setPrice(product.price.toString());
      setStock(product.stock.toString());
      setThreshold(product.lowStockThreshold.toString());
      setSku(product.sku || '');
      setError('');
      setIsCategoryOpen(false);
    } else {
      setName('');
      setCategory('General');
      setPrice('');
      setStock('');
      setThreshold('5');
      setSku(initialSku || '');
      setError('');
      setIsCategoryOpen(false);
    }
  }, [product, isOpen, initialSku]);

  const handleBarcodeScanned = (scannedCode: string) => {
    const clean = scannedCode.trim();
    setSku(clean);
    if (!product && products.length > 0) {
      const matched = products.find(
        (p) =>
          (p.sku && p.sku.trim().toLowerCase() === clean.toLowerCase()) ||
          p.id.toLowerCase() === clean.toLowerCase()
      );
      if (matched) {
        setName(matched.name);
        setCategory(matched.category);
        setPrice(matched.price.toString());
        setStock(matched.stock.toString());
        setThreshold(matched.lowStockThreshold.toString());
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Product name is required');
      return;
    }
    const numPrice = parseFloat(price);
    if (isNaN(numPrice) || numPrice < 0) {
      setError('Please enter a valid price');
      return;
    }
    const numStock = parseInt(stock, 10);
    if (isNaN(numStock) || numStock < 0) {
      setError('Please enter a valid stock quantity');
      return;
    }
    const numThreshold = parseInt(threshold, 10);

    const savedProduct: Product = {
      id: product ? product.id : `prod-${Date.now()}`,
      name: name.trim(),
      category: category.trim() || 'General',
      price: numPrice,
      stock: numStock,
      lowStockThreshold: isNaN(numThreshold) ? 5 : numThreshold,
      sku: sku.trim() || undefined,
    };

    onSave(savedProduct);
    onClose();
  };

  const handleDelete = () => {
    if (product && onDelete) {
      onDelete(product.id);
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          id="product-modal-backdrop"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#252825]/40 backdrop-blur-xs p-0 sm:p-4"
        >
          {/* Backdrop Click Dismiss */}
          <div
            className="absolute inset-0"
            onClick={onClose}
            aria-hidden="true"
          />

          <motion.div
            id="product-modal-sheet"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="relative z-10 w-full max-w-[430px] bg-white rounded-t-[32px] sm:rounded-[28px] border border-[#DEE3DE] shadow-[0_12px_40px_rgba(37,40,37,0.12)] max-h-[90dvh] flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="px-6 pt-5 pb-4 border-b border-[#DEE3DE] flex items-center justify-between">
              <div>
                <h2
                  id="product-modal-title"
                  className="text-[20px] font-bold text-[#252825]"
                >
                  {isEditing ? 'Edit product' : 'Add product'}
                </h2>
                <p className="text-[13px] text-[#6E746F] mt-0.5">
                  {isEditing ? 'Update stock levels or product details' : 'Enter product details to add to inventory'}
                </p>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="w-9 h-9 rounded-full bg-white border border-[#DEE3DE] flex items-center justify-center text-[#6E746F] hover:text-[#252825] transition-colors cursor-pointer"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="overflow-y-auto px-6 py-5 space-y-4">
              {error && (
                <div className="p-3 bg-[#9F3F46]/10 border border-[#9F3F46]/25 rounded-xl text-[13px] text-[#252825] flex items-center gap-2">
                  <AlertCircle size={16} className="text-[#9F3F46] flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Product Name */}
              <div>
                <label
                  htmlFor="input-product-name"
                  className="block text-[13px] font-medium text-[#252825] mb-1.5"
                >
                  Product name
                </label>
                <input
                  id="input-product-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Canned Sardines 155g"
                  className="w-full h-12 px-3.5 bg-white border border-[#DEE3DE] rounded-xl text-[15px] text-[#252825] placeholder:text-[#6E746F]/50 focus:outline-none focus:border-[#4F8065] focus:ring-1 focus:ring-[#4F8065]"
                  autoFocus
                />
              </div>

              {/* Category */}
              <div>
                <label
                  htmlFor="input-product-category"
                  className="block text-[13px] font-medium text-[#252825] mb-1.5"
                >
                  Category
                </label>
                <div id="product-category-container" className="relative">
                  <button
                    id="input-product-category"
                    type="button"
                    onClick={() => setIsCategoryOpen((v) => !v)}
                    aria-haspopup="listbox"
                    aria-expanded={isCategoryOpen}
                    className="w-full h-12 pl-3.5 pr-10 bg-white border border-[#DEE3DE] rounded-xl text-[15px] text-[#252825] text-left focus:outline-none focus:border-[#4F8065] focus:ring-1 focus:ring-[#4F8065] cursor-pointer transition-colors flex items-center"
                  >
                    <span className="truncate">{category || 'General'}</span>
                  </button>
                  <div
                    className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none w-6 h-6 flex items-center justify-center text-[#6E746F]"
                    aria-hidden="true"
                  >
                    <ChevronDown
                      size={17}
                      strokeWidth={2.2}
                      className={`transition-transform duration-200 ${isCategoryOpen ? 'rotate-180' : ''}`}
                    />
                  </div>
                  <AnimatePresence>
                    {isCategoryOpen && (
                      <motion.ul
                        role="listbox"
                        aria-label="Product category"
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.16, ease: 'easeOut' }}
                        className="absolute z-20 left-0 right-0 mt-2 bg-white border border-[#DEE3DE] rounded-xl shadow-[0_12px_32px_rgba(37,40,37,0.14)] py-1.5 max-h-56 overflow-y-auto"
                      >
                        {categoryList.map((cat) => {
                          const selected = cat === category;
                          return (
                            <li key={cat}>
                              <button
                                type="button"
                                role="option"
                                aria-selected={selected}
                                onClick={() => {
                                  setCategory(cat);
                                  setIsCategoryOpen(false);
                                }}
                                className={`w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-[15px] cursor-pointer transition-colors ${
                                  selected
                                    ? 'bg-[#EBF4EE] text-[#252825] font-semibold'
                                    : 'text-[#252825] hover:bg-[#F4F6F4]'
                                }`}
                              >
                                <span className="truncate">{cat}</span>
                                {selected && (
                                  <Check size={17} strokeWidth={2.5} className="text-[#4F8065] flex-shrink-0" />
                                )}
                              </button>
                            </li>
                          );
                        })}
                      </motion.ul>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Stock & Price */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="input-product-stock"
                    className="block text-[13px] font-medium text-[#252825] mb-1.5"
                  >
                    Stock (units)
                  </label>
                  <input
                    id="input-product-stock"
                    type="number"
                    min="0"
                    value={stock}
                    onChange={(e) => setStock(e.target.value)}
                    placeholder="0"
                    className="w-full h-12 px-3.5 bg-white border border-[#DEE3DE] rounded-xl text-[15px] text-[#252825] placeholder:text-[#6E746F]/50 focus:outline-none focus:border-[#4F8065] focus:ring-1 focus:ring-[#4F8065] tabular-nums"
                  />
                </div>

                <div>
                  <label
                    htmlFor="input-product-price"
                    className="block text-[13px] font-medium text-[#252825] mb-1.5"
                  >
                    Price (₱)
                  </label>
                  <input
                    id="input-product-price"
                    type="number"
                    step="0.25"
                    min="0"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="0.00"
                    className="w-full h-12 px-3.5 bg-white border border-[#DEE3DE] rounded-xl text-[15px] text-[#252825] placeholder:text-[#6E746F]/50 focus:outline-none focus:border-[#4F8065] focus:ring-1 focus:ring-[#4F8065] tabular-nums"
                  />
                </div>
              </div>

              {/* Low Stock Threshold & SKU */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="input-product-threshold"
                    className="block text-[13px] font-medium text-[#252825] mb-1.5"
                  >
                    Low stock alert at
                  </label>
                  <input
                    id="input-product-threshold"
                    type="number"
                    min="1"
                    value={threshold}
                    onChange={(e) => setThreshold(e.target.value)}
                    placeholder="5"
                    className="w-full h-12 px-3.5 bg-white border border-[#DEE3DE] rounded-xl text-[15px] text-[#252825] placeholder:text-[#6E746F]/50 focus:outline-none focus:border-[#4F8065] focus:ring-1 focus:ring-[#4F8065] tabular-nums"
                  />
                </div>

                <div>
                  <label
                    htmlFor="input-product-sku"
                    className="block text-[13px] font-medium text-[#252825] mb-1.5"
                  >
                    SKU / Barcode
                  </label>
                  <div className="relative flex items-center">
                    <input
                      id="input-product-sku"
                      type="text"
                      value={sku}
                      onChange={(e) => setSku(e.target.value)}
                      placeholder="e.g. 4800016644815 or scan"
                      className="w-full h-12 pl-3.5 pr-10 bg-white border border-[#DEE3DE] rounded-xl text-[15px] text-[#252825] placeholder:text-[#6E746F]/50 focus:outline-none focus:border-[#4F8065] focus:ring-1 focus:ring-[#4F8065]"
                    />
                    <button
                      type="button"
                      onClick={() => setIsBarcodeScannerOpen(true)}
                      className="absolute right-2 text-[#4F8065] hover:bg-[#4F8065]/10 p-1.5 rounded-lg transition-colors cursor-pointer"
                      title="Scan barcode with camera"
                    >
                      <ScanLine size={19} strokeWidth={2.3} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div
                className="pt-3 space-y-2.5"
                style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
              >
                <button
                  id="btn-save-product"
                  type="submit"
                  className="w-full h-13 bg-[#4F8065] active:bg-[#3D684F] text-white text-[15px] font-semibold rounded-xl flex items-center justify-center cursor-pointer transition-colors shadow-xs"
                >
                  {isEditing ? 'Save changes' : 'Add product'}
                </button>

                {isEditing && (
                  <button
                    id="btn-delete-product"
                    type="button"
                    onClick={handleDelete}
                    className="w-full h-11 bg-transparent text-[#9F3F46] text-[14px] font-medium rounded-xl flex items-center justify-center gap-1.5 cursor-pointer hover:bg-[#9F3F46]/10 active:bg-[#9F3F46]/20 transition-colors"
                  >
                    <Trash2 size={16} />
                    <span>Delete product</span>
                  </button>
                )}
              </div>
            </form>
          </motion.div>

          <BarcodeScannerModal
            isOpen={isBarcodeScannerOpen}
            onClose={() => setIsBarcodeScannerOpen(false)}
            onScanSuccess={handleBarcodeScanned}
            products={products}
            mode="inventory"
            title="Scan Product Barcode"
          />
        </div>
      )}
    </AnimatePresence>
  );
};
