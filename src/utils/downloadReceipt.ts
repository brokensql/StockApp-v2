import { toPng } from 'html-to-image';
import { Capacitor } from '@capacitor/core';
import { Media } from '@capacitor-community/media';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { SaleTransaction } from '../types';
import { getPHTParts } from './philippineDate';
import { getStoredStoreName } from './storeProfile';

// Format currency for canvas fallback
function formatPHP(amount?: number | null): string {
  const num = typeof amount === 'number' && !isNaN(amount) ? amount : 0;
  return `₱${num.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// Format Philippine date and time
function formatReceiptDate(timestamp?: number | string): string {
  const d = timestamp ? new Date(timestamp) : new Date();
  const valid = isNaN(d.getTime()) ? new Date() : d;
  const parts = getPHTParts(valid);
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  const monthStr = months[parts.month - 1];
  const dayStr = String(parts.day).padStart(2, '0');
  const hourStr = String(parts.hour).padStart(2, '0');
  const minStr = String(parts.minute).padStart(2, '0');
  return `${dayStr} ${monthStr}, ${parts.year} | ${hourStr}:${minStr}`;
}

/**
 * Robust canvas fallback that paints an authentic, high-resolution receipt image
 * in case DOM foreignObject rendering fails or is blocked by browser security.
 */
function generateCanvasReceipt(
  transaction: SaleTransaction,
  cashTendered?: number | string,
  changeAmount?: number,
  storeName?: string
): string {
  const width = 420;
  const itemsCount = transaction.items?.length || 0;
  // Estimate height based on number of items
  const baseHeight = 610;
  const itemRowHeight = 44;
  const height = Math.max(710, baseHeight + itemsCount * itemRowHeight);

  const canvas = document.createElement('canvas');
  const scale = 2; // High-DPI 2x retina
  canvas.width = width * scale;
  canvas.height = height * scale;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get canvas context');

  ctx.scale(scale, scale);

  const resolvedStoreName =
    storeName?.trim() ||
    transaction.storeName?.trim() ||
    getStoredStoreName();

  // Background canvas tint
  ctx.fillStyle = '#F9FAF8';
  ctx.fillRect(0, 0, width, height);

  const margin = 16;
  const cardW = width - margin * 2;
  const cardX = margin;
  const cardY = margin;
  const cardH = height - margin * 2;
  const cardRadius = 24;

  // Draw Card Shadow
  ctx.shadowColor = 'rgba(0, 0, 0, 0.08)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 8;

  // Card Body
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.roundRect(cardX, cardY, cardW, cardH, cardRadius);
  ctx.fill();

  // Reset shadow for text & crisp lines
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // 1. Prominent Store Name above checkmark
  const circleX = width / 2;
  const storeNameY = cardY + 44;
  ctx.fillStyle = '#202522';
  ctx.font = 'bold 20px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(resolvedStoreName.toUpperCase(), circleX, storeNameY);

  // 2. Success Circle & Checkmark
  const circleY = storeNameY + 44;
  ctx.fillStyle = '#64A30E';
  ctx.beginPath();
  ctx.arc(circleX, circleY, 26, 0, Math.PI * 2);
  ctx.fill();

  // Draw White Checkmark
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(circleX - 10, circleY);
  ctx.lineTo(circleX - 3, circleY + 7);
  ctx.lineTo(circleX + 10, circleY - 6);
  ctx.stroke();

  // Header Text
  ctx.fillStyle = '#202522';
  ctx.font = 'bold 21px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Thank you', circleX, circleY + 44);

  ctx.fillStyle = '#68716C';
  ctx.font = '13px system-ui, -apple-system, sans-serif';
  ctx.fillText('Your payment has been processed successfully.', circleX, circleY + 64);

  // 3. Perforated Divider
  const notchY = circleY + 90;
  const notchRadius = 14;

  // Left Notch cutout
  ctx.fillStyle = '#F9FAF8';
  ctx.beginPath();
  ctx.arc(cardX, notchY, notchRadius, -Math.PI / 2, Math.PI / 2);
  ctx.fill();

  // Right Notch cutout
  ctx.beginPath();
  ctx.arc(cardX + cardW, notchY, notchRadius, Math.PI / 2, -Math.PI / 2);
  ctx.fill();

  // Dashed line
  ctx.strokeStyle = '#DCE1DC';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 5]);
  ctx.beginPath();
  ctx.moveTo(cardX + notchRadius + 6, notchY);
  ctx.lineTo(cardX + cardW - notchRadius - 6, notchY);
  ctx.stroke();
  ctx.setLineDash([]); // reset

  // 4. Receipt Details
  let currentY = notchY + 32;
  const leftX = cardX + 22;
  const rightX = cardX + cardW - 22;

  // Store & Date/Time Row
  ctx.textAlign = 'left';
  ctx.fillStyle = '#68716C';
  ctx.font = '11px system-ui, -apple-system, sans-serif';
  ctx.fillText('Store', leftX, currentY);

  ctx.textAlign = 'right';
  ctx.fillText('Date & time', rightX, currentY);

  currentY += 17;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#202522';
  ctx.font = 'bold 13px system-ui, -apple-system, sans-serif';
  ctx.fillText(resolvedStoreName, leftX, currentY);

  ctx.textAlign = 'right';
  ctx.fillText(formatReceiptDate(transaction.createdAt || transaction.timestamp), rightX, currentY);

  // Subtle separator line
  currentY += 10;
  ctx.strokeStyle = '#F1F3F0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(leftX, currentY);
  ctx.lineTo(rightX, currentY);
  ctx.stroke();

  // Receipt ID & Total
  currentY += 18;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#68716C';
  ctx.font = '11px system-ui, -apple-system, sans-serif';
  ctx.fillText('Receipt ID', leftX, currentY);

  ctx.textAlign = 'right';
  ctx.fillText('Amount', rightX, currentY);

  currentY += 18;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#202522';
  ctx.font = 'bold 14px monospace, sans-serif';
  ctx.fillText(transaction.transactionNumber, leftX, currentY);

  ctx.textAlign = 'right';
  ctx.font = 'bold 16px system-ui, -apple-system, sans-serif';
  ctx.fillText(formatPHP(transaction.total), rightX, currentY);

  // Bought Products Header
  currentY += 26;
  ctx.fillStyle = '#68716C';
  ctx.font = '11px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'left';
  const itemCount = transaction.itemCount || transaction.items?.length || 1;
  ctx.fillText(`Bought products (${itemCount} ${itemCount === 1 ? 'item' : 'items'})`, leftX, currentY);

  ctx.textAlign = 'right';
  ctx.fillText('Total', rightX, currentY);

  currentY += 10;
  ctx.strokeStyle = '#F1F3F0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(leftX, currentY);
  ctx.lineTo(rightX, currentY);
  ctx.stroke();

  // Line items
  const items = transaction.items || [];
  for (const item of items) {
    currentY += 22;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#202522';
    ctx.font = 'bold 13px system-ui, -apple-system, sans-serif';

    // Truncate long name if needed
    let displayName = item.name;
    if (ctx.measureText(displayName).width > 220) {
      while (ctx.measureText(displayName + '…').width > 220 && displayName.length > 0) {
        displayName = displayName.slice(0, -1);
      }
      displayName += '…';
    }
    ctx.fillText(displayName, leftX, currentY);

    ctx.textAlign = 'right';
    ctx.font = 'bold 13px system-ui, -apple-system, sans-serif';
    ctx.fillText(formatPHP(item.quantity * item.unitPrice), rightX, currentY);

    currentY += 15;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#68716C';
    ctx.font = '11.5px system-ui, -apple-system, sans-serif';
    ctx.fillText(`${item.quantity} × ${formatPHP(item.unitPrice)}`, leftX, currentY);

    currentY += 6;
  }

  // Summary: Subtotal, Cash Received, Change Due
  currentY += 10;
  ctx.strokeStyle = '#E1E6E2';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(leftX, currentY);
  ctx.lineTo(rightX, currentY);
  ctx.stroke();

  currentY += 18;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#68716C';
  ctx.font = '12.5px system-ui, -apple-system, sans-serif';
  ctx.fillText('Subtotal', leftX, currentY);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#202522';
  ctx.font = 'bold 12.5px system-ui, -apple-system, sans-serif';
  ctx.fillText(formatPHP(transaction.subtotal), rightX, currentY);

  currentY += 18;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#68716C';
  ctx.font = '12.5px system-ui, -apple-system, sans-serif';
  ctx.fillText('Payment method', leftX, currentY);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#202522';
  ctx.font = 'bold 12.5px system-ui, -apple-system, sans-serif';
  const methodLabel =
    transaction.paymentMethod === 'gcash'
      ? 'GCash'
      : transaction.paymentMethod === 'card'
      ? 'Card'
      : 'Cash';
  ctx.fillText(methodLabel, rightX, currentY);

  const parsedCash = typeof cashTendered === 'string' ? parseFloat(cashTendered) || 0 : (cashTendered || 0);
  const actualChange = changeAmount !== undefined ? changeAmount : Math.max(0, parsedCash - transaction.total);

  if (transaction.paymentMethod === 'cash' && parsedCash > 0) {
    currentY += 18;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#68716C';
    ctx.font = '12.5px system-ui, -apple-system, sans-serif';
    ctx.fillText('Cash received', leftX, currentY);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#202522';
    ctx.font = 'bold 12.5px system-ui, -apple-system, sans-serif';
    ctx.fillText(formatPHP(parsedCash), rightX, currentY);

    currentY += 18;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#202522';
    ctx.font = 'bold 13px system-ui, -apple-system, sans-serif';
    ctx.fillText('Change due', leftX, currentY);

    ctx.textAlign = 'right';
    ctx.font = 'bold 13.5px system-ui, -apple-system, sans-serif';
    ctx.fillText(formatPHP(actualChange), rightX, currentY);
  }

  // Bottom dashed line
  currentY += 22;
  ctx.strokeStyle = '#DCE1DC';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 5]);
  ctx.beginPath();
  ctx.moveTo(leftX, currentY);
  ctx.lineTo(rightX, currentY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Barcode representation
  currentY += 18;
  const barcodeX = width / 2;
  const barcodeW = 200;
  const barStartY = currentY;
  const barH = 34;

  ctx.fillStyle = '#202522';
  // Draw simplified alternating bars
  const pattern = [3, 1, 4, 2, 1, 3, 4, 2, 1, 4, 2, 3, 1, 4, 2, 5, 1, 3, 2, 4, 1, 3, 5, 2, 4, 2, 3, 5, 1, 3, 2, 3];
  let curBarX = barcodeX - barcodeW / 2;
  pattern.forEach((p, idx) => {
    if (idx % 2 === 0) {
      ctx.fillRect(curBarX, barStartY, p, barH);
    }
    curBarX += p + 2;
  });

  currentY += barH + 16;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#202522';
  ctx.font = 'bold 11px monospace, sans-serif';
  const barcodeNum = `400600${transaction.transactionNumber.replace(/\D/g, '').padEnd(6, '0')}`;
  ctx.fillText(barcodeNum, barcodeX, currentY);

  return canvas.toDataURL('image/png', 1.0);
}

/**
 * Downloads receipt as a PNG image directly onto the user's mobile phone gallery (under "StockApp" album when in Capacitor) or browser downloads.
 */
export async function downloadReceiptTicket(
  receiptElement: HTMLElement | null,
  transaction: SaleTransaction,
  cashTendered?: number | string,
  changeAmount?: number,
  storeName?: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    let dataUrl = '';

    // Attempt 1: High-fidelity DOM capture via html-to-image
    if (receiptElement) {
      try {
        dataUrl = await toPng(receiptElement, {
          quality: 0.98,
          pixelRatio: 2,
          backgroundColor: '#F9FAF8',
          cacheBust: true,
          filter: (node) => {
            // Exclude dynamic confetti particles from the downloaded receipt
            if (node instanceof HTMLElement && node.classList.contains('confetti-particle')) {
              return false;
            }
            return true;
          },
        });
      } catch (domErr) {
        console.warn('DOM capture failed, falling back to canvas renderer:', domErr);
      }
    }

    // Attempt 2: Fallback to canvas renderer if DOM capture failed or returned empty
    if (!dataUrl || dataUrl.length < 100) {
      dataUrl = generateCanvasReceipt(transaction, cashTendered, changeAmount, storeName);
    }

    const txNum = transaction.transactionNumber || 'sale';
    const filename = `receipt-${txNum}.png`;

    // Detect native Capacitor environment (Android / iOS)
    const isNative =
      typeof window !== 'undefined' &&
      (Capacitor.isNativePlatform() ||
        (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.());

    if (isNative) {
      try {
        // Step A: Search for or create "StockApp" album
        let albumIdentifier: string | undefined;
        try {
          const { albums } = await Media.getAlbums();
          let stockAppAlbum = albums.find(
            (a) => a.name && a.name.trim().toLowerCase() === 'stockapp'
          );
          if (!stockAppAlbum) {
            await Media.createAlbum({ name: 'StockApp' });
            const { albums: updatedAlbums } = await Media.getAlbums();
            stockAppAlbum = updatedAlbums.find(
              (a) => a.name && a.name.trim().toLowerCase() === 'stockapp'
            );
          }
          if (stockAppAlbum) {
            albumIdentifier = stockAppAlbum.identifier;
          }
        } catch (albumErr) {
          console.warn('Could not query or create StockApp album, default gallery used:', albumErr);
        }

        // Step B: Save receipt photo directly to the phone gallery under "StockApp" album
        await Media.savePhoto({
          path: dataUrl,
          albumIdentifier: albumIdentifier,
          fileName: `Receipt_${txNum}`,
        });

        return {
          success: true,
          message: 'Saved to StockApp album in phone gallery!',
        };
      } catch (nativeMediaErr) {
        console.warn('Media plugin savePhoto failed, attempting Filesystem fallback:', nativeMediaErr);
        try {
          const base64Clean = dataUrl.replace(/^data:image\/\w+;base64,/, '');
          await Filesystem.writeFile({
            path: `StockApp/${filename}`,
            data: base64Clean,
            directory: Directory.Documents,
            recursive: true,
          });
          return {
            success: true,
            message: 'Saved to StockApp folder in Documents!',
          };
        } catch (fsErr) {
          console.error('Filesystem save also failed:', fsErr);
        }
      }
    }

    // Convert dataURL to Blob for web/browser environment
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const file = new File([blob], filename, { type: 'image/png' });

    // Try Web Share API on mobile browsers if supported (e.g. Save to Photos / Save to Files)
    if (
      typeof navigator !== 'undefined' &&
      navigator.canShare &&
      navigator.canShare({ files: [file] })
    ) {
      try {
        await navigator.share({
          files: [file],
          title: `Receipt ${txNum}`,
          text: `Sales Receipt for ${txNum}`,
        });
        return { success: true, message: 'Receipt shared successfully' };
      } catch (shareErr) {
        if ((shareErr as Error).name === 'AbortError') {
          return { success: true };
        }
        console.warn('Web Share failed, proceeding with direct download link:', shareErr);
      }
    }

    // Standard HTML5 Download anchor for Web / Desktop
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();

    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    }, 250);

    return { success: true, message: 'Receipt downloaded successfully' };
  } catch (err) {
    console.error('Failed to download receipt:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error during download',
    };
  }
}
