import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Plus,
  Minus,
  ArrowLeft,
  Check,
  AlertCircle,
  Camera,
  ShoppingBag,
  Download,
  Loader2,
  Banknote,
  Smartphone,
  CreditCard,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { Product, SaleItem, SaleTransaction, PaymentMethod } from '../types';
import { formatPHTTimestamp } from '../utils/philippineDate';
import { getNextReceiptId } from '../utils/receiptNumber';
import {
  validateCartStock,
  sanitizeCartStock,
  getProductAvailableStock,
} from '../utils/stockValidation';
import { downloadReceiptTicket } from '../utils/downloadReceipt';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import { ReceiptTicketCard } from './ReceiptTicketCard';
import { ProductThumbnail } from './ProductThumbnail';
import { useProductImages } from '../hooks/useProductImages';

interface ActiveSaleScreenProps {
  products: Product[];
  onCompleteSale: (transaction: SaleTransaction, updatedProducts: Product[]) => void;
  onCancelSale: () => void;
  initialItems?: SaleItem[];
  existingSales?: SaleTransaction[];
  storeName?: string;
}

export const ActiveSaleScreen: React.FC<ActiveSaleScreenProps> = ({
  products,
  onCompleteSale,
  onCancelSale,
  initialItems = [],
  existingSales = [],
  storeName,
}) => {
  const [cart, setCart] = useState<SaleItem[]>(() =>
    sanitizeCartStock(initialItems || [], products)
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [cashTendered, setCashTendered] = useState<string>('');
  const [completedTx, setCompletedTx] = useState<SaleTransaction | null>(null);
  const [stockWarning, setStockWarning] = useState<string | null>(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ id: string; name: string } | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const receiptContainerRef = useRef<HTMLDivElement>(null);
  const { images } = useProductImages();

  const handleDownloadReceipt = async () => {
    if (!completedTx || isDownloading) return;
    setIsDownloading(true);
    try {
      const cardEl =
        (receiptContainerRef.current?.querySelector('#receipt-ticket-card') as HTMLElement) ||
        receiptContainerRef.current;
      const result = await downloadReceiptTicket(
        cardEl,
        completedTx,
        cashTendered,
        changeAmount,
        storeName || completedTx.storeName
      );
      if (result.success) {
        toast.success(result.message || 'Receipt saved to StockApp album in gallery!');
      } else {
        toast.error(result.error || 'Failed to download receipt');
      }
    } catch (err) {
      console.error('Download receipt error:', err);
      toast.error('Could not download receipt');
    } finally {
      setIsDownloading(false);
    }
  };

  // Sync initialItems when prop changes from parent (e.g. from fresh barcode scan)
  useEffect(() => {
    if (initialItems) {
      const sanitized = sanitizeCartStock(initialItems, products);
      setCart(sanitized);
      if (initialItems.length > 0 && sanitized.length < initialItems.length) {
        setStockWarning('Some items were excluded because they are out of stock.');
        setTimeout(() => setStockWarning(null), 3500);
      }
    }
  }, [initialItems, products]);

  // Quick lookup of available stock considering items currently in cart
  const getProductRemainingStock = (productId: string) => {
    const available = getProductAvailableStock(productId, products);
    if (available <= 0) return 0;
    const inCart = cart.find((item) => item.productId === productId)?.quantity || 0;
    return Math.max(0, available - inCart);
  };

  // Add product to cart
  const handleAddToCart = (product: Product) => {
    const prod = products.find((p) => p.id === product.id) || product;
    if (prod.stock <= 0) {
      setStockWarning(`"${prod.name}" is out of stock (0 available).`);
      setTimeout(() => setStockWarning(null), 3000);
      return;
    }

    const remainingStock = getProductRemainingStock(prod.id);
    if (remainingStock <= 0) {
      setStockWarning(`Only ${prod.stock} units available for "${prod.name}".`);
      setTimeout(() => setStockWarning(null), 3000);
      return;
    }

    setStockWarning(null);
    setCart((prev) => {
      const existing = prev.find((item) => item.productId === prod.id);
      if (existing) {
        if (existing.quantity >= prod.stock) {
          return prev;
        }
        return prev.map((item) =>
          item.productId === prod.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [
        ...prev,
        {
          productId: prod.id,
          name: prod.name,
          unitPrice: prod.price,
          quantity: 1,
          category: prod.category,
        },
      ];
    });
  };

  // Adjust quantity - if minus is clicked and drops to zero, show confirmation popup
  const handleUpdateQuantity = (productId: string, delta: number) => {
    const prod = products.find((p) => p.id === productId);
    const existing = cart.find((item) => item.productId === productId);
    if (!existing) return;

    if (delta > 0) {
      if (!prod || prod.stock <= 0) {
        setStockWarning(`"${existing.name}" is out of stock.`);
        setTimeout(() => setStockWarning(null), 3000);
        return;
      }
      if (existing.quantity >= prod.stock) {
        setStockWarning(`Only ${prod.stock} units available for ${prod.name}.`);
        setTimeout(() => setStockWarning(null), 3000);
        return;
      }
      setStockWarning(null);
      setCart((prev) =>
        prev.map((item) =>
          item.productId === productId
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      );
    } else {
      setStockWarning(null);
      if (existing.quantity <= 1) {
        // Show confirmation popup when drops to zero
        setItemToDelete({ id: productId, name: prod?.name || existing.name });
      } else {
        setCart((prev) =>
          prev.map((item) =>
            item.productId === productId
              ? { ...item, quantity: item.quantity - 1 }
              : item
          )
        );
      }
    }
  };

  const handleRemoveItem = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.productId !== productId));
  };

  // Check for any cart items that are invalid (out of stock or exceeding stock)
  const cartStockValidation = useMemo(() => {
    return validateCartStock(cart, products);
  }, [cart, products]);

  const invalidCartItems = cartStockValidation.invalidItems;
  const hasInvalidStock = !cartStockValidation.isValid;

  // Calculations
  const subtotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  }, [cart]);

  const total = subtotal;

  const totalItemsCount = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  }, [cart]);

  // Cash calculation
  const parsedTendered = parseFloat(cashTendered) || 0;
  const changeAmount = Math.max(0, parsedTendered - total);
  const isShortCash = paymentMethod === 'cash' && cashTendered !== '' && parsedTendered < total;

  // Format currency in Philippine Peso
  const formatCurrency = (val?: number | null) => {
    const num = typeof val === 'number' && !isNaN(val) ? val : 0;
    return `₱${num.toLocaleString('en-PH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  // Handle finalize sale
  const handleFinalizeSale = () => {
    if (cart.length === 0) return;

    const freshValidation = validateCartStock(cart, products);
    if (!freshValidation.isValid) {
      const names = freshValidation.invalidItems.map((i) => `"${i.name}"`).join(', ');
      setStockWarning(
        `Cannot complete sale: ${names} ${
          freshValidation.invalidItems.length === 1 ? 'is' : 'are'
        } out of stock or exceed inventory.`
      );
      setTimeout(() => setStockWarning(null), 4000);
      return;
    }

    if (paymentMethod === 'cash' && cashTendered !== '' && parsedTendered < total) {
      setStockWarning('Cash received is less than total amount due.');
      setTimeout(() => setStockWarning(null), 3000);
      return;
    }

    // Generate transaction in Philippine Time (Asia/Manila, UTC+8)
    const now = new Date();
    const nowEpoch = now.getTime();
    const timeStr = formatPHTTimestamp(now);

    const txNumber = getNextReceiptId(existingSales);

    const newTransaction: SaleTransaction = {
      id: `tx-${nowEpoch}`,
      transactionNumber: txNumber,
      timestamp: timeStr,
      createdAt: nowEpoch,
      items: cart,
      subtotal,
      total,
      paymentMethod,
      itemCount: totalItemsCount,
      primaryItemName: cart[0].name,
      storeName: storeName || 'My Store',
      cashTendered: paymentMethod === 'cash' && cashTendered !== '' ? cashTendered : undefined,
      changeAmount: paymentMethod === 'cash' && changeAmount > 0 ? changeAmount : undefined,
    };

    // Calculate updated products stock
    const updatedProducts = products.map((prod) => {
      const cartItem = cart.find((item) => item.productId === prod.id);
      if (cartItem) {
        return {
          ...prod,
          stock: Math.max(0, prod.stock - cartItem.quantity),
        };
      }
      return prod;
    });

    setCompletedTx(newTransaction);
    onCompleteSale(newTransaction, updatedProducts);
  };

  const handleScanSuccess = (barcode: string) => {
    setIsScannerOpen(false);
    const cleanCode = barcode.trim();
    const matched = products.find(
      (p) =>
        (p.sku && p.sku.trim().toLowerCase() === cleanCode.toLowerCase()) ||
        p.id.toLowerCase() === cleanCode.toLowerCase() ||
        p.name.trim().toLowerCase() === cleanCode.toLowerCase()
    );

    if (matched) {
      if (matched.stock <= 0) {
        setStockWarning(`"${matched.name}" is out of stock (0 available).`);
        setTimeout(() => setStockWarning(null), 3000);
        return;
      }
      handleAddToCart(matched);
    } else {
      setStockWarning(`No product found matching "${cleanCode}".`);
      setTimeout(() => setStockWarning(null), 3000);
    }
  };

  // Cash quick presets
  const cashPresets = useMemo(() => {
    const base = [50, 100, 200, 500, 1000];
    const roundedTotal = Math.ceil(total);
    const presets = base.filter((b) => b >= roundedTotal);
    return presets.length > 0 ? presets.slice(0, 4) : [roundedTotal];
  }, [total]);

  // FULL PAGE DIGITAL RECEIPT VIEW UPON COMPLETION
  if (completedTx) {
    return (
      <motion.div
        id="sale-success-full-page"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-[430px] mx-auto min-h-[100dvh] bg-[#F9FAF8] px-4 pt-4 pb-8 flex flex-col"
        style={{
          paddingTop: 'calc(1.25rem + var(--safe-area-top, env(safe-area-inset-top, 0px)))',
          paddingBottom: 'calc(2rem + env(safe-area-inset-bottom, 0px))',
        }}
      >
        {/* Top Header with Back Button */}
        <header className="mb-4 flex items-center justify-between">
          <button
            id="btn-receipt-back-to-home"
            type="button"
            onClick={onCancelSale}
            className="p-1 -ml-1 text-[#202522] hover:text-[#68716C] active:scale-95 transition-all cursor-pointer flex items-center gap-1.5"
            aria-label="Back"
          >
            <ArrowLeft size={22} strokeWidth={2.2} />
            <span className="text-[15px] font-semibold text-[#202522]">Back</span>
          </button>
        </header>

        <div ref={receiptContainerRef} className="w-full flex-1 flex flex-col justify-start">
          <ReceiptTicketCard
            transaction={completedTx}
            cashTendered={cashTendered}
            changeAmount={changeAmount}
            storeName={storeName || completedTx.storeName}
          />
        </div>

        {/* Bottom Download Receipt Action */}
        <div
          className="pt-5 w-full"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
        >
          <button
            id="btn-download-receipt"
            type="button"
            onClick={handleDownloadReceipt}
            disabled={isDownloading}
            className="w-full h-13 bg-[#2F7D32] hover:bg-[#256B29] active:bg-[#1E5A22] text-white text-[15.5px] font-semibold rounded-full flex items-center justify-center gap-2.5 cursor-pointer shadow-[0_4px_16px_rgba(47,125,50,0.28)] active:scale-[0.98] transition-all disabled:opacity-75 select-none"
            aria-label="Download receipt"
          >
            {isDownloading ? (
              <>
                <Loader2 size={19} className="animate-spin" />
                <span>Downloading receipt...</span>
              </>
            ) : (
              <>
                <Download size={19} strokeWidth={2.2} />
                <span>Download receipt</span>
              </>
            )}
          </button>
        </div>
      </motion.div>
    );
  }

  // 1 WHOLE PAGE SALE CHECKOUT SCREEN
  return (
    <motion.div
      id="active-sale-full-page"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="w-full max-w-[430px] mx-auto min-h-[100dvh] bg-[#F9FAF8] flex flex-col justify-between"
    >
      <div
        className="px-5 pt-6"
        style={{
          paddingTop: 'calc(1.25rem + var(--safe-area-top, env(safe-area-inset-top, 0px)))',
          paddingBottom: 'calc(7rem + env(safe-area-inset-bottom, 0px))',
        }}
      >
        {/* Top Header */}
        <header className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              id="btn-back-to-home"
              type="button"
              onClick={onCancelSale}
              className="p-1 -ml-1 text-[#202522] hover:text-[#68716C] flex items-center justify-center transition-colors cursor-pointer"
              aria-label="Back"
            >
              <ArrowLeft size={22} />
            </button>
            <div>
              <h1
                id="active-sale-page-title"
                className="text-[26px] sm:text-[28px] font-bold text-[#202522] tracking-tight leading-tight"
              >
                Sale Checkout
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Quick Scan More Barcode Shortcut */}
            <button
              id="btn-scan-more-header"
              type="button"
              onClick={() => setIsScannerOpen(true)}
              className="h-9 px-3 rounded-full bg-[#2F7D32] hover:bg-[#256B29] active:bg-[#1E5A22] text-white text-[12.5px] font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
              title="Scan barcode with camera"
            >
              <Camera size={15} />
              <span>Scan</span>
            </button>
          </div>
        </header>

        {/* Stock Warning Banner */}
        {stockWarning && (
          <div
            id="stock-warning-banner"
            className="mb-3.5 p-3 bg-[#D94841]/10 border border-[#D94841]/25 rounded-2xl text-[13px] text-[#202522] flex items-center gap-2.5"
          >
            <AlertCircle size={16} className="text-[#D94841] flex-shrink-0" />
            <span className="flex-1">{stockWarning}</span>
          </div>
        )}

        {/* Scanned Items in Current Sale - Clean, unboxed design */}
        <section aria-label="Current sale items" className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-[16px] font-bold text-[#202522]">
              Scanned products
            </h2>
          </div>

          {cart.length === 0 ? (
            <div
              id="empty-cart-state"
              className="py-10 text-center flex flex-col items-center"
            >
              <ShoppingBag size={36} strokeWidth={1.5} className="text-[#68716C]/60 mb-2.5" />
              <p className="text-[14px] font-semibold text-[#202522]">
                No products in sale yet
              </p>
              <p className="text-[14px] text-[#68716C] mt-1 max-w-[240px] mx-auto">
                Scan customer items using the camera scanner.
              </p>
            </div>
          ) : (
            <div id="scanned-items-list" className="divide-y divide-[#E1E6E2]/70">
              {cart.map((item) => {
                const prod = products.find((p) => p.id === item.productId);
                const isOutOfStock = !prod || prod.stock <= 0;
                const isExceedingStock = prod ? item.quantity > prod.stock : false;

                return (
                  <div
                    key={item.productId}
                    id={`cart-item-${item.productId}`}
                    className={`py-3 select-none rounded-xl px-2 -mx-2 transition-all flex items-center justify-between gap-3 ${
                      isOutOfStock
                        ? 'bg-red-50/40 border border-red-200/50'
                        : 'hover:bg-gray-50/50'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <ProductThumbnail
                        src={prod?.imageUrl || images[item.productId]}
                        alt={item.name}
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-[14.5px] font-bold text-[#202522] truncate">
                            {item.name}
                          </p>
                          {isOutOfStock && (
                            <span className="text-[10px] font-semibold text-red-600 bg-red-50 border border-red-200/80 px-1.5 py-0.5 rounded shrink-0">
                              Out of stock
                            </span>
                          )}
                          {!isOutOfStock && isExceedingStock && (
                            <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200/80 px-1.5 py-0.5 rounded shrink-0">
                              Max {prod?.stock}
                            </span>
                          )}
                        </div>
                        <p className="text-[12px] text-[#68716C] tabular-nums mt-0.5">
                          {formatCurrency(item.unitPrice)} each
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleUpdateQuantity(item.productId, -1)}
                          className="w-7 h-7 rounded-full bg-white border border-[#E1E6E2] flex items-center justify-center text-[#202522] hover:bg-gray-100 active:scale-95 transition-all cursor-pointer"
                          aria-label="Decrease quantity"
                        >
                          <Minus size={13} />
                        </button>

                        <span className="w-6 text-center text-[13.5px] font-bold text-[#202522] tabular-nums">
                          {item.quantity}
                        </span>

                        <button
                          type="button"
                          onClick={() => handleUpdateQuantity(item.productId, 1)}
                          disabled={!prod || prod.stock <= 0 || item.quantity >= prod.stock}
                          className="w-7 h-7 rounded-full bg-white border border-[#E1E6E2] flex items-center justify-center text-[#202522] hover:bg-gray-100 active:scale-95 transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                          aria-label="Increase quantity"
                        >
                          <Plus size={13} />
                        </button>
                      </div>

                      <span className="text-[14.5px] font-bold text-[#202522] tabular-nums text-right min-w-[60px]">
                        {formatCurrency(item.quantity * item.unitPrice)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Subtotal, Total Due, Cash Received & Final CTA */}
        {cart.length > 0 && (
          <div className="pt-5 border-t border-[#E1E6E2] space-y-5 mb-6">
            {/* Subtotal & Total Due Section */}
            <div className="space-y-3">
              <div className="flex justify-between items-center text-[13.5px]">
                <span className="text-[#68716C]">Subtotal</span>
                <span className="text-[#202522] font-semibold tabular-nums">
                  {formatCurrency(subtotal)}
                </span>
              </div>

              <div className="flex justify-between items-baseline pt-2 border-t border-[#E1E6E2]">
                <span className="text-[15px] font-bold text-[#202522]">
                  Total Due
                </span>
                <span className="text-[26px] font-black text-[#202522] tabular-nums">
                  {formatCurrency(total)}
                </span>
              </div>
            </div>

            {/* Payment Method Selector */}
            <div className="pt-2 space-y-2.5">
              <label className="block text-[13px] font-bold text-[#202522]">
                Payment Method
              </label>

              <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
                {[
                  {
                    id: 'cash' as PaymentMethod,
                    label: 'Cash',
                    subtitle: 'Bills & coins',
                    icon: Banknote,
                    activeIconBg: 'bg-[#E8F3E8]',
                    activeIconColor: 'text-[#2F7D32]',
                  },
                  {
                    id: 'gcash' as PaymentMethod,
                    label: 'GCash',
                    subtitle: 'E-Wallet QR',
                    icon: Smartphone,
                    activeIconBg: 'bg-[#E0F2FE]',
                    activeIconColor: 'text-[#0284C7]',
                  },
                  {
                    id: 'card' as PaymentMethod,
                    label: 'Cards',
                    subtitle: 'Debit / Credit',
                    icon: CreditCard,
                    activeIconBg: 'bg-[#F3E8FF]',
                    activeIconColor: 'text-[#7E22CE]',
                  },
                ].map((method) => {
                  const isSelected = paymentMethod === method.id;
                  const IconComp = method.icon;
                  return (
                    <motion.button
                      key={method.id}
                      type="button"
                      id={`payment-method-${method.id}`}
                      whileTap={{ scale: 0.96 }}
                      onClick={() => {
                        setPaymentMethod(method.id);
                        if (method.id !== 'cash') {
                          setCashTendered('');
                        }
                      }}
                      className={`relative p-2.5 sm:p-3 rounded-2xl border transition-colors duration-200 cursor-pointer flex flex-col items-center text-center gap-1.5 select-none focus:outline-none ${
                        isSelected
                          ? 'bg-[#E8F3E8] border-[#2F7D32] shadow-2xs ring-1 ring-[#2F7D32]'
                          : 'bg-white border-[#E1E6E2] hover:border-[#D0D7D2] hover:bg-[#FAFBFB]'
                      }`}
                    >
                      {/* Curated color shade icon container */}
                      <motion.div
                        layout
                        transition={{ duration: 0.2 }}
                        className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center transition-colors duration-200 ${
                          isSelected
                            ? `${method.activeIconBg} ${method.activeIconColor}`
                            : 'bg-[#F4F6F4] text-[#68716C]'
                        }`}
                      >
                        <IconComp size={19} strokeWidth={2.2} />
                      </motion.div>

                      <div className="min-w-0 w-full">
                        <p
                          className={`text-[12.5px] sm:text-[13px] font-bold truncate transition-colors duration-200 ${
                            isSelected ? 'text-[#202522]' : 'text-[#68716C]'
                          }`}
                        >
                          {method.label}
                        </p>
                        <span
                          className={`text-[10px] sm:text-[10.5px] font-medium block truncate transition-colors duration-200 ${
                            isSelected ? 'text-[#2F7D32]' : 'text-[#8E948F]'
                          }`}
                        >
                          {method.subtitle}
                        </span>
                      </div>

                      {/* Selected check pill with micro spring animation */}
                      <AnimatePresence>
                        {isSelected && (
                          <motion.div
                            initial={{ scale: 0, rotate: -30, opacity: 0 }}
                            animate={{ scale: 1, rotate: 0, opacity: 1 }}
                            exit={{ scale: 0, rotate: 30, opacity: 0 }}
                            transition={{ type: 'spring', stiffness: 500, damping: 28 }}
                            className="absolute top-1.5 right-1.5 w-3.5 h-3.5 rounded-full bg-[#2F7D32] text-white flex items-center justify-center shadow-2xs"
                          >
                            <Check size={9} strokeWidth={3} />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.button>
                  );
                })}
              </div>
            </div>

            {/* Method Specific Details with Smooth AnimatePresence Transition */}
            <div className="overflow-hidden">
              <AnimatePresence mode="wait">
                <motion.div
                  key={paymentMethod}
                  initial={{ opacity: 0, y: 8, filter: 'blur(3px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -8, filter: 'blur(3px)' }}
                  transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                >
                  {paymentMethod === 'cash' ? (
                    /* Cash Received Stacked Section */
                    <div className="pt-1 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <label
                          htmlFor="cash-tendered-input"
                          className="block text-[13px] font-bold text-[#202522]"
                        >
                          Cash received
                        </label>
                        {cashPresets.length > 0 && (
                          <div className="flex items-center gap-1.5">
                            {cashPresets.map((preset) => (
                              <button
                                key={preset}
                                type="button"
                                onClick={() => setCashTendered(preset.toString())}
                                className="px-2 py-0.5 rounded-md bg-[#F4F6F4] hover:bg-[#EAEAEA] active:scale-95 text-[11px] font-bold text-[#202522] transition-all cursor-pointer border border-[#E1E6E2]"
                              >
                                ₱{preset}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 pb-2 border-b border-[#E1E6E2] focus-within:border-[#202522] transition-colors">
                        <span className="text-[15px] font-bold text-[#202522]">₱</span>
                        <input
                          id="cash-tendered-input"
                          type="number"
                          min="0"
                          step="any"
                          placeholder={total.toFixed(2)}
                          value={cashTendered}
                          onChange={(e) => setCashTendered(e.target.value)}
                          className="w-full text-[15px] font-bold bg-transparent focus:outline-none text-[#202522] placeholder:text-[#68716C]/40"
                        />
                      </div>

                      {/* Real-time Change Due / Short Info */}
                      {parsedTendered > 0 && (
                        <div className="pt-1 flex items-center justify-between text-[13.5px]">
                          <span
                            className={
                              isShortCash
                                ? 'text-[#D94841] font-medium'
                                : 'text-[#202522] font-semibold'
                            }
                          >
                            {isShortCash ? 'Short by:' : 'Change due:'}
                          </span>
                          <span
                            className={`tabular-nums font-bold text-[15px] ${
                              isShortCash ? 'text-[#D94841]' : 'text-[#202522]'
                            }`}
                          >
                            {isShortCash
                              ? formatCurrency(total - parsedTendered)
                              : formatCurrency(changeAmount)}
                          </span>
                        </div>
                      )}
                    </div>
                  ) : paymentMethod === 'gcash' ? (
                    /* GCash Info Container */
                    <div className="p-3.5 bg-[#EFF6FF] border border-[#BFDBFE] rounded-2xl flex items-center gap-3 shadow-2xs">
                      <div className="w-9 h-9 rounded-xl bg-[#DBEAFE] text-[#0284C7] flex items-center justify-center shrink-0">
                        <Smartphone size={18} strokeWidth={2.2} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-bold text-[#1E3A8A]">
                          GCash Payment
                        </p>
                        <p className="text-[11.5px] text-[#3B82F6] leading-snug mt-0.5">
                          Collect exact amount of <strong className="font-bold text-[#1E3A8A]">{formatCurrency(total)}</strong> via store QR or transfer.
                        </p>
                      </div>
                    </div>
                  ) : (
                    /* Card Info Container */
                    <div className="p-3.5 bg-[#F5F3FF] border border-[#DDD6FE] rounded-2xl flex items-center gap-3 shadow-2xs">
                      <div className="w-9 h-9 rounded-xl bg-[#EDE9FE] text-[#7C3AED] flex items-center justify-center shrink-0">
                        <CreditCard size={18} strokeWidth={2.2} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-bold text-[#4C1D95]">
                          Card Payment
                        </p>
                        <p className="text-[11.5px] text-[#7C3AED] leading-snug mt-0.5">
                          Tap or swipe card on POS terminal for <strong className="font-bold text-[#4C1D95]">{formatCurrency(total)}</strong>.
                        </p>
                      </div>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Complete Sale CTA */}
            <div className="pt-2">
              <button
                id="btn-complete-sale"
                type="button"
                onClick={handleFinalizeSale}
                disabled={isShortCash || hasInvalidStock || cart.length === 0}
                className="w-full h-12 bg-[#2F7D32] hover:bg-[#256B29] active:bg-[#1E5A22] disabled:opacity-50 disabled:cursor-not-allowed text-white text-[15px] font-bold rounded-full flex items-center justify-center cursor-pointer shadow-sm transition-all"
              >
                <span>Complete Sale</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Barcode Scanner Modal for Adding More Items */}
      <BarcodeScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanSuccess={handleScanSuccess}
        onProceedToActiveSale={(items) => {
          setIsScannerOpen(false);
          if (items && items.length > 0) {
            setCart((prev) => {
              const map = new Map<string, SaleItem>();
              prev.forEach((item) => map.set(item.productId, { ...item }));
              items.forEach((item) => {
                const prod = products.find((p) => p.id === item.productId);
                const maxStock = prod ? prod.stock : 0;
                if (maxStock <= 0) return;
                if (map.has(item.productId)) {
                  const existing = map.get(item.productId)!;
                  map.set(item.productId, {
                    ...existing,
                    quantity: Math.min(existing.quantity + item.quantity, maxStock),
                  });
                } else {
                  map.set(item.productId, {
                    ...item,
                    quantity: Math.min(item.quantity, maxStock),
                  });
                }
              });
              return Array.from(map.values());
            });
          }
        }}
        products={products}
        title="Scan Barcode"
      />

      {/* Minimalist Black and White Confirmation Popup for Item Removal */}
      {itemToDelete && (
        <div
          id="confirm-removal-modal"
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px]"
          onClick={() => setItemToDelete(null)}
        >
          <div
            className="w-full max-w-sm bg-white rounded-2xl p-6 border border-[#E1E6E2] shadow-xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-1.5">
              <h3 className="text-[17px] font-bold text-[#202522]">
                Remove item
              </h3>
              <p className="text-[13.5px] text-[#68716C] leading-relaxed">
                Do you want to remove <span className="font-semibold text-[#202522]">{itemToDelete.name}</span> from this sale?
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                id="btn-cancel-remove"
                onClick={() => setItemToDelete(null)}
                className="h-10 px-4 rounded-xl border border-[#E1E6E2] text-[13.5px] font-semibold text-[#202522] hover:bg-gray-100 active:scale-95 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                id="btn-confirm-remove"
                onClick={() => {
                  handleRemoveItem(itemToDelete.id);
                  setItemToDelete(null);
                }}
                className="h-10 px-4 rounded-xl bg-[#202522] text-white text-[13.5px] font-semibold hover:bg-black active:scale-95 transition-all cursor-pointer"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
};
