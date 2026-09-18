import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { SaleTransaction } from '../types';
import { ReceiptTicketCard } from './ReceiptTicketCard';
import { downloadReceiptTicket } from '../utils/downloadReceipt';

interface TransactionDetailModalProps {
  isOpen: boolean;
  transaction: SaleTransaction | null;
  storeName?: string;
  onClose: () => void;
}

export const TransactionDetailModal: React.FC<TransactionDetailModalProps> = ({
  isOpen,
  transaction,
  storeName,
  onClose,
}) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const cardContainerRef = useRef<HTMLDivElement>(null);

  if (!transaction) return null;

  const effectiveStoreName = storeName || transaction.storeName;

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
            onClick={onClose}
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
                onClick={onClose}
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
              />
            </div>

            {/* Bottom Action: Download Receipt */}
            <div className="w-full mt-3.5 flex flex-col gap-2">
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
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
