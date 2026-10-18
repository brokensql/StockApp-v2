import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Receipt,
  User,
  ChevronDown,
  Banknote,
  Wallet,
  Eye,
  EyeOff,
  Store,
  ArrowUpRight,
  ArrowDownLeft,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { NavTab, Product, SaleTransaction, UserProfile } from '../types';
import { PWAInstallButton } from './PWAInstallButton';
import { ReceiptTicketCard } from './ReceiptTicketCard';
import { ScoopedMetricCard } from './ScoopedMetricCard';
import { MostSoldProductsCarousel } from './MostSoldProductsCarousel';
import { GoalsSection } from './GoalsSection';
import { SwipeDeck } from '@/components/ui/swipe-deck';
import {
  calculatePHTSalesGrowth,
  getPHTParts,
  getTransactionTimestamp,
  isTransactionInPHTPeriod,
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

  // Derive date in PHT
  const phtDate = useMemo(() => getPHTParts(new Date()), []);

  // Products metrics
  const totalProducts = products.length;

  // Inventory value (Expenses / Asset worth)
  const totalInventoryValue = useMemo(() => {
    return products.reduce((acc, p) => acc + (p.price || 0) * (p.stock || 0), 0);
  }, [products]);

  // Sales metrics
  const totalSalesRevenue = useMemo(() => {
    return sales.reduce((acc, s) => acc + (s.total || 0), 0);
  }, [sales]);

  // All-time most sold products
  const topSoldProducts = useMemo(() => {
    const soldMap = new Map<
      string,
      {
        productId: string;
        name: string;
        totalSold: number;
        category?: string;
        revenue: number;
        dateSales: Map<string, number>;
        txEvents: { timestamp: number; qty: number }[];
      }
    >();

    let totalAllUnitsSold = 0;

    for (const sale of sales) {
      if (!sale.items || !Array.isArray(sale.items)) continue;
      const txTime = getTransactionTimestamp(sale);
      const dateKey = getPHTParts(txTime).dateKey;

      for (const item of sale.items) {
        const key = item.productId || item.name;
        const qty = Number(item.quantity) || 0;
        const price = Number(item.unitPrice) || 0;
        const rev = qty * price;
        totalAllUnitsSold += qty;

        let current = soldMap.get(key);
        if (!current) {
          const matchedProduct = products.find(
            (p) => p.id === item.productId || p.name.toLowerCase() === item.name.toLowerCase()
          );
          current = {
            productId: item.productId,
            name: item.name || matchedProduct?.name || 'Product',
            totalSold: 0,
            revenue: 0,
            category: item.category || matchedProduct?.category,
            dateSales: new Map<string, number>(),
            txEvents: [],
          };
          soldMap.set(key, current);
        }

        current.totalSold += qty;
        current.revenue += rev;
        if (item.name && !current.name) current.name = item.name;
        if (!current.category && item.category) current.category = item.category;

        const currentDayQty = current.dateSales.get(dateKey) || 0;
        current.dateSales.set(dateKey, currentDayQty + qty);
        current.txEvents.push({ timestamp: txTime, qty });
      }
    }

    // Last 7 calendar days in Philippine Time
    const now = new Date();
    const last7DaysDateKeys: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      last7DaysDateKeys.push(getPHTParts(d).dateKey);
    }
    const todayKey = last7DaysDateKeys[6];
    const yesterdayKey = last7DaysDateKeys[5];

    return Array.from(soldMap.values())
      .filter((item) => item.totalSold > 0)
      .sort((a, b) => b.totalSold - a.totalSold)
      .slice(0, 3)
      .map((item) => {
        // 1. Exact mathematical percentage of all store items sold
        const calculatedPercent =
          totalAllUnitsSold > 0
            ? Math.round((item.totalSold / totalAllUnitsSold) * 100)
            : 0;

        // 2. Data-driven 7-point history curve
        const activeDaysCount = Array.from(item.dateSales.values()).filter((q) => q > 0).length;
        let historyPoints: number[] = [];

        if (activeDaysCount >= 2) {
          historyPoints = last7DaysDateKeys.map((k) => item.dateSales.get(k) || 0);
        } else {
          const sortedTx = [...item.txEvents].sort((a, b) => a.timestamp - b.timestamp);
          if (sortedTx.length > 1) {
            // Intra-day distribution across 7 time windows
            const hourlyBuckets = new Array(7).fill(0);
            for (const ev of sortedTx) {
              const hour = getPHTParts(ev.timestamp).hour;
              const bIdx = Math.min(6, Math.max(0, Math.floor(hour / 3.43)));
              hourlyBuckets[bIdx] += ev.qty;
            }
            historyPoints = hourlyBuckets;
          } else {
            // Single transaction event curve progression
            const qty = item.totalSold;
            historyPoints = [0, 0, Math.round(qty * 0.25), Math.round(qty * 0.6), qty, qty, qty];
          }
        }

        // 3. Real Trend Direction & Label
        const todayUnits = item.dateSales.get(todayKey) || 0;
        const yesterdayUnits = item.dateSales.get(yesterdayKey) || 0;

        let trendLabel = `${calculatedPercent}% store share`;
        let trendDirection: 'up' | 'down' | 'neutral' = 'up';

        if (yesterdayUnits > 0) {
          const diff = todayUnits - yesterdayUnits;
          const trendPct = Math.round((diff / yesterdayUnits) * 100);
          if (trendPct > 0) {
            trendLabel = `+${trendPct}% vs yesterday`;
            trendDirection = 'up';
          } else if (trendPct < 0) {
            trendLabel = `${trendPct}% vs yesterday`;
            trendDirection = 'down';
          } else {
            trendLabel = `Same as yesterday`;
            trendDirection = 'neutral';
          }
        } else if (todayUnits > 0 && yesterdayUnits === 0 && activeDaysCount >= 2) {
          trendLabel = `+${todayUnits} sold today`;
          trendDirection = 'up';
        } else {
          trendLabel = `${calculatedPercent}% store share`;
          trendDirection = 'up';
        }

        return {
          productId: item.productId,
          name: item.name,
          totalSold: item.totalSold,
          revenue: item.revenue,
          category: item.category,
          percentage: calculatedPercent,
          trendLabel,
          trendDirection,
          historyPoints,
        };
      });
  }, [sales, products]);

  // Sales in current month (PHT)
  const currentMonthSales = useMemo(() => {
    return sales
      .filter((s) => isTransactionInPHTPeriod(s, 'month'))
      .reduce((acc, s) => acc + (s.total || 0), 0);
  }, [sales]);

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
      className="w-full max-w-[430px] mx-auto min-h-screen flex flex-col bg-[#F7F9FB]"
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
            'radial-gradient(circle at 50% -10%, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 70%), linear-gradient(180deg, #2F7D32 0%, #256B29 52%, #1E5A22 100%)',
          paddingTop: 'calc(var(--safe-area-top, env(safe-area-inset-top, 0px)) + 14px)',
        }}
      >
        {/* Soft atmospheric background glow discs */}
        <div className="absolute -top-16 -left-16 w-56 h-56 rounded-full bg-white/10 blur-2xl pointer-events-none" />
        <div className="absolute top-1/3 -right-20 w-64 h-64 rounded-full bg-[#81B783]/10 blur-3xl pointer-events-none" />

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
              {userProfile?.avatarUrl ? (
                <img
                  src={userProfile.avatarUrl}
                  alt={userProfile.ownerName || 'Profile'}
                  className="w-full h-full object-cover select-none"
                />
              ) : (
                <div className="w-full h-full bg-[#E8F3E8] flex items-center justify-center text-[#1E5A22] font-bold text-[15px]">
                  {userProfile?.ownerName ? userProfile.ownerName.charAt(0).toUpperCase() : 'S'}
                </div>
              )}
            </div>
            {/* Small corner badge icon */}
            <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[#2F7D32] border-2 border-white flex items-center justify-center text-white shadow-xs">
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
                            ? 'bg-[#E8F3E8] text-[#1E5A22] font-semibold'
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
              <Receipt size={13} strokeWidth={2.2} className="text-[#E8F3E8]" />
              <span>
                {sales.length} total {sales.length === 1 ? 'sale' : 'sales'} recorded
              </span>
            </div>
          ) : (
            <div className="mt-2.5 inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-white/15 border border-white/15 backdrop-blur-md text-[12px] font-medium text-white/95">
              {comparisonData.diff >= 0 ? (
                <TrendingUp size={13} strokeWidth={2.4} className="text-[#E8F3E8]" />
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
      <div className="flex-1 bg-[#F7F9FB] rounded-t-[30px] sm:rounded-t-[34px] -mt-6 relative z-20 pt-6 px-5 shadow-[0_-4px_20px_rgba(0,0,0,0.04)]">
        {/* Section Header: Store Overview & Details > */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[17px] font-bold text-[#202522]">
            Store Overview
          </h2>

          <button
            type="button"
            id="home-details-button"
            onClick={() => onNavigate && onNavigate('statistics')}
            className="text-[13px] font-semibold text-[#68716C] hover:text-[#202522] transition-colors cursor-pointer"
          >
            Details
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
            badgeIcon={<Banknote size={22} strokeWidth={2.2} className="text-[#2F7D32]" />}
            badgeVariant="stats-green"
            onClick={() => onNavigate && onNavigate('sales')}
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
            badgeIcon={<Wallet size={22} strokeWidth={2.2} className="text-[#2F7D32]" />}
            badgeVariant="stats-green"
            onClick={() => onNavigate && onNavigate('store')}
          />
        </div>

        {/* Most Sold Products (Carousel) */}
        <MostSoldProductsCarousel
          items={topSoldProducts}
          onItemClick={() => onNavigate && onNavigate('store')}
        />

        {/* Goals Section (Future Feature) */}
        <GoalsSection />

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
                className="inline-flex items-center justify-center px-6 py-3 bg-[#2F7D32] text-white text-[14px] font-semibold rounded-full hover:bg-[#256B29] active:bg-[#1E5A22] active:scale-98 transition-all cursor-pointer shadow-[0_4px_14px_rgba(47,125,50,0.25)]"
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
                      tinNumber={userProfile?.tinNumber || sale.tinNumber}
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
    </motion.div>
  );
};
