import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Package,
  Receipt,
  User,
  ChevronDown,
  ChevronRight,
  Info,
  Banknote,
  Wallet,
  Eye,
  EyeOff,
  Store,
  ArrowUpRight,
  ArrowDownLeft,
  X,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { NavTab, Product, SaleTransaction, UserProfile } from '../types';
import { PWAInstallButton } from './PWAInstallButton';
import { ReceiptTicketCard } from './ReceiptTicketCard';
import { ScoopedMetricCard } from './ScoopedMetricCard';
import { SwipeDeck } from '@/components/ui/swipe-deck';
import {
  calculatePHTSalesGrowth,
  getPHTParts,
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

type TimeframeFilter = 'month' | 'today' | 'week' | 'all';

export const HomeScreen: React.FC<HomeScreenProps> = ({
  products = [],
  sales = [],
  userProfile,
  onNavigate,
  onNewSaleClick,
}) => {
  const [isPriceHidden, setIsPriceHidden] = useState<boolean>(false);
  const [activeTimeframe, setActiveTimeframe] = useState<TimeframeFilter>('today');
  const [isPeriodDropdownOpen, setIsPeriodDropdownOpen] = useState<boolean>(false);
  const [infoModalContent, setInfoModalContent] = useState<{
    title: string;
    description: string;
  } | null>(null);

  // Derive date in PHT
  const phtDate = useMemo(() => getPHTParts(new Date()), []);
  const currentMonthName = useMemo(() => {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Manila',
      month: 'long',
      year: 'numeric',
    }).format(new Date());
  }, []);

  // Products metrics
  const totalProducts = products.length;
  const lowStockCount = products.filter((p) => p.stock <= p.lowStockThreshold).length;

  // Inventory value (Expenses / Asset worth)
  const totalInventoryValue = useMemo(() => {
    return products.reduce((acc, p) => acc + (p.price || 0) * (p.stock || 0), 0);
  }, [products]);

  // Sales metrics
  const totalSalesRevenue = useMemo(() => {
    return sales.reduce((acc, s) => acc + (s.total || 0), 0);
  }, [sales]);

  // Sales in current month (PHT)
  const currentMonthSales = useMemo(() => {
    const currentYearMonth = `${phtDate.year}-${String(phtDate.month).padStart(2, '0')}`;
    return sales
      .filter((s) => {
        const parts = getPHTParts(s.createdAt || s.timestamp || Date.now());
        return parts.dateKey.startsWith(currentYearMonth);
      })
      .reduce((acc, s) => acc + (s.total || 0), 0);
  }, [sales, phtDate]);

  // Growth calculation in PHT
  const growthMetrics = useMemo(() => calculatePHTSalesGrowth(sales), [sales]);
  const todaySalesTotal = growthMetrics?.todayTotal ?? 0;

  // Selected period displayed values
  const displayedSalesTotal = useMemo(() => {
    switch (activeTimeframe) {
      case 'today':
        return todaySalesTotal;
      case 'week':
        return growthMetrics?.thisWeekTotal ?? 0;
      case 'all':
        return totalSalesRevenue;
      case 'month':
      default:
        return currentMonthSales > 0 ? currentMonthSales : totalSalesRevenue;
    }
  }, [activeTimeframe, todaySalesTotal, growthMetrics, totalSalesRevenue, currentMonthSales]);

  // Current Balance reflects sales revenue generated within the app
  const currentBalance = displayedSalesTotal;

  const formatCurrency = (val?: number | null) => {
    const num = typeof val === 'number' && !isNaN(val) ? val : 0;
    const symbol = userProfile?.currency?.includes('$') ? '$' : '₱';
    return `${symbol}${num.toLocaleString('en-PH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const getPeriodLabel = () => {
    switch (activeTimeframe) {
      case 'today':
        return 'Today';
      case 'week':
        return 'This Week';
      case 'all':
        return 'All Time';
      case 'month':
      default:
        return 'This month';
    }
  };

  // Derive relative comparison diff and label based on activeTimeframe
  const comparisonData = useMemo(() => {
    switch (activeTimeframe) {
      case 'today': {
        const diff = growthMetrics?.dayGrowthDiff ?? 0;
        return {
          diff,
          suffix: 'than last day',
          isAllTime: false,
        };
      }
      case 'week': {
        const diff = growthMetrics?.growthDiff ?? 0;
        return {
          diff,
          suffix: 'than last week',
          isAllTime: false,
        };
      }
      case 'month': {
        const diff = growthMetrics?.monthGrowthDiff ?? 0;
        return {
          diff,
          suffix: 'than last month',
          isAllTime: false,
        };
      }
      case 'all':
      default:
        return {
          diff: 0,
          suffix: '',
          isAllTime: true,
        };
    }
  }, [activeTimeframe, growthMetrics]);

  return (
    <motion.div
      id="home-screen-view"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="w-full max-w-[430px] mx-auto min-h-screen flex flex-col bg-[#F9FAF8]"
      style={{
        paddingBottom: 'calc(5.75rem + env(safe-area-inset-bottom, 8px))',
      }}
    >
      {/* ============================================================ */}
      {/* TOP HERO CONTAINER (PRIMARY GREEN THEME GRADIENT)             */}
      {/* ============================================================ */}
      <div
        id="home-hero-header"
        className="w-full relative text-white select-none overflow-hidden pb-10 sm:pb-12"
        style={{
          background:
            'radial-gradient(circle at 50% -10%, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 70%), linear-gradient(180deg, #64A30E 0%, #538C0B 52%, #457508 100%)',
          paddingTop: 'calc(var(--safe-area-top, env(safe-area-inset-top, 0px)) + 14px)',
        }}
      >
        {/* Soft atmospheric background glow discs */}
        <div className="absolute -top-16 -left-16 w-56 h-56 rounded-full bg-white/10 blur-2xl pointer-events-none" />
        <div className="absolute top-1/3 -right-20 w-64 h-64 rounded-full bg-emerald-400/10 blur-3xl pointer-events-none" />

        {/* Top App Bar: Profile Avatar (Left), Period Pill (Center), Privacy Toggle (Right) */}
        <div className="px-5 pt-3 pb-2 flex items-center justify-between relative z-20">
          {/* Profile Avatar with Mini Shop Badge */}
          <button
            type="button"
            id="home-avatar-profile-button"
            onClick={() => onNavigate && onNavigate('profile')}
            className="relative flex items-center justify-center cursor-pointer group focus:outline-none"
            aria-label="View Profile"
          >
            <div className="w-11 h-11 rounded-full bg-white/20 border-2 border-white/50 backdrop-blur-md flex items-center justify-center text-white shadow-sm overflow-hidden group-hover:scale-105 transition-transform">
              <div className="w-full h-full bg-[#E5F4CF] flex items-center justify-center text-[#457508] font-bold text-[15px]">
                {userProfile?.ownerName ? userProfile.ownerName.charAt(0).toUpperCase() : 'S'}
              </div>
            </div>
            {/* Small corner badge icon */}
            <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[#64A30E] border-2 border-white flex items-center justify-center text-white shadow-xs">
              <Store size={10} strokeWidth={2.4} />
            </div>
          </button>

          {/* Timeframe / Period Pill Selector */}
          <div className="relative">
            <button
              type="button"
              id="home-period-dropdown-button"
              onClick={() => setIsPeriodDropdownOpen((prev) => !prev)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/20 hover:bg-white/25 active:bg-white/30 text-white text-[13px] font-medium backdrop-blur-md transition-all cursor-pointer shadow-xs border border-white/15"
            >
              <span>{getPeriodLabel()}</span>
              <ChevronDown
                size={14}
                strokeWidth={2.2}
                className={`transition-transform duration-200 ${
                  isPeriodDropdownOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {/* Dropdown Menu */}
            <AnimatePresence>
              {isPeriodDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setIsPeriodDropdownOpen(false)}
                  />
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -4 }}
                    transition={{ duration: 0.15 }}
                    className="absolute top-full mt-1.5 left-1/2 -translate-x-1/2 z-40 w-36 bg-white rounded-2xl p-1.5 shadow-xl border border-[#E1E6E2] text-[#202522]"
                  >
                    {(
                      [
                        { id: 'month', label: 'This month' },
                        { id: 'today', label: 'Today' },
                        { id: 'week', label: 'This Week' },
                        { id: 'all', label: 'All Time' },
                      ] as const
                    ).map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => {
                          setActiveTimeframe(option.id);
                          setIsPeriodDropdownOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-[12.5px] rounded-xl font-medium transition-colors ${
                          activeTimeframe === option.id
                            ? 'bg-[#F0F7E6] text-[#457508] font-semibold'
                            : 'text-[#202522] hover:bg-gray-100'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          {/* Privacy Visibility Toggle (Balanced right side without notification icon) */}
          <button
            type="button"
            id="home-balance-visibility-toggle"
            onClick={() => setIsPriceHidden((prev) => !prev)}
            className="w-10 h-10 rounded-full bg-white/15 hover:bg-white/20 active:bg-white/25 backdrop-blur-md flex items-center justify-center text-white transition-all cursor-pointer border border-white/10"
            aria-label={isPriceHidden ? 'Show balance' : 'Hide balance'}
          >
            {isPriceHidden ? (
              <EyeOff size={18} strokeWidth={2} />
            ) : (
              <Eye size={18} strokeWidth={2} />
            )}
          </button>
        </div>

        {/* Hero Balance Section */}
        <div className="px-5 pt-5 pb-3 flex flex-col items-center text-center relative z-10">
          <span className="text-[13.5px] font-medium text-white/85 tracking-wide">
            Current sales
          </span>

          {/* Large Main Balance Figure */}
          <div className="mt-1 flex items-baseline justify-center">
            {isPriceHidden ? (
              <span className="text-[34px] sm:text-[38px] font-bold tracking-widest text-white/90">
                ••••••••
              </span>
            ) : (
              <h1 className="text-[34px] sm:text-[40px] font-bold text-white tracking-[-0.03em] tabular-nums leading-tight">
                {formatCurrency(currentBalance)}
              </h1>
            )}
          </div>

          {/* Comparison / Growth Pill */}
          {comparisonData.isAllTime ? (
            <div className="mt-2.5 inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-white/15 border border-white/15 backdrop-blur-md text-[12px] font-medium text-white/95">
              <Receipt size={13} strokeWidth={2.2} className="text-[#E7F8C4]" />
              <span>
                {sales.length} total {sales.length === 1 ? 'sale' : 'sales'} recorded
              </span>
            </div>
          ) : (
            <div className="mt-2.5 inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-white/15 border border-white/15 backdrop-blur-md text-[12px] font-medium text-white/95">
              {comparisonData.diff >= 0 ? (
                <TrendingUp size={13} strokeWidth={2.4} className="text-[#E7F8C4]" />
              ) : (
                <TrendingDown size={13} strokeWidth={2.4} className="text-[#FFA4A4]" />
              )}
              <span>
                {comparisonData.diff >= 0 ? '+' : '-'}
                {formatCurrency(Math.abs(comparisonData.diff))} {comparisonData.suffix}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ============================================================ */}
      {/* CURVED WHITE CONTENT SHEET (CARDS & OVERVIEW)                 */}
      {/* ============================================================ */}
      <div className="flex-1 bg-[#F9FAF8] rounded-t-[30px] sm:rounded-t-[34px] -mt-6 relative z-20 pt-6 px-5 shadow-[0_-4px_20px_rgba(0,0,0,0.04)]">
        {/* Section Header: Store Overview & Details > */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-1.5">
            <h2 className="text-[17px] font-bold text-[#202522]">
              Store Overview
            </h2>
            <button
              type="button"
              onClick={() =>
                setInfoModalContent({
                  title: 'Store Overview',
                  description:
                    'Store Overview summarizes your active sales revenue alongside your current inventory stock valuation.',
                })
              }
              className="text-[#68716C] hover:text-[#202522] transition-colors p-0.5"
              aria-label="Info about Store Overview"
            >
              <Info size={15} strokeWidth={2} />
            </button>
          </div>

          <button
            type="button"
            id="home-details-button"
            onClick={() => onNavigate && onNavigate('statistics')}
            className="flex items-center gap-0.5 text-[13px] font-semibold text-[#68716C] hover:text-[#202522] transition-colors cursor-pointer"
          >
            <span>Details</span>
            <ChevronRight size={15} strokeWidth={2.2} />
          </button>
        </div>

        {/* Two Metric Cards: Total Sales (Income) and Stock Value */}
        <div className="grid grid-cols-2 gap-3 sm:gap-3.5 mb-5 w-full">
          {/* Card 1: Total Sales */}
          <ScoopedMetricCard
            id="home-income-card"
            value={isPriceHidden ? '••••••' : formatCurrency(displayedSalesTotal)}
            titleLine1="Total"
            titleLine2="Sales"
            subtitle={
              sales.length > 0
                ? `${sales.length} ${sales.length === 1 ? 'sale' : 'sales'} recorded`
                : "Good start, don't stop"
            }
            badgeIcon={<Banknote size={22} strokeWidth={2.2} />}
            badgeVariant="blue"
            onClick={() => onNavigate && onNavigate('sales')}
            onInfoClick={() =>
              setInfoModalContent({
                title: 'Total sales',
                description:
                  'Gross income collected from all completed checkout transactions in your store.',
              })
            }
          />

          {/* Card 2: Stock Value (Sales / Inventory Value) */}
          <ScoopedMetricCard
            id="home-expenses-card"
            value={isPriceHidden ? '••••••' : formatCurrency(totalInventoryValue)}
            titleLine1="Stock"
            titleLine2="Value"
            subtitle={
              totalProducts > 0
                ? `${totalProducts} ${totalProducts === 1 ? 'item' : 'items'} in stock`
                : "Good start, don't stop"
            }
            badgeIcon={<Wallet size={22} strokeWidth={2.2} />}
            badgeVariant="amber"
            onClick={() => onNavigate && onNavigate('store')}
            onInfoClick={() =>
              setInfoModalContent({
                title: 'Stock value',
                description:
                  'The total retail value of all available products and items currently in your stock inventory.',
              })
            }
          />
        </div>

        {/* Store Inventory Quick Status */}
        <div
          id="inventory-summary-card"
          onClick={() => onNavigate && onNavigate('store')}
          className="w-full bg-white border border-[#E1E6E2] rounded-2xl p-4 shadow-[0_2px_8px_rgba(32,37,34,0.02)] flex items-center justify-between cursor-pointer active:bg-gray-50 transition-colors mb-5"
        >
          <div>
            <div className="text-[12.5px] font-medium text-[#68716C] flex items-center gap-1.5">
              <Package size={14} className="text-[#64A30E]" />
              <span>Inventory Products</span>
            </div>
            <div className="text-[17px] font-bold text-[#202522] mt-1 tabular-nums">
              {totalProducts} {totalProducts === 1 ? 'product' : 'products'} registered
            </div>
          </div>

          <div className="flex items-center gap-1.5 bg-[#F1F3F0] border border-[#E1E6E2] px-2.5 py-1.5 rounded-xl">
            <span
              className={`w-2 h-2 rounded-full ${
                lowStockCount > 0 ? 'bg-[#B58A52]' : 'bg-[#64A30E]'
              }`}
            />
            <span className="text-[12px] font-semibold text-[#202522] tabular-nums">
              {lowStockCount} low stock
            </span>
          </div>
        </div>

        {/* In-app PWA install prompt banner */}
        <div className="-mx-1 mb-5">
          <PWAInstallButton variant="banner" />
        </div>

        {/* Transaction Section */}
        <section aria-label="Transaction" className="mb-4">
          <div className="flex items-center justify-between mb-3.5 px-0.5">
            <h2 className="text-[17px] font-bold text-[#202522]">
              Transaction
            </h2>

            <button
              type="button"
              onClick={() => onNavigate && onNavigate('sales')}
              className="text-[13px] font-semibold text-[#68716C] hover:text-[#202522] transition-colors cursor-pointer"
            >
              View all
            </button>
          </div>

          {sales.length === 0 ? (
            <div className="py-8 text-center flex flex-col items-center my-1">
              <Receipt size={32} strokeWidth={1.5} className="text-[#68716C]/60 mb-2.5" />
              <p className="text-[14px] font-semibold text-[#202522] mb-1">
                No transactions yet
              </p>
              <p className="text-[13px] text-[#68716C] mb-4 max-w-xs mx-auto">
                Complete your first checkout to generate and browse receipts here.
              </p>
              <button
                type="button"
                onClick={onNewSaleClick}
                className="inline-flex items-center justify-center px-4 py-2.5 bg-[#64A30E] text-white text-[14px] font-semibold rounded-xl hover:bg-[#54890B] active:bg-[#477309] active:scale-98 transition-all cursor-pointer shadow-sm"
              >
                Record your first sale
              </button>
            </div>
          ) : (
            <div className="w-full pt-[50px] pb-1">
              <SwipeDeck
                items={sales}
                itemKey={(sale) => sale.id || sale.transactionNumber}
                itemLabel={(sale) => `Receipt ${sale.transactionNumber || sale.id}`}
                label="Transaction receipts deck"
                emptyLabel="All transactions reviewed"
                height="auto"
                peek={3}
                threshold={88}
                stackPosition="top"
                transformOrigin="bottom center"
                cardClassName="absolute inset-x-2 top-0 select-none overflow-visible cursor-grab active:cursor-grabbing"
                showBadges={false}
                hideControls={true}
              >
                {(sale, { active }) => (
                  <div className="w-full select-none">
                    <ReceiptTicketCard
                      transaction={sale}
                      storeName={userProfile?.storeName || sale.storeName}
                      hideThankYou
                      hideBrokenLine={!active}
                      isPeekingShadow={!active}
                      maxItems={2}
                    />
                  </div>
                )}
              </SwipeDeck>
            </div>
          )}
        </section>
      </div>

      {/* ============================================================ */}
      {/* INFO MODAL POPUP                                             */}
      {/* ============================================================ */}
      <AnimatePresence>
        {infoModalContent && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-black/40 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.94 }}
              className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl border border-[#E1E6E2]"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-[#F0F7E6] text-[#457508] flex items-center justify-center">
                    <Info size={16} strokeWidth={2.2} />
                  </div>
                  <h3 className="text-[17px] font-bold text-[#202522]">
                    {infoModalContent.title}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setInfoModalContent(null)}
                  className="p-1 rounded-full text-[#68716C] hover:bg-gray-100 transition-colors"
                >
                  <X size={18} strokeWidth={2} />
                </button>
              </div>

              <p className="text-[14px] text-[#68716C] leading-relaxed">
                {infoModalContent.description}
              </p>

              <button
                type="button"
                onClick={() => setInfoModalContent(null)}
                className="w-full mt-5 py-2.5 bg-[#64A30E] text-white text-[14px] font-semibold rounded-xl hover:bg-[#54890B] active:scale-98 transition-all"
              >
                Got it
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
