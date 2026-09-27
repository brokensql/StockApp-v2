import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Receipt, ChevronRight, Search, X, SearchX, Trash2 } from 'lucide-react';
import { Product, SaleTransaction } from '../types';
import { ActiveSaleScreen } from './ActiveSaleScreen';
import { TransactionDetailModal } from './TransactionDetailModal';
import {
  calculatePHTSalesGrowth,
  formatPHTTimestamp,
  getTransactionTimestamp,
} from '../utils/philippineDate';

interface SalesScreenProps {
  products: Product[];
  sales: SaleTransaction[];
  onCompleteSale: (transaction: SaleTransaction, updatedProducts: Product[]) => void;
  onDeleteSale?: (saleId: string, restoreStock?: boolean) => void;
  onClearSales?: (saleIds: string[]) => void;
  onBack?: () => void;
  onStartNewSale?: () => void;
  isStartingSaleImmediately?: boolean;
  storeName?: string;
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
}) => {
  const [isActiveSaleOpen, setIsActiveSaleOpen] = useState(isStartingSaleImmediately);
  const [selectedTransaction, setSelectedTransaction] = useState<SaleTransaction | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMethod, setFilterMethod] = useState<'all' | 'cash' | 'gcash' | 'card'>('all');
  const [isClearHistoryModalOpen, setIsClearHistoryModalOpen] = useState(false);
  const [clearRange, setClearRange] = useState<'older_30' | 'older_90' | 'all'>('older_30');

  useEffect(() => {
    if (isStartingSaleImmediately) {
      setIsActiveSaleOpen(true);
    }
  }, [isStartingSaleImmediately]);

  // Compute date buckets for clearing history
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;

  const { salesOlderThan30, salesOlderThan90 } = useMemo(() => {
    const now = Date.now();
    const older30: SaleTransaction[] = [];
    const older90: SaleTransaction[] = [];

    for (const sale of sales) {
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
  }, [sales]);

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
    return sales;
  }, [clearRange, salesOlderThan30, salesOlderThan90, sales]);

  const handleExecuteClearHistory = () => {
    if (targetSalesToClear.length === 0) return;
    if (onClearSales) {
      onClearSales(targetSalesToClear.map((s) => s.id));
    }
    setIsClearHistoryModalOpen(false);
  };

  // Compute today's sales summary strictly in Philippine Time (Asia/Manila, UTC+8)
  const growthMetrics = calculatePHTSalesGrowth(sales);
  const todaySalesTotal = growthMetrics.todayTotal;
  const todaySalesCount = growthMetrics.todayCount;

  const formatCurrency = (val?: number | null) => {
    const num = typeof val === 'number' && !isNaN(val) ? val : 0;
    return `₱${num.toLocaleString('en-PH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const handleSaleCompleted = (transaction: SaleTransaction, updatedProducts: Product[]) => {
    onCompleteSale(transaction, updatedProducts);
    setIsActiveSaleOpen(false);
  };

  const handleStartSale = () => {
    if (onStartNewSale) {
      onStartNewSale();
    } else {
      setIsActiveSaleOpen(true);
    }
  };

  // Filtered sales
  const filteredSales = useMemo(() => {
    return sales.filter((sale) => {
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
        if (!matchesTx && !matchesPrimary && !matchesItems) {
          return false;
        }
      }

      return true;
    });
  }, [sales, searchQuery, filterMethod]);

  if (isActiveSaleOpen) {
    return (
      <ActiveSaleScreen
        products={products}
        existingSales={sales}
        storeName={storeName}
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
      {/* Sales Count Subtitle & Clear History Button */}
      <div className="mb-2.5 flex items-center justify-between">
        <p
          id="sales-subtitle"
          className="text-[13px] font-medium text-[#68716C] tabular-nums"
        >
          {sales.length} {sales.length === 1 ? 'sale' : 'sales'} recorded
        </p>

        {sales.length > 0 && onClearSales && (
          <button
            type="button"
            id="btn-open-clear-sales-modal"
            onClick={() => setIsClearHistoryModalOpen(true)}
            className="text-[12px] font-medium text-[#929A95] hover:text-[#D94841] active:text-[#B83832] flex items-center gap-1.5 transition-colors cursor-pointer py-0.5 select-none"
            aria-label="Clear sales history"
          >
            <Trash2 size={12.5} strokeWidth={1.8} />
            <span>Clear history</span>
          </button>
        )}
      </div>

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
      {sales.length > 0 && (
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
              className="w-full h-11 pl-11 pr-10 bg-white border border-[#E1E6E2] rounded-full text-[14px] text-[#202522] placeholder:text-[#929A95] focus:outline-none focus:border-[#2F7D32] focus:ring-1 focus:ring-[#2F7D32] shadow-[0_2px_6px_rgba(32,37,34,0.02)] transition-colors"
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

          {/* Green Rounded Filter Buttons */}
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
                  className={`relative h-9 px-2 rounded-full text-[12.5px] sm:text-[13px] font-medium whitespace-nowrap cursor-pointer flex items-center justify-center transition-all ${
                    isSelected
                      ? 'bg-[#2F7D32] text-white font-semibold shadow-xs'
                      : 'bg-white text-[#68716C] hover:text-[#202522] border border-[#E1E6E2]'
                  }`}
                >
                  <span>{filter.label}</span>
                </button>
              );
            })}
          </nav>
        </section>
      )}

      {/* Sales Transactions List */}
      <section aria-label="Sales transactions list" className="pt-1">
        {sales.length > 0 && (
          <div className="flex items-center justify-between pb-2 px-0.5">
            <h2
              id="recent-sales-heading"
              className="text-[13.5px] font-semibold text-[#202522]"
            >
              Recent sales
            </h2>
            <span className="text-[12px] text-[#929A95] tabular-nums">
              {filteredSales.length === sales.length
                ? `${sales.length} total`
                : `${filteredSales.length} of ${sales.length}`}
            </span>
          </div>
        )}

        {sales.length === 0 ? (
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
          /* Open, Unboxed Sales List */
          <div
            id="recent-sales-list-card"
            className="divide-y divide-[#E1E6E2]/70"
          >
            {filteredSales.map((sale) => (
              <div
                key={sale.id}
                id={`sale-row-${sale.id}`}
                onClick={() => setSelectedTransaction(sale)}
                className="py-3 px-1.5 -mx-1.5 flex items-center justify-between cursor-pointer hover:bg-black/[0.02] active:bg-black/[0.04] rounded-xl transition-colors group"
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
                  <p className="text-[14.5px] font-medium text-[#202522] truncate group-hover:text-[#2F7D32] transition-colors">
                    {sale.primaryItemName}
                    {sale.items.length > 1 && (
                      <span className="text-[12px] font-normal text-[#929A95] ml-1.5">
                        +{sale.items.length - 1} more
                      </span>
                    )}
                  </p>
                  <p className="text-[12px] text-[#68716C] mt-0.5 tabular-nums">
                    {formatPHTTimestamp(getTransactionTimestamp(sale))}
                    <span className="mx-1 text-[#C3C9C4]">·</span>
                    {sale.itemCount} {sale.itemCount === 1 ? 'unit' : 'units'}
                    <span className="mx-1 text-[#C3C9C4]">·</span>
                    <span className="capitalize">{sale.paymentMethod}</span>
                  </p>
                </div>

                {/* Right: Amount & Receipt ID */}
                <div className="text-right flex-shrink-0">
                  <p className="text-[15px] font-semibold text-[#202522] tabular-nums">
                    {formatCurrency(sale.total)}
                  </p>
                  <p className="text-[11px] text-[#929A95] font-mono mt-0.5">
                    {sale.transactionNumber}
                  </p>
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
                    Free storage and keep ledger lean
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
                Removes past sale records. Your inventory catalog and product stock will not be affected.
              </p>

              {/* Options */}
              <div className="space-y-1.5 mb-5 select-none">
                <button
                  type="button"
                  onClick={() => setClearRange('older_30')}
                  className={`w-full p-2.5 rounded-xl text-left flex items-center justify-between transition-colors cursor-pointer ${
                    clearRange === 'older_30'
                      ? 'bg-[#E8F3E8] text-[#2F7D32]'
                      : 'bg-[#F9FAF8] hover:bg-[#F1F3F0] text-[#202522]'
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
                      : 'bg-[#F9FAF8] hover:bg-[#F1F3F0] text-[#202522]'
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
                      : 'bg-[#F9FAF8] hover:bg-[#F1F3F0] text-[#202522]'
                  }`}
                >
                  <div>
                    <p className="text-[13px] font-semibold">
                      All sales
                    </p>
                    <p className="text-[11.5px] text-[#68716C]">
                      Reset entire transaction history
                    </p>
                  </div>
                  <span className="text-[12px] font-semibold tabular-nums px-2 py-0.5 rounded-md bg-white/80">
                    {sales.length}
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
                  onClick={handleExecuteClearHistory}
                  disabled={targetSalesToClear.length === 0}
                  className="flex-1 h-10 bg-[#D94841] hover:bg-[#B83832] active:bg-[#9B2F2A] disabled:opacity-40 disabled:cursor-not-allowed text-white text-[13px] font-semibold rounded-xl transition-colors cursor-pointer shadow-xs"
                >
                  {targetSalesToClear.length === 0
                    ? 'No sales to clear'
                    : `Delete ${targetSalesToClear.length} ${targetSalesToClear.length === 1 ? 'sale' : 'sales'}`}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

