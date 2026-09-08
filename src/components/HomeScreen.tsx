import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Package } from 'lucide-react';
import { NavTab, Product, SaleTransaction, UserProfile } from '../types';
import { SalesTrendChart } from './SalesTrendChart';
import { PWAInstallButton } from './PWAInstallButton';
import { ReceiptTicketCard } from './ReceiptTicketCard';
import { SwipeDeck } from '@/components/ui/swipe-deck';
import {
  calculatePHTSalesGrowth,
  getTransactionTimestamp,
} from '../utils/philippineDate';

interface HomeScreenProps {
  products?: Product[];
  sales?: SaleTransaction[];
  userProfile?: UserProfile;
  homeClickTrigger?: number;
  onNavigate?: (tab: NavTab) => void;
  onAddProductClick?: () => void;
  onNewSaleClick?: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  products = [],
  sales = [],
  userProfile,
  homeClickTrigger = 0,
  onNavigate,
  onNewSaleClick,
}) => {
  const [isPriceHidden, setIsPriceHidden] = useState<boolean>(false);

  // Directly derive state from live products & sales state
  const totalProducts = products.length;
  const lowStockCount = products.filter((p) => p.stock <= p.lowStockThreshold).length;

  // Calculate genuine sales metrics in Philippine Time (PHT, UTC+8)
  const growthMetrics = calculatePHTSalesGrowth(sales);
  const todaySalesTotal = growthMetrics.todayTotal;

  return (
    <motion.div
      id="home-screen-view"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="w-full max-w-[430px] mx-auto px-5 pt-3 sm:pt-4"
      style={{
        paddingBottom: 'calc(10rem + env(safe-area-inset-bottom, 0px))',
      }}
    >
      {/* In-app PWA install prompt banner for offline installation */}
      <div className="-mx-4">
        <PWAInstallButton variant="banner" />
      </div>

      {/* Primary Sales & Store Overview */}
      <section aria-label="Sales and Inventory Summary" className="mt-4 mb-6 space-y-3">
        {/* Borderless Minimal Sales Trend Visualization */}
        <SalesTrendChart
          sales={sales}
          todayTotal={todaySalesTotal}
          triggerKey={homeClickTrigger}
          isPriceHidden={isPriceHidden}
          onTogglePriceHidden={() => setIsPriceHidden((prev) => !prev)}
        />

        {/* Store Inventory Card */}
        <div
          id="inventory-summary-card"
          onClick={() => onNavigate && onNavigate('store')}
          className="w-full bg-white border border-[#DEE3DE] rounded-2xl p-4 shadow-[0_2px_8px_rgba(37,40,37,0.02)] flex items-center justify-between cursor-pointer active:bg-gray-50 transition-colors"
        >
          <div>
            <div className="text-[12.5px] font-medium text-[#6E746F] flex items-center gap-1.5">
              <Package size={14} className="text-[#4F8065]" />
              <span>Inventory</span>
            </div>
            <div className="text-[18px] font-bold text-[#252825] mt-1 tabular-nums">
              {totalProducts} {totalProducts === 1 ? 'product' : 'products'}
            </div>
          </div>

          <div className="flex items-center gap-1.5 bg-[#FAF9F6] border border-[#DEE3DE] px-2.5 py-1.5 rounded-xl">
            <span
              className={`w-2 h-2 rounded-full ${
                lowStockCount > 0 ? 'bg-[#9F3F46]' : 'bg-[#4F8065]'
              }`}
            />
            <span className="text-[12px] font-medium text-[#252825] tabular-nums">
              {lowStockCount} low
            </span>
          </div>
        </div>
      </section>

      {/* Transaction Section */}
      <section aria-label="Transaction" className="mb-6 pt-1">
        {/* Header row: Transaction, Receipt Counter, Navigation & View all */}
        <div className="flex items-center justify-between mb-3.5 px-0.5">
          <div className="flex items-center gap-2">
            <h2 className="text-[17px] font-bold text-[#252825]">
              Transaction
            </h2>
            {sales.length > 0 && (
              <span className="text-[11.5px] font-medium text-[#6E746F] bg-[#FAF9F6] border border-[#DEE3DE] px-2 py-0.5 rounded-full tabular-nums">
                {sales.length} {sales.length === 1 ? 'sale' : 'sales'}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onNavigate && onNavigate('sales')}
              className="text-[13px] font-medium text-[#4F8065] hover:text-[#3D684F] hover:underline transition-colors cursor-pointer"
            >
              View all
            </button>
          </div>
        </div>

        {sales.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-[14px] font-semibold text-[#252825] mb-1.5">
              No transactions yet
            </p>
            <p className="text-[14px] text-[#6E746F] mb-4 max-w-xs mx-auto">
              Complete your first checkout to generate and browse receipts here.
            </p>
            <button
              type="button"
              onClick={onNewSaleClick}
              className="inline-flex items-center justify-center px-4 py-2.5 bg-[#4F8065] text-white text-[14px] font-medium rounded-xl hover:bg-[#3D684F] active:scale-98 transition-all cursor-pointer shadow-sm"
            >
              Record your first sale
            </button>
          </div>
        ) : (
          <div className="w-full">
            <SwipeDeck
              items={sales}
              itemKey={(sale) => sale.id || sale.transactionNumber}
              itemLabel={(sale) => `Receipt ${sale.transactionNumber || sale.id}`}
              label="Transaction receipts deck"
              emptyLabel="All transactions reviewed"
              height={300}
              peek={2}
              threshold={88}
              transformOrigin="top center"
              cardClassName="absolute inset-x-2 top-0 select-none overflow-visible cursor-grab active:cursor-grabbing"
              showBadges={false}
              hideControls={true}
            >
              {(sale) => (
                <div className="w-full select-none">
                  <ReceiptTicketCard
                    transaction={sale}
                    hideThankYou
                    maxItems={2}
                  />
                </div>
              )}
            </SwipeDeck>
          </div>
        )}
      </section>
    </motion.div>
  );
};
