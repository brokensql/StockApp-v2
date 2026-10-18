import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, Download, ArrowRight, X, Loader2, CheckCircle2 } from 'lucide-react';
import { saveBackupFile } from '../utils/backup';
import { toast } from 'sonner';

interface BackupReminderModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  destructiveActionLabel: string;
  onProceed: () => void;
  onCancel: () => void;
  isDestructive?: boolean;
}

export const BackupReminderModal: React.FC<BackupReminderModalProps> = ({
  isOpen,
  title,
  description,
  destructiveActionLabel,
  onProceed,
  onCancel,
  isDestructive = true,
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const [hasExported, setHasExported] = useState(false);

  if (!isOpen) return null;

  const handleDownloadBackup = async () => {
    try {
      setIsExporting(true);
      const savedPath = await saveBackupFile();
      setHasExported(true);
      toast.success(`Backup successfully created: ${savedPath}`);
    } catch (err) {
      console.error('Failed to export backup before destructive action:', err);
      toast.error('Failed to download backup file. Please check device permissions.');
    } finally {
      setIsExporting(false);
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
          onClick={onCancel}
          className="fixed inset-0 bg-black/50 backdrop-blur-xs"
        />

        {/* Modal Box */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-md bg-white rounded-2xl shadow-xl border border-[#E1E6E2] overflow-hidden z-10"
        >
          {/* Header */}
          <div className="px-5 pt-5 pb-4 border-b border-[#EAEFEA] flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#FFF4E5] border border-[#FFE1B5] flex items-center justify-center text-[#C07000] flex-shrink-0">
                <AlertTriangle size={20} strokeWidth={2.2} />
              </div>
              <div>
                <h3 className="text-[16px] font-semibold text-[#202522]">Backup Reminder</h3>
                <p className="text-[12px] text-[#68716C] mt-0.5">Protect your business-critical data</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onCancel}
              className="text-[#8B938D] hover:text-[#202522] p-1.5 rounded-lg hover:bg-[#F2F4F2] transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Body */}
          <div className="p-5 space-y-4">
            <div className="p-3.5 bg-[#FAFBFB] rounded-xl border border-[#E1E6E2]">
              <p className="text-[13px] font-medium text-[#202522] mb-1">{title}</p>
              <p className="text-[12px] text-[#68716C] leading-relaxed">{description}</p>
            </div>

            <div className="p-3.5 bg-zinc-50 rounded-xl border border-zinc-200 flex items-start gap-3">
              {hasExported ? (
                <CheckCircle2 size={18} className="text-zinc-800 flex-shrink-0 mt-0.5" />
              ) : (
                <Download size={18} className="text-zinc-800 flex-shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-[#202522]">
                  {hasExported ? 'Backup Downloaded!' : 'Export a copy first?'}
                </p>
                <p className="text-[12px] text-[#556057] mt-0.5 leading-relaxed">
                  {hasExported
                    ? 'Your inventory and sales ledger have been saved to your device.'
                    : 'We strongly recommend taking a 1-click snapshot of all products, sales history, and store profile.'}
                </p>
                <button
                  type="button"
                  onClick={handleDownloadBackup}
                  disabled={isExporting}
                  className="mt-2.5 py-1.5 px-3 bg-white hover:bg-zinc-100 border border-zinc-300 rounded-lg text-zinc-800 text-[12px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60 shadow-2xs"
                >
                  {isExporting ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      <span>Generating backup...</span>
                    </>
                  ) : hasExported ? (
                    <>
                      <Download size={13} />
                      <span>Download again</span>
                    </>
                  ) : (
                    <>
                      <Download size={13} />
                      <span>Download Backup Now</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="px-5 py-4 bg-[#FAFBFB] border-t border-[#EAEFEA] flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onCancel}
              className="py-2.5 px-4 bg-white border border-[#E1E6E2] rounded-xl text-[13px] font-medium text-[#202522] hover:bg-[#F2F4F2] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onProceed}
              className={`py-2.5 px-4 rounded-xl text-[13px] font-semibold text-white flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs ${
                isDestructive
                  ? 'bg-[#D94841] hover:bg-[#B83832] active:bg-[#9B2A25]'
                  : 'bg-zinc-900 hover:bg-zinc-800'
              }`}
            >
              <span>{destructiveActionLabel}</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
