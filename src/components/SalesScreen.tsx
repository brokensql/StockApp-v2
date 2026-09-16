import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { Plus, Receipt, ChevronRight, Search, X, SearchX } from 'lucide-react';
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
  onBack?: () => void;
  onStartNewSale?: () => void;
  isStartingSaleImmediately?: boolean;
  storeName?: string;
}

export const SalesScreen: React.FC<SalesScreenProps> = ({
  products,
  sales,
  onCompleteSale,
  onBack,
  onStartNewSale,
  isStartingSaleImmediately = false,
  storeName,
}) => {
  const [isActiveSaleOpen, setIsActiveSaleOpen] = useState(isStartingSaleImmediately);
  const [selectedTransaction, setSelectedTransaction] = useState<SaleTransaction | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMethod, setFilterMethod] = useState<'all' | 'cash' | 'gcash' | 'card'>('all');

  useEffect(() => {
    if (isStartingSaleImmediately) {
      setIsActiveSaleOpen(true);
    }
  }, [isStartingSaleImmediately]);

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
      {/* Sales Count Subtitle */}
      <div className="mb-2.5 flex items-center justify-between">
        <p
          id="sales-subtitle"
          className="text-[13px] font-medium text-[#68716C] tabular-nums"
        >
          {sales.length} {sales.length === 1 ? 'sale' : 'sales'} recorded
        </p>
      </div>

      {/* Today's Sales Card */}
      <section aria-label="Today's sales summary" className="mb-5">
        <div
          id="today-sales-card"
          className="bg-white border border-[#E1E6E2] rounded-2xl p-4.5 shadow-[0_2px_8px_rgba(32,37,34,0.02)]"
        >
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium text-[#68716C]">
              Today's sales
            </span>
            <span className="text-[11.5px] font-medium px-2.5 py-0.5 rounded-full bg-[#FAFBFB] border border-[#E1E6E2] text-[#68716C] tabular-nums">
              {todaySalesCount} {todaySalesCount === 1 ? 'transaction' : 'transactions'}
            </span>
          </div>

          <p
            id="today-sales-amount"
            className="text-[26px] font-semibold text-[#202522] mt-1 tabular-nums"
          >
            {formatCurrency(todaySalesTotal)}
          </p>
        </div>
      </section>

      {/* Search and Filters */}
      {sales.length > 0 && (
        <section aria-label="Search and filter sales" className="mb-4">
          {/* Curvy Search Bar */}
          <div className="relative mb-2.5">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-[#68716C]">
              <Search size={18} strokeWidth={2} />
            </div>
            <input
              id="sales-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search product or transaction..."
              className="w-full h-11 sm:h-12 pl-11 pr-10 bg-white border border-[#E1E6E2] rounded-full text-[14.5px] text-[#202522] placeholder:text-[#68716C]/60 focus:outline-none focus:border-[#64A30E] focus:ring-1 focus:ring-[#64A30E] shadow-[0_2px_6px_rgba(32,37,34,0.02)] transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[#68716C] hover:text-[#202522] cursor-pointer"
                aria-label="Clear search"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Filter Tabs / Buttons */}
          <nav
            aria-label="Payment method filters"
            className="grid grid-cols-4 gap-1.5 sm:gap-2 w-full py-0.5 select-none"
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
                  className="relative h-9.5 sm:h-10 px-1 sm:px-2 rounded-full text-[12px] min-[390px]:text-[12.5px] sm:text-[13px] font-medium whitespace-nowrap cursor-pointer flex items-center justify-center border border-[#E1E6E2] bg-white focus:outline-none"
                >
                  {isSelected && (
                    <motion.div
                      layoutId="sales-filter-active-pill"
                      className="absolute -inset-px bg-[#64A30E] rounded-full shadow-xs"
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

      {/* Sales List */}
      <section aria-label="Sales transactions list">
        <div className="flex items-center justify-between mb-2.5 px-0.5">
          <h2
            id="recent-sales-heading"
            className="text-[17px] font-bold text-[#202522]"
          >
            All sales
          </h2>
          <span className="text-[12.5px] text-[#68716C] tabular-nums">
            {filteredSales.length} of {sales.length}
          </span>
        </div>

        {sales.length === 0 ? (
          /* Empty Sales State */
          <div
            id="empty-sales-state"
            className="py-10 sm:py-12 text-center my-2 flex flex-col items-center"
          >
            <Receipt size={36} strokeWidth={1.5} className="text-[#68716C]/60 mb-2.5" />
            <h3 className="text-[14px] font-semibold text-[#202522] mb-1.5">
              No sales yet
            </h3>
            <p className="text-[14px] leading-relaxed text-[#68716C] mb-5 max-w-[260px] mx-auto">
              Completed transactions will appear here. Click any sold item to view its receipt.
            </p>
            <button
              type="button"
              onClick={handleStartSale}
              className="h-11 px-5 bg-[#64A30E] hover:bg-[#54890B] active:bg-[#477309] text-white text-[14px] font-medium rounded-xl inline-flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
            >
              <Plus size={17} strokeWidth={2.2} />
              <span>Record first sale</span>
            </button>
          </div>
        ) : filteredSales.length === 0 ? (
          /* Filter No Match */
          <div className="py-10 sm:py-12 text-center my-2 flex flex-col items-center">
            <SearchX size={36} strokeWidth={1.5} className="text-[#68716C]/60 mb-2.5" />
            <p className="text-[14px] font-semibold text-[#202522] mb-1.5">
              No matching sales found
            </p>
            <p className="text-[14px] text-[#6E746F] mb-4">
              Try adjusting your search or payment filter.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setFilterMethod('all');
              }}
              className="h-10 px-4 bg-white border border-[#E1E6E2] text-[#202522] text-[14px] font-medium rounded-xl inline-flex items-center gap-1.5 cursor-pointer hover:bg-[#F4F6F4] transition-colors"
            >
              <span>Reset filters</span>
            </button>
          </div>
        ) : (
          /* Sales Rows */
          <div
            id="recent-sales-list-card"
            className="bg-white border border-[#E1E6E2] rounded-2xl divide-y divide-[#E1E6E2] overflow-hidden shadow-[0_2px_8px_rgba(32,37,34,0.02)]"
          >
            {filteredSales.map((sale) => (
              <div
                key={sale.id}
                id={`sale-row-${sale.id}`}
                onClick={() => setSelectedTransaction(sale)}
                className="p-3.5 sm:p-4 flex items-center justify-between cursor-pointer hover:bg-[#FAFBFB] active:bg-[#F4F6F4] transition-colors group"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    setSelectedTransaction(sale);
                  }
                }}
                aria-label={`View receipt for transaction ${sale.transactionNumber}`}
              >
                {/* Left: Product/Transaction description */}
                <div className="min-w-0 pr-3 flex-1">
                  <p className="text-[14.5px] font-semibold text-[#202522] truncate group-hover:text-[#64A30E] transition-colors">
                    {sale.primaryItemName}
                    {sale.items.length > 1 && (
                      <span className="text-[12.5px] font-normal text-[#68716C] ml-1">
                        +{sale.items.length - 1} more
                      </span>
                    )}
                  </p>
                  <p className="text-[12.5px] text-[#68716C] mt-0.5 tabular-nums">
                    {formatPHTTimestamp(getTransactionTimestamp(sale))} · {sale.itemCount} {sale.itemCount === 1 ? 'unit' : 'units'}
                  </p>
                </div>

                {/* Right: Amount and subtle chevron */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="text-right">
                    <p className="text-[15px] font-semibold text-[#202522] tabular-nums">
                      {formatCurrency(sale.total)}
                    </p>
                    <span className="inline-block text-[11px] font-medium uppercase px-1.5 py-0.2 rounded text-[#68716C] bg-[#FAFBFB] border border-[#E1E6E2]">
                      {sale.paymentMethod}
                    </span>
                  </div>
                  <ChevronRight size={16} className="text-[#68716C]/60 group-hover:text-[#64A30E] transition-colors" />
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
      />
    </motion.div>
  );
};

