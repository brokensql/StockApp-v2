import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Receipt, ChevronRight, Search, X, SearchX, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Product, SaleTransaction } from '../types';
import { ActiveSaleScreen } from './ActiveSaleScreen';
import { TransactionDetailModal } from './TransactionDetailModal';
import {
  calculatePHTSalesGrowth,
  formatPHTTimestamp,
  getTransactionTimestamp,
} from '../utils/philippineDate';
import { SALES_PAGE_CLEARED_IDS_KEY } from '../utils/storageKeys';
import { BackupReminderModal } from './BackupReminderModal';
import { getStoredTIN } from '../utils/storeProfile';

interface SalesScreenProps {
  products: Product[];
  sales: SaleTransaction[];
  onCompleteSale: (transaction: SaleTransaction, updatedProducts: Product[]) => boolean | Promise<boolean> | void;
  onDeleteSale?: (saleId: string, restoreStock?: boolean) => void;
  onClearSales?: (saleIds: string[]) => void;
  onBack?: () => void;
  onStartNewSale?: () => void;
  isStartingSaleImmediately?: boolean;
  storeName?: string;
  tinNumber?: string;
}

export const SalesScreen: React.FC<SalesScreenProps> = ({
  products,
  sales,
  onCompleteSale,
  onDeleteSale,
  onClearSales,
  onBack,
  onStartNewSale,
  isStartingSaleImmediately = false,
  storeName,
  tinNumber,
}) => {
  const [isActiveSaleOpen, setIsActiveSaleOpen] = useState(isStartingSaleImmediately);
  const [selectedTransaction, setSelectedTransaction] = useState<SaleTransaction | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMethod, setFilterMethod] = useState<'all' | 'cash' | 'gcash' | 'card'>('all');
  const [isClearHistoryModalOpen, setIsClearHistoryModalOpen] = useState(false);
  const [showClearBackupReminder, setShowClearBackupReminder] = useState(false);
  const [clearRange, setClearRange] = useState<'older_30' | 'older_90' | 'all'>('older_30');

  // Track sales cleared specifically from the Sales page view without touching global app data
  const [clearedSalesIds, setClearedSalesIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(SALES_PAGE_CLEARED_IDS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.error('Failed to load cleared sales page IDs', e);
    }
    return [];
  });

  useEffect(() => {
    try {
      localStorage.setItem(SALES_PAGE_CLEARED_IDS_KEY, JSON.stringify(clearedSalesIds));
    } catch (e) {
      console.error('Failed to save cleared sales page IDs', e);
    }
  }, [clearedSalesIds]);

  const clearedSet = useMemo(() => new Set(clearedSalesIds), [clearedSalesIds]);

  // Sales visible strictly in the Sales page (cleared sales are hidden only here)
  const visibleSales = useMemo(() => {
    if (clearedSet.size === 0) return sales;
    return sales.filter((s) => !clearedSet.has(s.id));
  }, [sales, clearedSet]);

  useEffect(() => {
    if (isStartingSaleImmediately) {
      setIsActiveSaleOpen(true);
    }
  }, [isStartingSaleImmediately]);

  // Compute date buckets for clearing history based on visible sales
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;

  const { salesOlderThan30, salesOlderThan90 } = useMemo(() => {
    const now = Date.now();
    const older30: SaleTransaction[] = [];
    const older90: SaleTransaction[] = [];

    for (const sale of visibleSales) {
      const ts = getTransactionTimestamp(sale);
      const age = now - ts;
      if (age > thirtyDaysMs) {
        older30.push(sale);
      }
      if (age > ninetyDaysMs) {
        older90.push(sale);
      }
    }

    return { salesOlderThan30: older30, salesOlderThan90: older90 };
  }, [visibleSales]);

  useEffect(() => {
    if (isClearHistoryModalOpen) {
      if (salesOlderThan30.length > 0) {
        setClearRange('older_30');
      } else if (salesOlderThan90.length > 0) {
        setClearRange('older_90');
      } else {
        setClearRange('all');
      }
    }
  }, [isClearHistoryModalOpen, salesOlderThan30.length, salesOlderThan90.length]);

  const targetSalesToClear = useMemo(() => {
    if (clearRange === 'older_30') return salesOlderThan30;
    if (clearRange === 'older_90') return salesOlderThan90;
    return visibleSales;
  }, [clearRange, salesOlderThan30, salesOlderThan90, visibleSales]);

  const handleExecuteClearHistory = () => {
    if (targetSalesToClear.length === 0) return;
    const idsToClear = targetSalesToClear.map((s) => s.id);
    
    // Clear only inside the Sales page — does not delete from master sales (stats and other pages remain intact)
    setClearedSalesIds((prev) => Array.from(new Set([...prev, ...idsToClear])));
    setIsClearHistoryModalOpen(false);

    toast.success(
      `Cleared ${idsToClear.length} ${idsToClear.length === 1 ? 'sale' : 'sales'} from Sales page. Stats & other pages remain preserved.`
    );
  };

  // Compute today's sales summary in Philippine Time (Asia/Manila, UTC+8) for the Sales page
  const growthMetrics = calculatePHTSalesGrowth(visibleSales);
  const todaySalesTotal = growthMetrics.todayTotal;
  const todaySalesCount = growthMetrics.todayCount;

  const formatCurrency = (val?: number | null) => {
    const num = typeof val === 'number' && !isNaN(val) ? val : 0;
    return `₱${num.toLocaleString('en-PH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const handleSaleCompleted = async (transaction: SaleTransaction, updatedProducts: Product[]) => {
    const success = await onCompleteSale(transaction, updatedProducts);
    if (success !== false) {
      setIsActiveSaleOpen(false);
    }
  };

  const handleStartSale = () => {
    if (onStartNewSale) {
      onStartNewSale();
    } else {
      setIsActiveSaleOpen(true);
    }
  };

  const effectiveTIN = (tinNumber?.trim() || getStoredTIN())?.trim();

  // Filtered sales
  const filteredSales = useMemo(() => {
    return visibleSales.filter((sale) => {
      // Payment method filter
      if (filterMethod !== 'all' && sale.paymentMethod !== filterMethod) {
        return false;
      }

      // Search query filter
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase().trim();
        const matchesTx = sale.transactionNumber.toLowerCase().includes(q);
        const matchesPrimary = sale.primaryItemName.toLowerCase().includes(q);
        const matchesItems = sale.items.some((it) => it.name.toLowerCase().includes(q));
        const matchesTin = (sale.tinNumber || effectiveTIN || '').toLowerCase().includes(q);
        if (!matchesTx && !matchesPrimary && !matchesItems && !matchesTin) {
          return false;
        }
      }

      return true;
    });
  }, [visibleSales, searchQuery, filterMethod, effectiveTIN]);

  if (isActiveSaleOpen) {
    return (
      <ActiveSaleScreen
        products={products}
        existingSales={visibleSales}
        storeName={storeName}
        tinNumber={effectiveTIN}
        onCompleteSale={handleSaleCompleted}
        onCancelSale={() => setIsActiveSaleOpen(false)}
      />
    );
  }

  return (
    <motion.div
      id="sales-overview-screen-view"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="w-full max-w-[430px] mx-auto px-5 pt-0.5"
      style={{ paddingBottom: 'calc(7rem + env(safe-area-inset-bottom, 0px))' }}
    >
      {/* Container under Today's revenue with green fill */}
      <section aria-label="Today's revenue summary" className="mb-4">
        <div
          id="today-sales-card"
          className="bg-[#2F7D32] rounded-2xl p-4.5 text-white shadow-[0_4px_14px_rgba(47,125,50,0.22)]"
        >
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium text-white/90">
              Today&apos;s revenue
            </span>
            <span className="text-[11.5px] font-medium px-2.5 py-0.5 rounded-full bg-white/15 text-white tabular-nums">
              {todaySalesCount} {todaySalesCount === 1 ? 'transaction' : 'transactions'}
            </span>
          </div>

          <p
            id="today-sales-amount"
            className="text-[28px] sm:text-[30px] font-bold text-white mt-1 tabular-nums tracking-tight leading-tight"
          >
            {formatCurrency(todaySalesTotal)}
          </p>
        </div>
      </section>

      {/* Search and Filters */}
      {visibleSales.length > 0 && (
        <section aria-label="Search and filter sales" className="mb-4">
          {/* Rounded Search Bar */}
          <div className="relative mb-2.5">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-[#929A95]">
              <Search size={17} strokeWidth={2} />
            </div>
            <input
              id="sales-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search product or receipt #..."
              className="w-full h-11 pl-11 pr-10 bg-white border border-[#E1E6E2] rounded-full text-[14px] text-[#202522] placeholder:text-[#929A95] focus:outline-none focus:border-[#2F7D32] focus:ring-2 focus:ring-[#2F7D32]/25 shadow-[0_2px_6px_rgba(32,37,34,0.02)] transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[#929A95] hover:text-[#202522] cursor-pointer"
                aria-label="Clear search"
              >
                <X size={15} />
              </button>
            )}
          </div>

          {/* Smooth Transition Filter Buttons matching Inventory */}
          <nav
            aria-label="Payment method filters"
            className="grid grid-cols-4 gap-1.5 sm:gap-2 w-full select-none"
          >
            {[
              { id: 'all', label: 'All' },
              { id: 'cash', label: 'Cash' },
              { id: 'gcash', label: 'GCash' },
              { id: 'card', label: 'Card' },
            ].map((filter) => {
              const isSelected = filterMethod === filter.id;
              return (
                <button
                  key={filter.id}
                  id={`sales-filter-${filter.id}`}
                  type="button"
                  onClick={() => setFilterMethod(filter.id as any)}
                  className="relative h-9 sm:h-9.5 px-2 rounded-full text-[12.5px] sm:text-[13px] font-medium whitespace-nowrap cursor-pointer flex items-center justify-center border border-[#E1E6E2] bg-white focus:outline-none"
                >
                  {isSelected && (
                    <motion.div
                      layoutId="sales-filter-active-pill"
                      className="absolute -inset-px bg-[#2F7D32] rounded-full shadow-xs"
                      transition={{
                        type: 'tween',
                        ease: [0.25, 0.1, 0.25, 1],
                        duration: 0.2,
                      }}
                    />
                  )}
                  <span
                    className={`relative z-10 transition-colors duration-150 text-center ${
                      isSelected ? 'text-white font-semibold' : 'text-[#68716C] hover:text-[#202522]'
                    }`}
                  >
                    {filter.label}
                  </span>
                </button>
              );
            })}
          </nav>
        </section>
      )}

      {/* Sales Transactions List */}
      <section aria-label="Sales transactions list" className="pt-1">
        {visibleSales.length > 0 && (
          <div className="flex items-center justify-between pb-2 px-0.5">
            <h2
              id="recent-sales-heading"
              className="text-[13.5px] font-semibold text-[#202522]"
            >
              Sales history
            </h2>
            <button
              type="button"
              id="btn-open-clear-sales-modal"
              onClick={() => setIsClearHistoryModalOpen(true)}
              className="text-[12px] font-medium text-[#929A95] hover:text-[#D94841] active:text-[#B83832] flex items-center gap-1.5 transition-colors cursor-pointer select-none"
              aria-label="Clear sales history"
            >
              <Trash2 size={12.5} strokeWidth={1.8} />
              <span>Clear history</span>
            </button>
          </div>
        )}

        {visibleSales.length === 0 ? (
          /* Empty Sales State */
          <div
            id="empty-sales-state"
            className="py-14 text-center my-2 flex flex-col items-center"
          >
            <div className="w-12 h-12 rounded-full bg-[#F1F3F0] flex items-center justify-center text-[#929A95] mb-3">
              <Receipt size={24} strokeWidth={1.8} />
            </div>
            <h3 className="text-[15px] font-semibold text-[#202522] mb-1">
              No sales recorded
            </h3>
            <p className="text-[13.5px] leading-relaxed text-[#68716C] mb-5 max-w-[240px] mx-auto">
              Completed transactions will show here. Tap any sale to view or download receipts.
            </p>
            <button
              type="button"
              onClick={handleStartSale}
              className="h-10 px-5 bg-[#2F7D32] hover:bg-[#256B29] active:bg-[#1E5A22] text-white text-[13.5px] font-medium rounded-full inline-flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
            >
              <Plus size={16} strokeWidth={2.2} />
              <span>Record a sale</span>
            </button>
          </div>
        ) : filteredSales.length === 0 ? (
          /* Filter No Match */
          <div className="py-12 text-center my-2 flex flex-col items-center">
            <div className="w-11 h-11 rounded-full bg-[#F1F3F0] flex items-center justify-center text-[#929A95] mb-2.5">
              <SearchX size={20} strokeWidth={1.8} />
            </div>
            <p className="text-[14px] font-semibold text-[#202522] mb-1">
              No matching sales
            </p>
            <p className="text-[13px] text-[#68716C] mb-4">
              Try adjusting your search or payment filter.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setFilterMethod('all');
              }}
              className="h-9 px-4 bg-white border border-[#E1E6E2] text-[#202522] text-[13px] font-medium rounded-full inline-flex items-center gap-1.5 cursor-pointer hover:bg-[#F4F6F4] transition-colors"
            >
              <span>Reset filters</span>
            </button>
          </div>
        ) : (
          <div
            id="recent-sales-list-container"
            className="space-y-2.5 pb-2"
          >
            {filteredSales.map((sale) => (
              <div
                key={sale.id}
                id={`sale-row-${sale.id}`}
                onClick={() => setSelectedTransaction(sale)}
                className="w-full bg-white rounded-2xl border border-[#E1E6E2] p-4 sm:p-4.5 shadow-[0_2px_8px_rgba(32,37,34,0.04)] hover:shadow-[0_4px_14px_rgba(47,125,50,0.08)] flex items-center justify-between cursor-pointer hover:border-[#2F7D32]/60 active:scale-[0.99] transition-all group select-none"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    setSelectedTransaction(sale);
                  }
                }}
                aria-label={`View receipt for transaction ${sale.transactionNumber}`}
              >
                {/* Left: Product & Transaction Details */}
                <div className="min-w-0 pr-3 flex-1">
                  <p className="text-[14px] sm:text-[14.5px] font-medium text-[#202522] truncate group-hover:text-[#2F7D32] transition-colors leading-snug">
                    {sale.primaryItemName}
                    {sale.items.length > 1 && (
                      <span className="text-[12px] font-normal text-[#929A95] ml-1.5">
                        +{sale.items.length - 1} more
                      </span>
                    )}
                  </p>
                  <p className="text-[11.5px] sm:text-[12px] text-[#68716C] mt-0.5 tabular-nums leading-tight">
                    {formatPHTTimestamp(getTransactionTimestamp(sale))}
                    <span className="mx-1 text-[#C3C9C4]">·</span>
                    {sale.itemCount} {sale.itemCount === 1 ? 'unit' : 'units'}
                    <span className="mx-1 text-[#C3C9C4]">·</span>
                    <span className="capitalize">{sale.paymentMethod}</span>
                  </p>
                </div>

                {/* Right: Amount & Receipt ID & TIN */}
                <div className="text-right flex-shrink-0">
                  <p className="text-[14.5px] sm:text-[15px] font-bold text-[#202522] tabular-nums leading-snug">
                    {formatCurrency(sale.total)}
                  </p>
                  <p className="text-[11px] text-[#929A95] font-mono mt-0.5 leading-tight">
                    {sale.transactionNumber}
                  </p>
                  {(sale.tinNumber || effectiveTIN) && (
                    <p className="text-[10px] text-[#68716C] font-mono mt-0.5 leading-tight">
                      TIN: {sale.tinNumber || effectiveTIN}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Transaction Detail Receipt Modal */}
      <TransactionDetailModal
        isOpen={Boolean(selectedTransaction)}
        transaction={selectedTransaction}
        storeName={storeName || selectedTransaction?.storeName}
        tinNumber={selectedTransaction?.tinNumber || effectiveTIN}
        onClose={() => setSelectedTransaction(null)}
        onDeleteSale={onDeleteSale}
      />

      {/* Clear Sales History Modal */}
      <AnimatePresence>
        {isClearHistoryModalOpen && (
          <div
            id="clear-sales-modal-backdrop"
            className="fixed inset-0 z-[100] flex items-center justify-center bg-[#202522]/60 backdrop-blur-xs p-4"
          >
            <div
              className="fixed inset-0"
              onClick={() => setIsClearHistoryModalOpen(false)}
              aria-hidden="true"
            />
            <motion.div
              id="clear-sales-modal-dialog"
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.16, ease: 'easeOut' }}
              className="relative z-10 w-full max-w-[360px] bg-white rounded-2xl p-5 shadow-xl border border-[#E1E6E2]"
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="text-[16px] font-bold text-[#202522]">
                    Clear sales history
                  </h3>
                  <p className="text-[12px] text-[#68716C] mt-0.5">
                    Clears list inside Sales page only
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsClearHistoryModalOpen(false)}
                  className="w-7 h-7 rounded-full bg-[#F1F3F0] hover:bg-[#E5E8E4] text-[#68716C] flex items-center justify-center transition-colors cursor-pointer"
                  aria-label="Close"
                >
                  <X size={15} />
                </button>
              </div>

              <p className="text-[12.5px] leading-relaxed text-[#68716C] mb-4">
                Clears past sales from this Sales page. Your stats, store reports, and other pages remain completely untouched and preserved.
              </p>

              {/* Options */}
              <div className="space-y-1.5 mb-5 select-none">
                <button
                  type="button"
                  onClick={() => setClearRange('older_30')}
                  className={`w-full p-2.5 rounded-xl text-left flex items-center justify-between transition-colors cursor-pointer ${
                    clearRange === 'older_30'
                      ? 'bg-[#E8F3E8] text-[#2F7D32]'
                      : 'bg-[#F7F9FB] hover:bg-[#F1F3F0] text-[#202522]'
                  }`}
                >
                  <div>
                    <p className="text-[13px] font-semibold">
                      Older than 30 days
                    </p>
                    <p className="text-[11.5px] text-[#68716C]">
                      Preserves this month&apos;s records
                    </p>
                  </div>
                  <span className="text-[12px] font-semibold tabular-nums px-2 py-0.5 rounded-md bg-white/80">
                    {salesOlderThan30.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setClearRange('older_90')}
                  className={`w-full p-2.5 rounded-xl text-left flex items-center justify-between transition-colors cursor-pointer ${
                    clearRange === 'older_90'
                      ? 'bg-[#E8F3E8] text-[#2F7D32]'
                      : 'bg-[#F7F9FB] hover:bg-[#F1F3F0] text-[#202522]'
                  }`}
                >
                  <div>
                    <p className="text-[13px] font-semibold">
                      Older than 90 days
                    </p>
                    <p className="text-[11.5px] text-[#68716C]">
                      Preserves last 3 months
                    </p>
                  </div>
                  <span className="text-[12px] font-semibold tabular-nums px-2 py-0.5 rounded-md bg-white/80">
                    {salesOlderThan90.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setClearRange('all')}
                  className={`w-full p-2.5 rounded-xl text-left flex items-center justify-between transition-colors cursor-pointer ${
                    clearRange === 'all'
                      ? 'bg-[#FDF0EE] text-[#D94841]'
                      : 'bg-[#F7F9FB] hover:bg-[#F1F3F0] text-[#202522]'
                  }`}
                >
                  <div>
                    <p className="text-[13px] font-semibold">
                      All sales
                    </p>
                    <p className="text-[11.5px] text-[#68716C]">
                      Clear all from Sales page view
                    </p>
                  </div>
                  <span className="text-[12px] font-semibold tabular-nums px-2 py-0.5 rounded-md bg-white/80">
                    {visibleSales.length}
                  </span>
                </button>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsClearHistoryModalOpen(false)}
                  className="flex-1 h-10 bg-[#F1F3F0] hover:bg-[#E5E8E4] text-[#202522] text-[13px] font-medium rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  id="btn-confirm-clear-history"
                  onClick={() => setShowClearBackupReminder(true)}
                  disabled={targetSalesToClear.length === 0}
                  className="flex-1 h-10 bg-[#D94841] hover:bg-[#B83832] active:bg-[#9B2F2A] disabled:opacity-40 disabled:cursor-not-allowed text-white text-[13px] font-semibold rounded-xl transition-colors cursor-pointer shadow-xs"
                >
                  {targetSalesToClear.length === 0
                    ? 'No sales to clear'
                    : `Clear ${targetSalesToClear.length} ${targetSalesToClear.length === 1 ? 'sale' : 'sales'}`}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Backup Reminder before clearing sales */}
      <BackupReminderModal
        isOpen={showClearBackupReminder}
        title="Clear Sales Ledger Records"
        description={`You are about to clear ${targetSalesToClear.length} sale transaction(s) from view. Download a backup copy of your sales records first?`}
        destructiveActionLabel="Proceed with Clear"
        onProceed={() => {
          setShowClearBackupReminder(false);
          handleExecuteClearHistory();
        }}
        onCancel={() => setShowClearBackupReminder(false)}
      />
    </motion.div>
  );
};

