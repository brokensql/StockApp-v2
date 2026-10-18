import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Download, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { SaleTransaction } from '../types';
import { ReceiptTicketCard } from './ReceiptTicketCard';
import { downloadReceiptTicket } from '../utils/downloadReceipt';
import { getStoredTIN } from '../utils/storeProfile';

interface TransactionDetailModalProps {
  isOpen: boolean;
  transaction: SaleTransaction | null;
  storeName?: string;
  tinNumber?: string;
  onClose: () => void;
  onDeleteSale?: (saleId: string, restoreStock: boolean) => void;
}

export const TransactionDetailModal: React.FC<TransactionDetailModalProps> = ({
  isOpen,
  transaction,
  storeName,
  tinNumber,
  onClose,
  onDeleteSale,
}) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [restoreStock, setRestoreStock] = useState(false);
  const cardContainerRef = useRef<HTMLDivElement>(null);

  if (!transaction) return null;

  const effectiveStoreName = storeName || transaction.storeName;
  const effectiveTIN = tinNumber || transaction.tinNumber || getStoredTIN();

  const handleClose = () => {
    setShowDeleteConfirm(false);
    setRestoreStock(false);
    onClose();
  };

  const handleDownloadReceipt = async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    try {
      const cardEl =
        (cardContainerRef.current?.querySelector('#receipt-ticket-card') as HTMLElement) ||
        cardContainerRef.current;
      const result = await downloadReceiptTicket(
        cardEl,
        transaction,
        transaction.cashTendered,
        transaction.changeAmount,
        effectiveStoreName,
        effectiveTIN
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

  const handleConfirmDelete = () => {
    if (!transaction) return;
    if (onDeleteSale) {
      onDeleteSale(transaction.id, restoreStock);
    }
    setShowDeleteConfirm(false);
    setRestoreStock(false);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          id="transaction-modal-backdrop"
          className="fixed inset-0 z-[100] flex flex-col items-center justify-start sm:justify-center bg-[#252825]/70 backdrop-blur-sm p-4 pt-[calc(1.25rem+var(--safe-area-top,env(safe-area-inset-top,16px)))] pb-[calc(3rem+var(--safe-area-bottom,env(safe-area-inset-bottom,28px)))] overflow-y-auto"
        >
          {/* Backdrop Click Dismiss */}
          <div
            className="fixed inset-0"
            onClick={handleClose}
            aria-hidden="true"
          />

          <motion.div
            id="transaction-modal-sheet"
            initial={{ opacity: 0, scale: 0.94, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 16 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="relative z-10 w-full max-w-[380px] my-auto flex flex-col items-center"
          >
            {/* Top Close Bar */}
            <div className="w-full flex items-center justify-between mb-2.5 px-1">
              <span className="text-[13px] font-semibold text-white/90 drop-shadow-xs">
                Transaction Receipt
              </span>
              <button
                type="button"
                onClick={handleClose}
                className="w-8 h-8 rounded-full bg-white/90 hover:bg-white text-[#252825] flex items-center justify-center transition-all cursor-pointer shadow-md active:scale-95"
                aria-label="Close receipt"
              >
                <X size={17} strokeWidth={2.2} />
              </button>
            </div>

            {/* Authentic Receipt Ticket Card */}
            <div ref={cardContainerRef} className="w-full shadow-2xl rounded-2xl overflow-hidden">
              <ReceiptTicketCard
                transaction={transaction}
                storeName={effectiveStoreName}
                tinNumber={effectiveTIN}
                enableConfetti={false}
                showAllProducts={true}
              />
            </div>

            {/* Bottom Actions: Download Receipt & Delete Transaction Text */}
            <div className="w-full mt-3.5 flex flex-col gap-2">
              <button
                id="btn-download-transaction-receipt"
                type="button"
                onClick={handleDownloadReceipt}
                disabled={isDownloading}
                className="w-full h-12.5 bg-[#2F7D32] hover:bg-[#256B29] active:bg-[#1E5A22] active:scale-[0.99] text-white text-[14.5px] font-semibold rounded-full flex items-center justify-center gap-2 transition-all cursor-pointer shadow-[0_4px_14px_rgba(47,125,50,0.25)] disabled:opacity-75 disabled:cursor-not-allowed select-none"
              >
                {isDownloading ? (
                  <>
                    <Loader2 size={18} className="animate-spin text-white" />
                    <span>Saving receipt...</span>
                  </>
                ) : (
                  <>
                    <Download size={18} strokeWidth={2.2} />
                    <span>Download receipt</span>
                  </>
                )}
              </button>

              {onDeleteSale && (
                <button
                  id="btn-delete-sale-record"
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="w-auto mx-auto py-2 px-3 text-[#D94841] hover:text-[#B83832] active:text-[#9B2F2A] text-[13px] font-medium transition-colors cursor-pointer select-none text-center"
                >
                  Delete sale record
                </button>
              )}
            </div>
          </motion.div>

          {/* Delete Sale Record Confirmation Pop-up: Centered on screen */}
          {showDeleteConfirm && (
            <div
              id="delete-sale-confirm-backdrop"
              onClick={(e) => {
                if (e.target === e.currentTarget) {
                  setShowDeleteConfirm(false);
                }
              }}
              className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.94 }}
                transition={{ duration: 0.16 }}
                id="delete-sale-confirm-modal"
                className="w-full max-w-[340px] bg-white rounded-2xl p-5 shadow-2xl border border-[#E1E6E2] text-[#202522] flex flex-col"
              >
                <div className="flex items-center gap-2.5 text-[#D94841] mb-2 font-semibold text-[15px]">
                  <div className="w-8 h-8 rounded-full bg-[#FDF0EF] flex items-center justify-center shrink-0">
                    <AlertTriangle size={17} className="text-[#D94841]" />
                  </div>
                  <span>Delete sale record?</span>
                </div>

                <p className="text-[13px] text-[#68716C] mb-3.5 leading-relaxed">
                  This permanently deletes transaction <span className="font-semibold text-[#202522]">{transaction.transactionNumber}</span> from your history.
                </p>

                <label className="flex items-center gap-2.5 mb-4 text-[13px] text-[#202522] cursor-pointer select-none bg-[#FAFBFB] p-2.5 rounded-xl border border-[#E1E6E2]">
                  <input
                    type="checkbox"
                    checked={restoreStock}
                    onChange={(e) => setRestoreStock(e.target.checked)}
                    className="w-4 h-4 rounded text-[#2F7D32] accent-[#2F7D32] focus:ring-[#2F7D32] cursor-pointer"
                  />
                  <span>Restore sold items back to stock</span>
                </label>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(false)}
                    className="flex-1 h-10.5 bg-[#F1F3F0] hover:bg-[#E5E8E4] active:bg-[#DDE1DD] text-[#202522] text-[13.5px] font-medium rounded-xl transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    id="btn-confirm-delete-sale"
                    type="button"
                    onClick={handleConfirmDelete}
                    className="flex-1 h-10.5 bg-[#D94841] hover:bg-[#B83832] active:bg-[#9B2F2A] text-white text-[13.5px] font-medium rounded-xl transition-colors cursor-pointer shadow-sm"
                  >
                    Yes, Delete
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </div>
      )}
    </AnimatePresence>
  );
};
