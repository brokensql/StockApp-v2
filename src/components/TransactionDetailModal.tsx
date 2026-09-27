import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Download, Loader2, Trash2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { SaleTransaction } from '../types';
import { ReceiptTicketCard } from './ReceiptTicketCard';
import { downloadReceiptTicket } from '../utils/downloadReceipt';

interface TransactionDetailModalProps {
  isOpen: boolean;
  transaction: SaleTransaction | null;
  storeName?: string;
  onClose: () => void;
  onDeleteSale?: (saleId: string, restoreStock: boolean) => void;
}

export const TransactionDetailModal: React.FC<TransactionDetailModalProps> = ({
  isOpen,
  transaction,
  storeName,
  onClose,
  onDeleteSale,
}) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [restoreStock, setRestoreStock] = useState(false);
  const cardContainerRef = useRef<HTMLDivElement>(null);

  if (!transaction) return null;

  const effectiveStoreName = storeName || transaction.storeName;

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
        effectiveStoreName
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
                enableConfetti={false}
                showAllProducts={true}
              />
            </div>

            {/* Bottom Actions: Download Receipt & Delete Transaction */}
            <div className="w-full mt-3.5 flex flex-col gap-2.5">
              <button
                id="btn-download-transaction-receipt"
                type="button"
                onClick={handleDownloadReceipt}
                disabled={isDownloading}
                className="w-full h-12 bg-[#2F7D32] hover:bg-[#256B29] active:bg-[#1E5A22] active:scale-[0.99] text-white text-[14px] font-semibold rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-[#2F7D32]/25 disabled:opacity-75 disabled:cursor-not-allowed select-none"
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

              {onDeleteSale && !showDeleteConfirm && (
                <button
                  id="btn-delete-sale-record"
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="w-full h-11 bg-white/95 hover:bg-[#FDF0EE] active:bg-[#FBE8E6] text-[#D94841] border border-white/30 hover:border-[#FADCDA] text-[13.5px] font-medium rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm active:scale-[0.99] select-none"
                >
                  <Trash2 size={16} strokeWidth={2} />
                  <span>Delete sale record</span>
                </button>
              )}

              {showDeleteConfirm && (
                <div className="w-full p-4 bg-white rounded-xl shadow-lg border border-[#E1E6E2] text-[#202522]">
                  <div className="flex items-center gap-2 text-[#D94841] mb-1.5 font-semibold text-[14px]">
                    <AlertTriangle size={17} />
                    <span>Delete this sale record?</span>
                  </div>
                  <p className="text-[12.5px] text-[#68716C] mb-3 leading-relaxed">
                    This permanently deletes transaction <span className="font-semibold text-[#202522]">{transaction.transactionNumber}</span> from your history.
                  </p>

                  <label className="flex items-center gap-2.5 mb-3.5 text-[12.5px] text-[#202522] cursor-pointer select-none bg-[#FAFBFB] p-2.5 rounded-lg border border-[#E1E6E2]">
                    <input
                      type="checkbox"
                      checked={restoreStock}
                      onChange={(e) => setRestoreStock(e.target.checked)}
                      className="w-4 h-4 rounded text-[#2F7D32] accent-[#2F7D32] focus:ring-[#2F7D32] cursor-pointer"
                    />
                    <span>Restore sold items back to stock</span>
                  </label>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(false)}
                      className="flex-1 h-10 bg-[#F1F3F0] hover:bg-[#E5E8E4] active:bg-[#DDE1DD] text-[#202522] text-[13px] font-medium rounded-lg transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      id="btn-confirm-delete-sale"
                      type="button"
                      onClick={handleConfirmDelete}
                      className="flex-1 h-10 bg-[#D94841] hover:bg-[#B83832] active:bg-[#9B2F2A] text-white text-[13px] font-medium rounded-lg transition-colors cursor-pointer shadow-sm"
                    >
                      Yes, Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
