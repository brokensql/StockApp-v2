import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Trash2, AlertCircle, Camera, Check, ChevronDown, ScanLine, Loader2, Upload } from 'lucide-react';
import { Product } from '../types';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import { STANDARD_CATEGORIES } from '../data/categories';
import {
  getProductImage,
  saveProductImage,
  deleteProductImage,
  compressImage,
} from '../utils/imageStorage';

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

  // Offline Image State
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [hasImageChanged, setHasImageChanged] = useState<boolean>(false);
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);
  const [isCompressingImage, setIsCompressingImage] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

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
      setHasImageChanged(false);

      if (product.imageUrl) {
        setImagePreview(product.imageUrl);
      } else {
        getProductImage(product.id).then((stored) => {
          setImagePreview(stored || null);
        });
      }
    } else {
      const cleanInitSku = initialSku ? initialSku.trim().toLowerCase() : '';
      const matched = cleanInitSku
        ? products.find(
            (p) =>
              (p.sku && p.sku.trim().toLowerCase() === cleanInitSku) ||
              p.id.toLowerCase() === cleanInitSku
          )
        : null;

      if (matched) {
        setName(matched.name);
        setCategory(matched.category);
        setPrice(matched.price.toString());
        setStock(matched.stock.toString());
        setThreshold(matched.lowStockThreshold.toString());
        setSku(matched.sku || initialSku || '');
        if (matched.imageUrl) {
          setImagePreview(matched.imageUrl);
        } else {
          getProductImage(matched.id).then((stored) => {
            setImagePreview(stored || null);
          });
        }
      } else {
        setName('');
        setCategory('General');
        setPrice('');
        setStock('');
        setThreshold('5');
        setSku(initialSku || '');
        setImagePreview(null);
      }
      setError('');
      setIsCategoryOpen(false);
      setHasImageChanged(false);
    }
  }, [product, isOpen, initialSku, products]);

  // Open native camera outside the app
  const triggerCamera = () => {
    if (cameraInputRef.current) {
      cameraInputRef.current.value = '';
      cameraInputRef.current.click();
    }
  };

  // Called when a photo is taken using the device camera outside the app
  const handleCameraCaptureChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      handleProcessFile(file);
    }
  };

  const handleProcessFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please upload a valid image file (PNG, JPG, WebP)');
      return;
    }

    try {
      setIsCompressingImage(true);
      setError('');
      const compressedDataUrl = await compressImage(file, 400, 0.82);
      setImagePreview(compressedDataUrl);
      setHasImageChanged(true);
    } catch {
      setError('Failed to process image. Please try another photo.');
    } finally {
      setIsCompressingImage(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleProcessFile(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
  };

  // Detect if an existing product matches the entered barcode or name when adding a new product
  const matchingExistingProduct = useMemo(() => {
    if (isEditing) return null;
    const cleanName = name.trim().toLowerCase();
    const cleanSku = sku.trim().toLowerCase();

    if (!cleanName && !cleanSku) return null;

    return (
      products.find((p) => {
        const matchesSku = Boolean(cleanSku && p.sku && p.sku.trim().toLowerCase() === cleanSku);
        const matchesName = Boolean(cleanName && p.name.trim().toLowerCase() === cleanName);
        return matchesSku || matchesName;
      }) || null
    );
  }, [products, isEditing, name, sku]);

  // Detect if user is editing a product and collides with another product's SKU or name
  const duplicateConflict = useMemo(() => {
    if (!isEditing || !product) return null;
    const cleanName = name.trim().toLowerCase();
    const cleanSku = sku.trim().toLowerCase();

    if (!cleanName && !cleanSku) return null;

    return (
      products.find((p) => {
        if (p.id === product.id) return false;
        const matchesSku = Boolean(cleanSku && p.sku && p.sku.trim().toLowerCase() === cleanSku);
        const matchesName = Boolean(cleanName && p.name.trim().toLowerCase() === cleanName);
        return matchesSku || matchesName;
      }) || null
    );
  }, [products, isEditing, product, name, sku]);

  const handleBarcodeScanned = (scannedCode: string) => {
    const clean = scannedCode.trim();
    setSku(clean);
    if (!product && products.length > 0) {
      const matched = products.find(
        (p) =>
          (p.sku && p.sku.trim().toLowerCase() === clean.toLowerCase()) ||
          p.id.toLowerCase() === clean.toLowerCase() ||
          p.name.trim().toLowerCase() === clean.toLowerCase()
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
    setError('');

    const trimmedName = name.trim();
    if (!trimmedName) {
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

    // If editing, prevent conflicting with another product's barcode or name
    if (isEditing && duplicateConflict) {
      const isSkuConflict = Boolean(
        duplicateConflict.sku &&
          duplicateConflict.sku.trim().toLowerCase() === sku.trim().toLowerCase()
      );
      setError(
        `Another product "${duplicateConflict.name}" already uses this ${
          isSkuConflict ? 'barcode' : 'name'
        }. Barcodes and product names must be unique.`
      );
      return;
    }

    // If adding a product that matches an existing product in inventory, update the old one's ID
    const targetId = product
      ? product.id
      : matchingExistingProduct
      ? matchingExistingProduct.id
      : `prod-${Date.now()}`;

    // Persist or delete image in offline IndexedDB
    if (!imagePreview) {
      deleteProductImage(targetId).catch((err) =>
        console.error('Failed to delete product image from IDB:', err)
      );
    } else if (hasImageChanged) {
      saveProductImage(targetId, imagePreview).catch((err) =>
        console.error('Failed to save product image:', err)
      );
    }

    const savedProduct: Product = {
      id: targetId,
      name: trimmedName,
      category: category.trim() || (matchingExistingProduct?.category || 'General'),
      price: numPrice,
      stock: numStock,
      lowStockThreshold: isNaN(numThreshold) ? 5 : numThreshold,
      sku: sku.trim() || undefined,
      imageUrl: imagePreview || undefined,
    };

    onSave(savedProduct);
    onClose();
  };

  const handleDelete = () => {
    if (product && onDelete) {
      deleteProductImage(product.id).catch((err) =>
        console.error('Failed to delete image on product delete:', err)
      );
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

              {/* Product Photo Upload / Drag & Drop with Instant Preview */}
              <div id="product-photo-upload-section">
                <label className="block text-[13px] font-medium text-[#252825] mb-1.5">
                  Product photo
                </label>

                {/* Direct native camera input (outside the app) */}
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleCameraCaptureChange}
                  className="hidden"
                  id="input-product-camera-capture"
                />

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleProcessFile(e.target.files[0]);
                    }
                  }}
                  className="hidden"
                  id="input-product-image"
                />

                {imagePreview ? (
                  <div className="relative w-48 h-48 aspect-square flex-shrink-0 mt-2">
                    <div className="w-full h-full rounded-2xl overflow-hidden border border-[#DEE3DE] bg-[#F2F4F2] shadow-2xs">
                      <img
                        src={imagePreview}
                        alt="Product preview"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const targetId = product?.id || matchingExistingProduct?.id;
                        if (targetId) {
                          deleteProductImage(targetId).catch((err) =>
                            console.error('Failed to delete image on recycle click:', err)
                          );
                        }
                        setImagePreview(null);
                        setHasImageChanged(true);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                        if (cameraInputRef.current) cameraInputRef.current.value = '';
                      }}
                      className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/2 w-8 h-8 rounded-full bg-white hover:bg-[#9F3F46] text-[#9F3F46] hover:text-white border border-[#DEE3DE] hover:border-[#9F3F46] flex items-center justify-center transition-all cursor-pointer shadow-md z-10 active:scale-95"
                      title="Delete photo"
                      aria-label="Delete photo"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ) : (
                  <div
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    className={`relative w-48 h-48 aspect-square border-2 border-dashed rounded-2xl p-3 flex flex-col items-center justify-center text-center transition-all ${
                      isDraggingOver
                        ? 'border-[#4F8065] bg-[#EAF2ED]'
                        : 'border-[#DEE3DE] bg-[#FAFBFB]'
                    }`}
                  >
                    {isCompressingImage ? (
                      <div className="flex flex-col items-center gap-2 py-3 text-[#4F8065]">
                        <Loader2 size={22} className="animate-spin" />
                        <span className="text-[12px] font-medium">Optimizing...</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center gap-2.5 w-full">
                        <button
                          type="button"
                          onClick={triggerCamera}
                          className="w-36 h-9.5 px-3 rounded-xl bg-[#4F8065] hover:bg-[#3D684F] active:bg-[#2A5C43] text-white text-[12.5px] font-medium flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-2xs whitespace-nowrap"
                        >
                          <Camera size={15} strokeWidth={2.2} />
                          <span>Take picture</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="w-36 h-9.5 px-3 rounded-xl bg-white hover:bg-[#F2F6F3] text-[#4F8065] border border-[#4F8065]/40 hover:border-[#4F8065] text-[12.5px] font-medium flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-2xs whitespace-nowrap"
                        >
                          <Upload size={15} strokeWidth={2.2} />
                          <span>Upload image</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

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

              {/* Existing product detection notice */}
              {matchingExistingProduct && !isEditing && (
                <div className="p-3.5 bg-[#EAF2ED] border border-[#B8D9C5] rounded-xl flex items-start gap-2.5 text-[13px] text-[#2D5A40]">
                  <AlertCircle size={18} className="shrink-0 mt-0.5 text-[#4F8065]" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-[#1F4530]">Existing product detected</p>
                      <button
                        type="button"
                        onClick={() => {
                          setName(matchingExistingProduct.name);
                          setCategory(matchingExistingProduct.category);
                          setPrice(matchingExistingProduct.price.toString());
                          setStock(matchingExistingProduct.stock.toString());
                          setThreshold(matchingExistingProduct.lowStockThreshold.toString());
                          if (matchingExistingProduct.sku) setSku(matchingExistingProduct.sku);
                        }}
                        className="text-[11px] font-semibold text-[#4F8065] hover:text-[#3D684F] underline cursor-pointer shrink-0"
                      >
                        Load current info
                      </button>
                    </div>
                    <p className="text-[12px] text-[#3D684F] mt-1 leading-relaxed">
                      "<span className="font-medium text-[#1F4530]">{matchingExistingProduct.name}</span>"
                      {matchingExistingProduct.sku ? ` (${matchingExistingProduct.sku})` : ''} is already in your inventory.
                      Saving will update this product instead of creating a duplicate.
                    </p>
                  </div>
                </div>
              )}

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
                  {isEditing
                    ? 'Save changes'
                    : matchingExistingProduct
                    ? 'Update existing product'
                    : 'Add product'}
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
