import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ShieldCheck,
  AlertTriangle,
  AlertOctagon,
  RefreshCw,
  HardDrive,
  Database,
  Layers,
  FileText,
  Image as ImageIcon,
  UserCheck,
  Download,
  Wrench,
  X,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  checkStorageHealth,
  recoverCorruptedDatabase,
  StorageHealthReport,
  CorruptionRecoveryResult,
} from '../db/indexedDbRepository';
import { saveBackupFile } from '../utils/backup';

interface StorageHealthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDataRepaired?: () => void;
}

export const StorageHealthModal: React.FC<StorageHealthModalProps> = ({
  isOpen,
  onClose,
  onDataRepaired,
}) => {
  const [report, setReport] = useState<StorageHealthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRepairing, setIsRepairing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [repairResult, setRepairResult] = useState<CorruptionRecoveryResult | null>(null);

  const runHealthCheck = async () => {
    try {
      setLoading(true);
      const res = await checkStorageHealth();
      setReport(res);
    } catch (e) {
      console.error('Health check failed:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setRepairResult(null);
      runHealthCheck();
    }
  }, [isOpen]);

  const handleExportBackup = async () => {
    try {
      setIsExporting(true);
      const savedPath = await saveBackupFile();
      toast.success(`Backup saved: ${savedPath}`);
    } catch (err) {
      toast.error('Failed to export backup.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleRunRecovery = async () => {
    try {
      setIsRepairing(true);
      const result = await recoverCorruptedDatabase();
      setRepairResult(result);
      if (result.success) {
        toast.success(
          `Database recovered: ${result.salvagedProducts} products, ${result.salvagedSales} sales salvaged.`
        );
        if (onDataRepaired) onDataRepaired();
        await runHealthCheck();
      } else {
        toast.error('Recovery failed to resolve all issues.');
      }
    } catch (err) {
      toast.error('Recovery error: please export backup first.');
    } finally {
      setIsRepairing(false);
    }
  };

  if (!isOpen) return null;

  const getStatusBadge = () => {
    if (!report) return null;
    switch (report.status) {
      case 'healthy':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-100 text-zinc-800 border border-zinc-200 text-[12px] font-semibold">
            <ShieldCheck size={14} />
            <span>Optimal Health (ACID Protected)</span>
          </span>
        );
      case 'warning':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FFF9C4] text-[#F57F17] border border-[#FFF176] text-[12px] font-semibold">
            <AlertTriangle size={14} />
            <span>Warning Detected</span>
          </span>
        );
      case 'degraded':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FFE0B2] text-[#E65100] border border-[#FFB74D] text-[12px] font-semibold">
            <AlertTriangle size={14} />
            <span>Storage Degraded</span>
          </span>
        );
      case 'critical':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FFEBEE] text-[#C62828] border border-[#EF9A9A] text-[12px] font-semibold">
            <AlertOctagon size={14} />
            <span>Critical Storage State</span>
          </span>
        );
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/50 backdrop-blur-xs"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-lg bg-white rounded-2xl shadow-xl border border-[#E1E6E2] overflow-hidden z-10 max-h-[90vh] flex flex-col"
        >
          {/* Header */}
          <div className="px-5 py-4 border-b border-[#EAEFEA] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-zinc-100 border border-zinc-200 flex items-center justify-center text-zinc-800">
                <HardDrive size={18} />
              </div>
              <div>
                <h3 className="text-[16px] font-semibold text-[#202522]">Storage Health & Quota</h3>
                <p className="text-[11px] text-[#68716C]">IndexedDB Durable Repository Diagnostic</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-[#8B938D] hover:text-[#202522] p-1.5 rounded-lg hover:bg-[#F2F4F2] transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Content */}
          <div className="p-5 overflow-y-auto space-y-4">
            {loading ? (
              <div className="py-12 flex flex-col items-center justify-center text-[#68716C] gap-3">
                <Loader2 size={28} className="animate-spin text-zinc-800" />
                <p className="text-[13px] font-medium">Scanning IndexedDB stores and quota...</p>
              </div>
            ) : report ? (
              <>
                {/* Status Card */}
                <div className="p-4 bg-[#FAFBFB] rounded-xl border border-[#E1E6E2] flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[12px] text-[#68716C]">Repository Status</p>
                    <div className="mt-1.5">{getStatusBadge()}</div>
                  </div>
                  <button
                    type="button"
                    onClick={runHealthCheck}
                    disabled={loading}
                    className="p-2 text-[#556057] hover:text-[#202522] hover:bg-white rounded-lg border border-[#E1E6E2] transition-colors cursor-pointer"
                    title="Refresh diagnostics"
                  >
                    <RefreshCw size={15} />
                  </button>
                </div>

                {/* Quota Usage Bar */}
                <div className="p-4 bg-white rounded-xl border border-[#E1E6E2] space-y-2">
                  <div className="flex justify-between items-center text-[13px]">
                    <span className="font-medium text-[#202522]">Device Storage Quota</span>
                    <span className="text-[#68716C] text-[12px]">
                      {report.quota.formattedUsage} used ({report.quota.percentUsed}%)
                    </span>
                  </div>
                  <div className="w-full bg-[#EAEFEA] h-2.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 rounded-full ${
                        report.quota.percentUsed > 90
                          ? 'bg-[#D94841]'
                          : report.quota.percentUsed > 75
                          ? 'bg-[#E65100]'
                          : 'bg-zinc-800'
                      }`}
                      style={{ width: `${Math.max(4, Math.min(100, report.quota.percentUsed))}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-[#8B938D]">
                    <span>IndexedDB durable store: {report.database.name} (v{report.database.version})</span>
                    <span>Total Quota: {report.quota.formattedQuota}</span>
                  </div>
                </div>

                {/* Object Stores Breakdown Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  <div className="p-3 bg-[#FAFBFB] border border-[#E1E6E2] rounded-xl">
                    <div className="flex items-center gap-1.5 text-[#68716C] text-[11px] mb-1">
                      <Layers size={13} className="text-zinc-600" />
                      <span>Products</span>
                    </div>
                    <p className="text-[18px] font-bold text-[#202522]">
                      {report.stores.productsCount}
                    </p>
                  </div>

                  <div className="p-3 bg-[#FAFBFB] border border-[#E1E6E2] rounded-xl">
                    <div className="flex items-center gap-1.5 text-[#68716C] text-[11px] mb-1">
                      <FileText size={13} className="text-zinc-600" />
                      <span>Sales Ledger</span>
                    </div>
                    <p className="text-[18px] font-bold text-[#202522]">
                      {report.stores.salesCount}
                    </p>
                  </div>

                  <div className="p-3 bg-[#FAFBFB] border border-[#E1E6E2] rounded-xl">
                    <div className="flex items-center gap-1.5 text-[#68716C] text-[11px] mb-1">
                      <ImageIcon size={13} className="text-zinc-600" />
                      <span>Image Assets</span>
                    </div>
                    <p className="text-[18px] font-bold text-[#202522]">
                      {report.stores.imageCount}
                    </p>
                  </div>

                  <div className="p-3 bg-[#FAFBFB] border border-[#E1E6E2] rounded-xl">
                    <div className="flex items-center gap-1.5 text-[#68716C] text-[11px] mb-1">
                      <UserCheck size={13} className="text-zinc-600" />
                      <span>Profile</span>
                    </div>
                    <p className="text-[13px] font-semibold text-[#202522]">
                      {report.stores.profileConfigured ? 'Synced' : 'Default'}
                    </p>
                  </div>

                  <div className="p-3 bg-[#FAFBFB] border border-[#E1E6E2] rounded-xl col-span-2 sm:col-span-2">
                    <div className="flex items-center gap-1.5 text-[#68716C] text-[11px] mb-1">
                      <Database size={13} className="text-zinc-600" />
                      <span>Receipt Sequence Counter</span>
                    </div>
                    <p className="text-[14px] font-semibold text-[#202522]">
                      SA-{String(report.stores.receiptSequence).padStart(2, '0')}
                    </p>
                  </div>
                </div>

                {/* Issues or Health Confirmation */}
                {report.issues.length > 0 ? (
                  <div className="p-3.5 bg-[#FFF8E1] border border-[#FFE082] rounded-xl space-y-1.5">
                    <p className="text-[12px] font-semibold text-[#E65100] flex items-center gap-1.5">
                      <AlertTriangle size={14} />
                      <span>Attention Required</span>
                    </p>
                    <ul className="text-[12px] text-[#5D4037] list-disc list-inside space-y-0.5">
                      {report.issues.map((iss, i) => (
                        <li key={i}>{iss}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl flex items-center gap-2.5 text-zinc-800 text-[12px]">
                    <CheckCircle2 size={16} className="flex-shrink-0 text-zinc-700" />
                    <span>0 corruption issues detected. All ACID invariants verified.</span>
                  </div>
                )}

                {/* Repair Result Banner */}
                {repairResult && (
                  <div className="p-3.5 bg-zinc-50 border border-zinc-200 rounded-xl text-[12px] text-zinc-800 space-y-1">
                    <p className="font-semibold flex items-center gap-1.5">
                      <CheckCircle2 size={14} />
                      <span>Database Repair Complete</span>
                    </p>
                    <p>• Salvaged Products: {repairResult.salvagedProducts}</p>
                    <p>• Salvaged Sales: {repairResult.salvagedSales}</p>
                    <p>• Receipt Sequence Reconciled: SA-{String(repairResult.repairedReceiptSequence).padStart(2, '0')}</p>
                  </div>
                )}
              </>
            ) : null}
          </div>

          {/* Footer Actions */}
          <div className="px-5 py-3.5 bg-[#FAFBFB] border-t border-[#EAEFEA] flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRunRecovery}
                disabled={isRepairing || loading}
                className="py-2 px-3 bg-white hover:bg-[#F2F4F2] border border-[#E1E6E2] rounded-xl text-[12px] font-medium text-[#202522] flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60"
              >
                {isRepairing ? <Loader2 size={14} className="animate-spin" /> : <Wrench size={14} />}
                <span>Repair / Recover</span>
              </button>

              <button
                type="button"
                onClick={handleExportBackup}
                disabled={isExporting || loading}
                className="py-2 px-3 bg-white hover:bg-[#F2F4F2] border border-[#E1E6E2] rounded-xl text-[12px] font-medium text-zinc-800 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60"
              >
                {isExporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                <span>Export Backup</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="py-2 px-4 bg-zinc-900 text-white rounded-xl text-[12px] font-semibold hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              Done
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
