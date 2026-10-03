import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Upload,
  Check,
  FlipHorizontal,
  Zap,
  ZapOff,
  ZoomIn,
  ZoomOut,
  ScanLine,
  AlertCircle,
  Keyboard,
  ShoppingCart,
  ChevronRight,
  Undo2,
  Redo2,
  Plus,
  Trash2,
  Search,
  Minus,
  Barcode,
  Package,
  SlidersHorizontal,
} from 'lucide-react';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import { Product, SaleItem, SaleTransaction } from '../types';
import { ProductThumbnail } from './ProductThumbnail';
import { useProductImages } from '../hooks/useProductImages';
import { STANDARD_CATEGORIES } from '../data/categories';
import { shoppingCartData } from '../assets/lottie';
import { LottieAnimation } from './LottieAnimation';

// Web standard Native BarcodeDetector interface
interface DetectedBarcode {
  rawValue: string;
  format: string;
  boundingBox?: DOMRectReadOnly;
  cornerPoints?: Array<{ x: number; y: number }>;
}

interface NativeBarcodeDetector {
  detect: (image: ImageBitmapSource) => Promise<DetectedBarcode[]>;
}

declare global {
  interface Window {
    BarcodeDetector?: {
      new (options?: { formats: string[] }): NativeBarcodeDetector;
      getSupportedFormats?: () => Promise<string[]>;
    };
  }
}

export interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess?: (barcode: string) => void;
  onProceedToActiveSale?: (items: SaleItem[], unrecognizedBarcode?: string | null) => void;
  title?: string;
  products?: Product[];
  onItemScanned?: (product: Product) => void;
  mode?: 'sale' | 'inventory' | 'single';
  // Deprecated legacy props kept for type compatibility
  allowMultiScan?: boolean;
  defaultMode?: 'single' | 'multi';
  onCompleteMultiSale?: (
    newTransaction: SaleTransaction,
    updatedProducts: Product[]
  ) => void;
}

interface HistorySnapshot {
  cart: SaleItem[];
  unrecognizedBarcode: string | null;
  actionTitle?: string;
}

// Target high-frequency retail barcode formats for maximum speed & accuracy
const RETAIL_ZXING_FORMATS: BarcodeFormat[] = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.QR_CODE,
];

const RETAIL_NATIVE_FORMATS: string[] = [
  'ean_13',
  'ean_8',
  'upc_a',
  'upc_e',
  'code_128',
  'code_39',
  'qr_code',
];

// Helper to safely apply advanced video constraints
const applyTrackConstraint = async (track: MediaStreamTrack, constraints: Record<string, unknown>) => {
  try {
    const capabilities = track.getCapabilities?.() as unknown as Record<string, unknown> | undefined;
    if (!capabilities) return;
    const filteredConstraints: Record<string, unknown> = {};
    for (const key of Object.keys(constraints)) {
      if (key in capabilities) {
        filteredConstraints[key] = constraints[key];
      }
    }
    if (Object.keys(filteredConstraints).length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await track.applyConstraints({ advanced: [filteredConstraints as any] });
    }
  } catch {
    // Constraint not accepted by camera hardware
  }
};

const ProductCardImage: React.FC<{ src?: string | null; alt: string }> = ({ src, alt }) => {
  const [error, setError] = useState(false);

  if (!src || error) {
    return (
      <div className="w-full h-full bg-[#FAFBFB] flex items-center justify-center text-[#8E948F]">
        <Package size={34} strokeWidth={1.4} />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setError(true)}
      className="w-full h-full object-contain transition-transform duration-200 group-hover:scale-105"
    />
  );
};

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  onScanSuccess,
  onProceedToActiveSale,
  products = [],
  onItemScanned,
  mode,
  title,
}) => {
  const isInventoryMode =
    mode === 'inventory' || mode === 'single' || (!onProceedToActiveSale && Boolean(onScanSuccess));
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const frameCallbackIdRef = useRef<number | null>(null);

  // Input Method: 'barcode' (camera live scanner) vs 'key' (inventory search & select)
  const [inputMethod, setInputMethod] = useState<'barcode' | 'key'>('barcode');
  const [searchQuery, setSearchQuery] = useState('');
  const [barcodeFilter, setBarcodeFilter] = useState<'all' | 'with-barcode' | 'without-barcode'>('all');
  const [isCategoryFilterOpen, setIsCategoryFilterOpen] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const { images } = useProductImages();

  // Undo / Redo history state
  const [cartHistory, setCartHistory] = useState<HistorySnapshot[]>([
    { cart: [], unrecognizedBarcode: null },
  ]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);

  const currentSnapshot = cartHistory[historyIndex] || { cart: [], unrecognizedBarcode: null };
  const scannedCart = currentSnapshot.cart;
  const unrecognizedBarcode = currentSnapshot.unrecognizedBarcode;

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < cartHistory.length - 1;

  // Camera & hardware states
  const [hasCamera, setHasCamera] = useState<boolean | null>(null);
  const [, setCameraError] = useState<string | null>(null);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [zoomAvailable, setZoomAvailable] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [maxZoom, setMaxZoom] = useState<number>(1);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [focusTapPos, setFocusTapPos] = useState<{ x: number; y: number } | null>(null);

  // 5-second scan window state & refs
  const [isScanningActive, setIsScanningActive] = useState<boolean>(false);
  const isScanningActiveRef = useRef<boolean>(false);
  const scanTimeoutRef = useRef<number | null>(null);

  // Snug Navy Blue in-modal toast
  const [scanToast, setScanToast] = useState<{
    id: number;
    type: 'success' | 'warning' | 'info';
    title: string;
    subtitle?: string;
  } | null>(null);
  const toastDismissTimerRef = useRef<number | null>(null);

  // Computed counts
  const totalQuantity = scannedCart.reduce((sum, item) => sum + item.quantity, 0);
  const totalAmount = scannedCart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

  // Keep latest props in ref so scan callbacks never cause camera pipeline effect re-triggers
  const propsRef = useRef({
    products,
    onScanSuccess,
    onProceedToActiveSale,
    onClose,
    onItemScanned,
  });
  propsRef.current = {
    products,
    onScanSuccess,
    onProceedToActiveSale,
    onClose,
    onItemScanned,
  };

  const handleScanResultRef = useRef<(text: string) => void>(() => {});

  // Push new history state
  const pushHistory = useCallback(
    (newCart: SaleItem[], newUnrecognized: string | null, actionTitle?: string) => {
      setCartHistory((prev) => {
        const next = prev.slice(0, historyIndex + 1);
        return [
          ...next,
          {
            cart: newCart,
            unrecognizedBarcode: newUnrecognized,
            actionTitle,
          },
        ];
      });
      setHistoryIndex((prev) => prev + 1);
    },
    [historyIndex]
  );

  // Undo Handler
  const handleUndo = useCallback(() => {
    if (!canUndo) return;
    const targetIdx = historyIndex - 1;
    const targetSnapshot = cartHistory[targetIdx];
    setHistoryIndex(targetIdx);

    if (toastDismissTimerRef.current) {
      clearTimeout(toastDismissTimerRef.current);
    }
    const remainingCount = targetSnapshot.cart.reduce((s, i) => s + i.quantity, 0);
    setScanToast({
      id: Date.now(),
      type: 'info',
      title: 'Action Undone',
      subtitle: remainingCount > 0 ? `${remainingCount} item${remainingCount > 1 ? 's' : ''} in cart` : 'Cart is empty',
    });
    toastDismissTimerRef.current = window.setTimeout(() => {
      setScanToast(null);
    }, 2500);
  }, [canUndo, historyIndex, cartHistory]);

  // Redo Handler
  const handleRedo = useCallback(() => {
    if (!canRedo) return;
    const targetIdx = historyIndex + 1;
    const targetSnapshot = cartHistory[targetIdx];
    setHistoryIndex(targetIdx);

    if (toastDismissTimerRef.current) {
      clearTimeout(toastDismissTimerRef.current);
    }
    const count = targetSnapshot.cart.reduce((s, i) => s + i.quantity, 0);
    setScanToast({
      id: Date.now(),
      type: 'info',
      title: 'Action Redone',
      subtitle: `${count} item${count > 1 ? 's' : ''} in cart`,
    });
    toastDismissTimerRef.current = window.setTimeout(() => {
      setScanToast(null);
    }, 2500);
  }, [canRedo, historyIndex, cartHistory]);

  // Play crisp POS beep audio on scan detection
  const playBeep = useCallback(() => {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1500, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(2100, ctx.currentTime + 0.07);
        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.07);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.07);
      }
    } catch {
      // AudioContext blocked or not supported
    }

    if (navigator.vibrate) {
      try {
        navigator.vibrate([40, 30, 50]);
      } catch {
        // vibration not allowed
      }
    }
  }, []);

  // Main scan result handler - updates history & shows pure toaster (no middle popup)
  const handleScanResult = useCallback(
    (text: string) => {
      const clean = text.trim();
      if (!clean) return;

      // Only accept detections when the 5-second scan window is active
      if (!isScanningActiveRef.current) return;

      // Stop scanning session for this trigger and clear 5s timeout
      isScanningActiveRef.current = false;
      setIsScanningActive(false);
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
        scanTimeoutRef.current = null;
      }

      playBeep();

      const {
        products: currentProducts,
        onItemScanned: currentOnItemScanned,
        onScanSuccess: currentOnScanSuccess,
        onClose: currentOnClose,
      } = propsRef.current;

      const matched = currentProducts.find(
        (p) =>
          (p.sku && p.sku.trim().toLowerCase() === clean.toLowerCase()) ||
          p.id.toLowerCase() === clean.toLowerCase() ||
          p.name.trim().toLowerCase() === clean.toLowerCase()
      );

      // --- INVENTORY MODE LOGIC (Add/Update Product in Inventory) ---
      if (isInventoryMode) {
        if (matched) {
          if (currentOnItemScanned) {
            currentOnItemScanned(matched);
          }
          setScanToast({
            id: Date.now(),
            type: 'success',
            title: matched.name,
            subtitle: `Barcode: ${clean} • Existing product`,
          });
        } else {
          setScanToast({
            id: Date.now(),
            type: 'success',
            title: 'Barcode Scanned',
            subtitle: clean,
          });
        }

        if (currentOnScanSuccess) {
          currentOnScanSuccess(clean);
        }

        if (toastDismissTimerRef.current) {
          clearTimeout(toastDismissTimerRef.current);
        }

        // Auto close to return to product details form with barcode
        window.setTimeout(() => {
          currentOnClose();
        }, 320);
        return;
      }

      // --- SALES MODE LOGIC (Add to Customer Sales Cart) ---
      if (matched) {
        // Stock validation: prevent adding out-of-stock items or exceeding available inventory
        if (matched.stock <= 0) {
          playBeep();
          setScanToast({
            id: Date.now(),
            type: 'warning',
            title: matched.name,
            subtitle: 'Out of stock (0 available)',
          });
          if (toastDismissTimerRef.current) {
            clearTimeout(toastDismissTimerRef.current);
          }
          toastDismissTimerRef.current = window.setTimeout(() => {
            setScanToast(null);
          }, 3000);
          return;
        }

        const existingIdx = scannedCart.findIndex((item) => item.productId === matched.id);
        if (existingIdx >= 0 && scannedCart[existingIdx].quantity >= matched.stock) {
          playBeep();
          setScanToast({
            id: Date.now(),
            type: 'warning',
            title: matched.name,
            subtitle: `Max stock reached (${matched.stock} in stock)`,
          });
          if (toastDismissTimerRef.current) {
            clearTimeout(toastDismissTimerRef.current);
          }
          toastDismissTimerRef.current = window.setTimeout(() => {
            setScanToast(null);
          }, 3000);
          return;
        }

        if (currentOnItemScanned) {
          currentOnItemScanned(matched);
        }

        let updatedCart: SaleItem[];
        if (existingIdx >= 0) {
          updatedCart = [...scannedCart];
          updatedCart[existingIdx] = {
            ...updatedCart[existingIdx],
            quantity: updatedCart[existingIdx].quantity + 1,
          };
        } else {
          updatedCart = [
            ...scannedCart,
            {
              productId: matched.id,
              name: matched.name,
              unitPrice: matched.price,
              quantity: 1,
              category: matched.category,
            },
          ];
        }

        pushHistory(updatedCart, unrecognizedBarcode, matched.name);

        setScanToast({
          id: Date.now(),
          type: 'success',
          title: matched.name,
          subtitle: `₱${matched.price.toFixed(2)} • Added to cart`,
        });
      } else {
        // Unrecognized barcode in sales mode: Show accurate warning toast
        pushHistory(scannedCart, clean, 'Unrecognized');

        setScanToast({
          id: Date.now(),
          type: 'warning',
          title: 'Unrecognized Barcode',
          subtitle: `Barcode: ${clean}`,
        });
      }

      if (toastDismissTimerRef.current) {
        clearTimeout(toastDismissTimerRef.current);
      }
      toastDismissTimerRef.current = window.setTimeout(() => {
        setScanToast(null);
      }, 3000);
    },
    [playBeep, scannedCart, unrecognizedBarcode, pushHistory]
  );

  handleScanResultRef.current = handleScanResult;

  // Checkout handler: only goes to sales checkout when Checkout is clicked
  const handleCheckout = useCallback(() => {
    // Sanitize cart against products stock: filter out out-of-stock items, clamp quantities to available stock
    const sanitizedCart = scannedCart
      .map((item) => {
        const prod = products.find((p) => p.id === item.productId);
        if (!prod || prod.stock <= 0) return null;
        return {
          ...item,
          quantity: Math.max(1, Math.min(item.quantity, prod.stock)),
        };
      })
      .filter(Boolean) as SaleItem[];

    if (sanitizedCart.length === 0 && !unrecognizedBarcode) {
      setScanToast({
        id: Date.now(),
        type: 'warning',
        title: 'Cart is empty or out of stock',
        subtitle: 'Please select in-stock products to proceed',
      });
      if (toastDismissTimerRef.current) clearTimeout(toastDismissTimerRef.current);
      toastDismissTimerRef.current = window.setTimeout(() => setScanToast(null), 3000);
      return;
    }

    const {
      onProceedToActiveSale: currentOnProceedToActiveSale,
      onScanSuccess: currentOnScanSuccess,
      onClose: currentOnClose,
    } = propsRef.current;

    if (currentOnProceedToActiveSale) {
      currentOnProceedToActiveSale(sanitizedCart, unrecognizedBarcode);
    } else if (currentOnScanSuccess) {
      const firstCode = sanitizedCart[0]?.productId || unrecognizedBarcode || '';
      currentOnScanSuccess(firstCode);
    }
    currentOnClose();
  }, [scannedCart, unrecognizedBarcode, products]);

  // Trigger a maximum 5-second scan session on button click
  const triggerScanSession = useCallback(() => {
    // Clear any previous timer
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
      scanTimeoutRef.current = null;
    }
    if (toastDismissTimerRef.current) {
      clearTimeout(toastDismissTimerRef.current);
      toastDismissTimerRef.current = null;
    }

    if (navigator.vibrate) {
      try {
        navigator.vibrate(40);
      } catch {
        // ignore
      }
    }

    // Activate scanning window
    setIsScanningActive(true);
    isScanningActiveRef.current = true;

    // Show toaster: "Scanning for barcode" (strictly NO countdown)
    setScanToast({
      id: Date.now(),
      type: 'info',
      title: 'Scanning for barcode',
    });

    // Check if a barcode is already sharp and visible in front of lens
    if (videoRef.current && typeof window !== 'undefined' && 'BarcodeDetector' in window && window.BarcodeDetector) {
      try {
        const detector = new window.BarcodeDetector({ formats: RETAIL_NATIVE_FORMATS });
        if (videoRef.current.readyState >= 2) {
          detector
            .detect(videoRef.current)
            .then((barcodes) => {
              if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
                handleScanResultRef.current(barcodes[0].rawValue);
              }
            })
            .catch(() => {});
        }
      } catch {
        // Handled by continuous loop
      }
    }

    // 5-second maximum scan duration
    scanTimeoutRef.current = window.setTimeout(() => {
      setIsScanningActive(false);
      isScanningActiveRef.current = false;
      scanTimeoutRef.current = null;

      setScanToast({
        id: Date.now(),
        type: 'warning',
        title: 'No barcode found',
        subtitle: 'Click the scan button to scan again',
      });

      toastDismissTimerRef.current = window.setTimeout(() => {
        setScanToast(null);
      }, 3500);
    }, 5000);
  }, []);

  // Modal lifecycle & cleanup
  useEffect(() => {
    if (isOpen) {
      setInputMethod('barcode');
      setSearchQuery('');
      setBarcodeFilter('all');
      setCartHistory([{ cart: [], unrecognizedBarcode: null }]);
      setHistoryIndex(0);
      setIsScanningActive(false);
      isScanningActiveRef.current = false;
      setScanToast(null);
    } else {
      setIsScanningActive(false);
      isScanningActiveRef.current = false;
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
        scanTimeoutRef.current = null;
      }
      if (toastDismissTimerRef.current) {
        clearTimeout(toastDismissTimerRef.current);
        toastDismissTimerRef.current = null;
      }
      setScanToast(null);
    }
  }, [isOpen]);

  const handleSwitchInputMethod = (method: 'barcode' | 'key') => {
    setInputMethod(method);
    if (method === 'key') {
      setIsScanningActive(false);
      isScanningActiveRef.current = false;
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
        scanTimeoutRef.current = null;
      }
      setScanToast(null);
    }
  };

  const wasOpenRef = useRef<boolean>(false);

  // Lifecycle & Camera Setup
  useEffect(() => {
    if (!isOpen) {
      if (wasOpenRef.current) {
        wasOpenRef.current = false;
        isScanningActiveRef.current = false;
        if (controlsRef.current) {
          controlsRef.current.stop();
          controlsRef.current = null;
        }
        if (frameCallbackIdRef.current !== null) {
          cancelAnimationFrame(frameCallbackIdRef.current);
          frameCallbackIdRef.current = null;
        }
        setCameraError(null);
        setFocusTapPos(null);
        setScanToast(null);
      }
      return;
    }

    wasOpenRef.current = true;
    let isMounted = true;

    async function startScannerPipeline() {
      setCameraError(null);
      setHasCamera(null);

      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('Camera access is not supported by your browser.');
        }

        const constraints: MediaStreamConstraints = {
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1280, min: 640 },
            height: { ideal: 720, min: 480 },
            frameRate: { ideal: 30, min: 15 },
          },
          audio: false,
        };

        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: facingMode } },
            audio: false,
          });
        }

        if (!isMounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        setHasCamera(true);

        const videoEl = videoRef.current;
        if (!videoEl) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        videoEl.srcObject = stream;
        await videoEl.play();

        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          const capabilities = videoTrack.getCapabilities?.() as unknown as Record<string, unknown> | undefined;
          if (capabilities) {
            if ('torch' in capabilities) {
              setTorchAvailable(true);
            }
            if ('zoom' in capabilities) {
              setZoomAvailable(true);
              const zoomCap = capabilities.zoom as { max?: number; min?: number } | undefined;
              if (zoomCap && typeof zoomCap.max === 'number') {
                setMaxZoom(Math.min(zoomCap.max, 4));
              }
            }
          }
          await applyTrackConstraint(videoTrack, {
            focusMode: 'continuous',
            exposureMode: 'continuous',
            whiteBalanceMode: 'continuous',
          });
        }

        // Dual Engine Detection: Native BarcodeDetector (Hardware-Accelerated) or ZXing
        let useNativeEngine = false;
        if (typeof window !== 'undefined' && 'BarcodeDetector' in window && window.BarcodeDetector) {
          try {
            const detector = new window.BarcodeDetector({ formats: RETAIL_NATIVE_FORMATS });
            useNativeEngine = true;

            let lastFrameTime = 0;
            const processNativeFrame = async (timestamp: number) => {
              if (!isMounted) return;

              // Only perform active detection while isScanningActive is true
              if (isScanningActiveRef.current && timestamp - lastFrameTime >= 33) {
                lastFrameTime = timestamp;
                try {
                  if (videoEl.readyState >= 2) {
                    const barcodes = await detector.detect(videoEl);
                    if (barcodes && barcodes.length > 0) {
                      for (const b of barcodes) {
                        if (b.rawValue && b.rawValue.trim().length >= 3) {
                          handleScanResultRef.current(b.rawValue);
                          break;
                        }
                      }
                    }
                  }
                } catch {
                  // Frame fallback
                }
              }

              if (isMounted) {
                frameCallbackIdRef.current = requestAnimationFrame(processNativeFrame);
              }
            };

            frameCallbackIdRef.current = requestAnimationFrame(processNativeFrame);
          } catch {
            useNativeEngine = false;
          }
        }

        if (!useNativeEngine) {
          const hints = new Map();
          hints.set(DecodeHintType.POSSIBLE_FORMATS, RETAIL_ZXING_FORMATS);
          hints.set(DecodeHintType.TRY_HARDER, true);

          const codeReader = new BrowserMultiFormatReader(hints);

          // Wait until the video element actually has frames before starting ZXing.
          // Without this, every decode attempt throws "Could not create a Canvas element"
          // (the warning spam seen in camera-less previews).
          await new Promise<void>((resolve) => {
            const v = videoEl;
            if (v.readyState >= 2 && v.videoWidth > 0) return resolve();
            const to = window.setTimeout(() => {
              v.onloadeddata = null;
              resolve();
            }, 3000);
            v.onloadeddata = () => {
              window.clearTimeout(to);
              resolve();
            };
          });

          const controls = await codeReader.decodeFromStream(
            stream,
            videoEl,
            (result, err) => {
              if (!isMounted || !isScanningActiveRef.current) return;
              if (result) {
                const text = result.getText();
                if (text && text.trim().length >= 3) {
                  handleScanResultRef.current(text);
                }
              }
              // Per-frame misses are normal (no barcode in view) — stay silent.
              // Never console.warn here: ZXing already logs genuine faults itself.
            }
          );

          controlsRef.current = controls;
        }
      } catch (err: unknown) {
        if (!isMounted) return;
        setHasCamera(false);
        const e = err as { name?: string; message?: string };
        if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
          setCameraError('Camera access was denied. Please allow camera permissions or upload a barcode image.');
        } else if (e.name === 'NotFoundError' || e.name === 'DevicesNotFoundError') {
          setCameraError('No camera found on this device. You can upload a photo of the barcode below.');
        } else {
          setCameraError(e.message || 'Unable to access camera.');
        }
      }
    }

    startScannerPipeline();

    return () => {
      isMounted = false;
      isScanningActiveRef.current = false;
      if (controlsRef.current) {
        controlsRef.current.stop();
        controlsRef.current = null;
      }
      if (frameCallbackIdRef.current !== null) {
        cancelAnimationFrame(frameCallbackIdRef.current);
        frameCallbackIdRef.current = null;
      }
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
        videoRef.current.srcObject = null;
      }
    };
  }, [isOpen, facingMode]);

  const toggleTorch = async () => {
    if (!videoRef.current || !videoRef.current.srcObject) return;
    const stream = videoRef.current.srcObject as MediaStream;
    const track = stream.getVideoTracks()[0];
    if (!track) return;

    const nextState = !torchOn;
    await applyTrackConstraint(track, { torch: nextState });
    setTorchOn(nextState);
  };

  const toggleZoom = async () => {
    if (!videoRef.current || !videoRef.current.srcObject) return;
    const stream = videoRef.current.srcObject as MediaStream;
    const track = stream.getVideoTracks()[0];
    if (!track) return;

    const nextZoom = zoomLevel === 1 ? Math.min(2, maxZoom) : 1;
    await applyTrackConstraint(track, { zoom: nextZoom });
    setZoomLevel(nextZoom);
  };

  const toggleFacingMode = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  const handleViewfinderTap = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setFocusTapPos({ x, y });
    setTimeout(() => setFocusTapPos(null), 900);

    // Also trigger scan session on tap
    triggerScanSession();
  };

  const handleFileScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      if (typeof window !== 'undefined' && 'BarcodeDetector' in window && window.BarcodeDetector) {
        try {
          const detector = new window.BarcodeDetector({ formats: RETAIL_NATIVE_FORMATS });
          const imgBitmap = await createImageBitmap(file);
          const barcodes = await detector.detect(imgBitmap);
          if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
            isScanningActiveRef.current = true;
            handleScanResult(barcodes[0].rawValue);
            return;
          }
        } catch {
          // fallback
        }
      }

      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const imgUrl = reader.result as string;
          const hints = new Map();
          hints.set(DecodeHintType.POSSIBLE_FORMATS, RETAIL_ZXING_FORMATS);
          hints.set(DecodeHintType.TRY_HARDER, true);

          const multiReader = new BrowserMultiFormatReader(hints);
          const result = await multiReader.decodeFromImageUrl(imgUrl);
          if (result && result.getText()) {
            isScanningActiveRef.current = true;
            handleScanResult(result.getText());
          } else {
            setCameraError('No clear barcode detected in photo. Please ensure barcode is sharp.');
          }
        } catch {
          setCameraError('No barcode found in this image. Try taking a closer, sharper photo.');
        }
      };
      reader.readAsDataURL(file);
    } catch {
      setCameraError('Could not process selected image.');
    }
  };

  // Category statistics & list of all categories
  const categoryStats = useMemo(() => {
    const counts: Record<string, number> = {};
    products.forEach((p) => {
      const cat = (p.category || 'General').trim();
      counts[cat] = (counts[cat] || 0) + 1;
    });

    const set = new Set<string>();
    // Add all categories that exist in products first
    Object.keys(counts).forEach((c) => set.add(c));
    // Add standard categories
    STANDARD_CATEGORIES.forEach((c) => set.add(c));

    return Array.from(set)
      .map((catName) => ({
        name: catName,
        count: counts[catName] || 0,
      }))
      .sort((a, b) => {
        // Categories with products come first, then alphabetical
        if (a.count > 0 && b.count === 0) return -1;
        if (a.count === 0 && b.count > 0) return 1;
        return a.name.localeCompare(b.name);
      });
  }, [products]);

  // Counts for the barcode presence filter
  const barcodeFilterCounts = useMemo(() => {
    const all = products.length;
    const withBarcode = products.filter((p) => Boolean(p.sku && p.sku.trim().length > 0)).length;
    const withoutBarcode = all - withBarcode;
    return { all, withBarcode, withoutBarcode };
  }, [products]);

  // Filtered products based on search input, barcode filter, and multiple categories
  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const hasCategoryFilter = selectedCategories.length > 0;

    return products.filter((p) => {
      const hasBarcode = Boolean(p.sku && p.sku.trim().length > 0);
      if (barcodeFilter === 'with-barcode' && !hasBarcode) return false;
      if (barcodeFilter === 'without-barcode' && hasBarcode) return false;

      if (hasCategoryFilter) {
        const prodCat = (p.category || 'General').trim().toLowerCase();
        const matchesCat = selectedCategories.some(
          (cat) => cat.trim().toLowerCase() === prodCat
        );
        if (!matchesCat) return false;
      }

      if (q) {
        const nameMatch = p.name.toLowerCase().includes(q);
        const catMatch = p.category ? p.category.toLowerCase().includes(q) : false;
        const skuMatch = p.sku ? p.sku.toLowerCase().includes(q) : false;
        return nameMatch || catMatch || skuMatch;
      }
      return true;
    });
  }, [products, searchQuery, barcodeFilter, selectedCategories]);

  // Toggle category selection for multi-select
  const handleToggleCategory = useCallback((catName: string) => {
    setSelectedCategories((prev) => {
      const exists = prev.some((c) => c.toLowerCase() === catName.toLowerCase());
      if (exists) {
        return prev.filter((c) => c.toLowerCase() !== catName.toLowerCase());
      } else {
        return [...prev, catName];
      }
    });
  }, []);

  // Add a product to the cart (accumulates with barcodes scanned in "Barcode" view)
  const handleAddProductToCart = useCallback(
    (product: Product) => {
      const {
        onItemScanned: currentOnItemScanned,
        onScanSuccess: currentOnScanSuccess,
        onClose: currentOnClose,
      } = propsRef.current;

      // In inventory mode: selecting a product
      if (isInventoryMode) {
        if (product.sku) {
          if (currentOnItemScanned) currentOnItemScanned(product);
          if (currentOnScanSuccess) currentOnScanSuccess(product.sku);
          currentOnClose();
        } else {
          setScanToast({
            id: Date.now(),
            type: 'warning',
            title: product.name,
            subtitle: 'This product has no barcode assigned',
          });
          if (toastDismissTimerRef.current) clearTimeout(toastDismissTimerRef.current);
          toastDismissTimerRef.current = window.setTimeout(() => setScanToast(null), 2500);
        }
        return;
      }

      // Stock validation in Sales mode: prevent adding out-of-stock items or exceeding inventory
      if (product.stock <= 0) {
        setScanToast({
          id: Date.now(),
          type: 'warning',
          title: product.name,
          subtitle: 'Out of stock (0 available)',
        });
        if (toastDismissTimerRef.current) clearTimeout(toastDismissTimerRef.current);
        toastDismissTimerRef.current = window.setTimeout(() => setScanToast(null), 2500);
        return;
      }

      const existingIdx = scannedCart.findIndex((item) => item.productId === product.id);
      if (existingIdx >= 0 && scannedCart[existingIdx].quantity >= product.stock) {
        setScanToast({
          id: Date.now(),
          type: 'warning',
          title: product.name,
          subtitle: `Max stock reached (${product.stock} in stock)`,
        });
        if (toastDismissTimerRef.current) clearTimeout(toastDismissTimerRef.current);
        toastDismissTimerRef.current = window.setTimeout(() => setScanToast(null), 2500);
        return;
      }

      playBeep();
      if (currentOnItemScanned) {
        currentOnItemScanned(product);
      }

      let updatedCart: SaleItem[];
      if (existingIdx >= 0) {
        updatedCart = [...scannedCart];
        updatedCart[existingIdx] = {
          ...updatedCart[existingIdx],
          quantity: updatedCart[existingIdx].quantity + 1,
        };
      } else {
        updatedCart = [
          ...scannedCart,
          {
            productId: product.id,
            name: product.name,
            unitPrice: product.price,
            quantity: 1,
            category: product.category,
          },
        ];
      }

      pushHistory(updatedCart, unrecognizedBarcode, product.name);

      setScanToast({
        id: Date.now(),
        type: 'success',
        title: product.name,
        subtitle: `₱${product.price.toFixed(2)} • Added to cart`,
      });

      if (toastDismissTimerRef.current) {
        clearTimeout(toastDismissTimerRef.current);
      }
      toastDismissTimerRef.current = window.setTimeout(() => {
        setScanToast(null);
      }, 2000);
    },
    [isInventoryMode, playBeep, scannedCart, unrecognizedBarcode, pushHistory]
  );

  // Decrement a product in the cart or remove if quantity reaches 0
  const handleDecrementProductInCart = useCallback(
    (productId: string) => {
      const existingIdx = scannedCart.findIndex((item) => item.productId === productId);
      if (existingIdx < 0) return;

      const item = scannedCart[existingIdx];
      let updatedCart: SaleItem[];
      if (item.quantity > 1) {
        updatedCart = [...scannedCart];
        updatedCart[existingIdx] = {
          ...updatedCart[existingIdx],
          quantity: updatedCart[existingIdx].quantity - 1,
        };
      } else {
        updatedCart = scannedCart.filter((i) => i.productId !== productId);
      }

      pushHistory(updatedCart, unrecognizedBarcode, `Decremented ${item.name}`);
    },
    [scannedCart, unrecognizedBarcode, pushHistory]
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          id="barcode-scanner-modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 w-full h-full flex flex-col select-none bg-black overflow-hidden"
        >
          {/* Always-mounted Background Camera Video so stream is never interrupted */}
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="absolute inset-0 w-full h-full object-cover pointer-events-none bg-black"
          />

          {/* In-Modal Toaster using Navy Blue Format, strictly hugging text width */}
          <AnimatePresence>
            {scanToast && (
              <motion.div
                key={scanToast.id}
                initial={{ opacity: 0, y: -14, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="absolute top-4 sm:top-5 left-0 right-0 mx-auto z-50 pointer-events-none w-fit max-w-[calc(100vw-32px)] px-3.5 py-2 rounded-[14px] bg-[#0F172A] text-white shadow-[0_8px_24px_-4px_rgba(15,23,42,0.45)] border border-slate-700/50 flex items-center gap-2 select-none whitespace-nowrap"
              >
                <div
                  className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${
                    scanToast.type === 'success'
                      ? 'text-[#4ADE80]'
                      : scanToast.type === 'warning'
                      ? 'text-[#FBBF24]'
                      : 'text-[#38BDF8]'
                  }`}
                >
                  {scanToast.type === 'success' ? (
                    <Check size={14} strokeWidth={2.8} />
                  ) : scanToast.type === 'warning' ? (
                    <AlertCircle size={14} strokeWidth={2.5} />
                  ) : (
                    <ScanLine size={14} strokeWidth={2.5} />
                  )}
                </div>
                <div className="w-fit flex flex-col leading-tight">
                  <span className="text-[13px] font-semibold text-white whitespace-nowrap">
                    {scanToast.title}
                  </span>
                  {scanToast.subtitle && (
                    <span className="text-[11px] font-medium text-[#CBD5E1] whitespace-nowrap mt-0.5">
                      {scanToast.subtitle}
                    </span>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Transition between Key and Barcode camera views (no sliding animation) */}
          <AnimatePresence mode="wait" initial={false}>
            {inputMethod === 'key' ? (
              /* INVENTORY SELECTION "KEY" VIEW (Full Page) */
              <motion.div
                key="manual-key"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                className="relative z-10 w-full h-full flex-1 flex flex-col bg-[#F7F9FB] text-[#252825] overflow-hidden select-none"
              >
                {/* Sticky Header with Left-Aligned Title, Curvy Search Bar, and Filter Buttons (matching Inventory page) */}
                <header
                  className="sticky top-0 z-30 w-full bg-[#f7f9fb]/90 backdrop-blur-md border-b border-transparent select-none shrink-0"
                  style={{
                    paddingTop: 'calc(var(--safe-area-top, env(safe-area-inset-top, 0px)) + 10px)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                  }}
                >
                  <div className="px-4 sm:px-5 pt-2 pb-3.5 space-y-3.5">
                    {/* Top Row: Left-Aligned Title + Close Button */}
                    <div className="flex items-center justify-between pb-0.5">
                      <div className="flex items-center gap-2.5">
                        <button
                          type="button"
                          onClick={onClose}
                          className="p-1 text-[#202522] hover:text-[#68716C] flex items-center justify-center transition-colors cursor-pointer"
                          aria-label="Close"
                        >
                          <X size={20} strokeWidth={2} />
                        </button>
                        <div>
                          <h2 className="text-[22px] sm:text-[24px] font-bold text-[#252825] tracking-tight text-left leading-tight">
                            {isInventoryMode ? 'Select Product' : 'Product Inventory'}
                          </h2>
                        </div>
                      </div>
                    </div>

                    {/* Search Row with inside Filter Button */}
                    <div className="relative">
                      <Search
                        size={19}
                        className="absolute left-4 top-1/2 -translate-y-1/2 text-[#717671] pointer-events-none"
                      />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search products, barcodes, category..."
                        className="w-full h-12 pl-11.5 pr-22 bg-white border border-[#DEE3DE] rounded-full text-[14px] text-[#252825] placeholder:text-[#8E948F] focus:outline-none focus:border-[#2F7D32] focus:ring-2 focus:ring-[#2F7D32]/25 transition-all shadow-2xs"
                      />
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                        {searchQuery.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setSearchQuery('')}
                            className="w-6.5 h-6.5 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center cursor-pointer transition-colors"
                            aria-label="Clear search"
                          >
                            <X size={13} />
                          </button>
                        )}
                        <button
                          type="button"
                          id="search-category-filter-button"
                          onClick={() => setIsCategoryFilterOpen(true)}
                          className={`w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer relative ${
                            selectedCategories.length > 0 || isCategoryFilterOpen
                              ? 'bg-[#2F7D32] text-white shadow-xs'
                              : 'text-[#68716C] hover:text-[#202522] hover:bg-[#F2F4F2]'
                          }`}
                          aria-label="Filter by categories"
                          title="Filter by categories"
                        >
                          <SlidersHorizontal size={18} strokeWidth={2.3} />
                        </button>
                      </div>
                    </div>

                    {/* Filter Tabs / Buttons: Seen completely without horizontal scroll, increased height, smooth tween transition, no number badges */}
                    <nav
                      aria-label="Product filter options"
                      className="grid grid-cols-[0.8fr_1.1fr_1.1fr] gap-1.5 sm:gap-2 w-full pt-0.5 pb-0.5 select-none"
                    >
                      {[
                        { id: 'all' as const, label: 'All' },
                        { id: 'with-barcode' as const, label: 'With barcodes' },
                        { id: 'without-barcode' as const, label: 'Without barcodes' },
                      ].map((filter) => {
                        const isSelected = barcodeFilter === filter.id;
                        return (
                          <button
                            key={filter.id}
                            id={`key-filter-${filter.id}`}
                            type="button"
                            onClick={() => setBarcodeFilter(filter.id)}
                            className="relative h-9.5 sm:h-10 px-1 sm:px-2 rounded-full text-[12px] min-[390px]:text-[12.5px] sm:text-[13px] font-medium whitespace-nowrap cursor-pointer flex items-center justify-center border border-[#DEE3DE] bg-white focus:outline-none"
                          >
                            {isSelected && (
                              <motion.div
                                layoutId="key-barcode-filter-active-pill"
                                className="absolute -inset-px bg-[#2F7D32] rounded-full shadow-xs"
                                transition={{
                                  type: 'tween',
                                  ease: [0.25, 0.1, 0.25, 1],
                                  duration: 0.2,
                                }}
                              />
                            )}
                            <span
                              className={`relative z-10 transition-colors duration-150 text-center ${
                                isSelected ? 'text-white' : 'text-[#6E746F] hover:text-[#252825]'
                              }`}
                            >
                              {filter.label}
                            </span>
                          </button>
                        );
                      })}
                    </nav>
                  </div>
                </header>

                {/* Available Products Grid (card layout matching user reference) */}
                <div
                  className="flex-1 overflow-y-auto px-4 py-3"
                  style={{
                    paddingBottom: 'calc(10rem + env(safe-area-inset-bottom, 0px))',
                  }}
                >
                  {filteredProducts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                      <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center text-gray-400 mb-3">
                        <Search size={22} strokeWidth={2} />
                      </div>
                      <p className="text-[15px] font-semibold text-[#252825]">No matching products</p>
                      <p className="text-[13px] text-[#717671] mt-1 max-w-xs">
                        Try changing your search keywords or choosing "All" to view every product in your inventory.
                      </p>
                      {(searchQuery || barcodeFilter !== 'all' || selectedCategories.length > 0) && (
                        <button
                          type="button"
                          onClick={() => {
                            setSearchQuery('');
                            setBarcodeFilter('all');
                            setSelectedCategories([]);
                          }}
                          className="mt-4 px-4 py-2 rounded-xl bg-[#F2F4F2] hover:bg-[#E5E9E5] text-[#252825] text-[13px] font-semibold cursor-pointer transition-colors"
                        >
                          Clear filters
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-3.5">
                      {filteredProducts.map((p) => {
                        const cartItem = scannedCart.find((i) => i.productId === p.id);
                        const qty = cartItem ? cartItem.quantity : 0;
                        const imgSrc = p.imageUrl || images[p.id];
                        const isOutOfStock = !isInventoryMode && p.stock <= 0;
                        const isMaxReached = !isInventoryMode && qty >= p.stock;

                        return (
                          <div
                            key={p.id}
                            id={`key-product-card-${p.id}`}
                            onClick={() => !isOutOfStock && handleAddProductToCart(p)}
                            className={`group bg-white rounded-2xl border transition-all flex flex-col overflow-hidden select-none ${
                              isOutOfStock
                                ? 'opacity-60 border-[#DEE3DE] cursor-not-allowed bg-gray-50/40'
                                : qty > 0
                                ? 'border-[#2F7D32] shadow-xs ring-1 ring-[#2F7D32] cursor-pointer'
                                : 'border-[#DEE3DE] hover:border-[#2F7D32]/50 shadow-2xs hover:shadow-xs active:scale-[0.99] cursor-pointer'
                            }`}
                          >
                            {/* Top Product Photo Container (prominent picture centered on clean white canvas) */}
                            <div className="relative w-full aspect-square bg-white flex items-center justify-center p-3.5 overflow-hidden">
                              <ProductCardImage src={imgSrc} alt={p.name} />

                              {/* Stock Warning Badge if Low/Out */}
                              {p.stock <= p.lowStockThreshold && (
                                <span
                                  className={`absolute top-2 left-2 text-[10px] font-semibold px-2 py-0.5 rounded-md shadow-2xs ${
                                    p.stock <= 0
                                      ? 'bg-red-50 text-red-700 border border-red-200/60'
                                      : 'bg-amber-50 text-amber-800 border border-amber-200/60'
                                  }`}
                                >
                                  {p.stock <= 0 ? 'Out of stock' : `${p.stock} left`}
                                </span>
                              )}

                              {/* Cart Quantity Badge (Pop-up number with green container & crisp white ring) */}
                              {qty > 0 && (
                                <span className="absolute top-2 right-2 min-w-[22px] h-[22px] px-1.5 rounded-full bg-[#2F7D32] text-white text-[11px] font-bold flex items-center justify-center shadow-sm ring-2 ring-white animate-in zoom-in-75 duration-150">
                                  {qty}
                                </span>
                              )}
                            </div>

                            {/* Subtle Divider Line (matches user's reference) */}
                            <div className="w-full border-t border-[#F0F2F0]" />

                            {/* Bottom Info & Inline Price + Small Add Button */}
                            <div className="p-3 flex flex-col justify-between flex-1 gap-2">
                              <div>
                                <h3
                                  className="text-[13.5px] sm:text-[14.5px] font-semibold text-[#252825] truncate leading-tight"
                                  title={p.name}
                                >
                                  {p.name}
                                </h3>
                                {p.category && (
                                  <p className="text-[11px] text-[#717671] truncate mt-0.5">
                                    {p.category}
                                  </p>
                                )}
                              </div>

                              {/* In-line Price & Small Add Button */}
                              <div
                                className="flex items-center justify-between gap-1.5 pt-0.5"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <span className="text-[13.5px] sm:text-[14.5px] font-bold text-[#252825] tabular-nums whitespace-nowrap">
                                  ₱{p.price.toFixed(2)}
                                </span>

                                {!isInventoryMode ? (
                                  isOutOfStock ? (
                                    <span className="text-[10.5px] font-semibold text-red-600 bg-red-50 border border-red-200/60 px-2 py-0.5 rounded-full">
                                      Out
                                    </span>
                                  ) : qty > 0 ? (
                                    <div className="flex items-center gap-1 shrink-0">
                                      <button
                                        type="button"
                                        onClick={() => handleDecrementProductInCart(p.id)}
                                        className="w-6 h-6 rounded-full bg-white hover:bg-gray-100 text-[#252825] flex items-center justify-center cursor-pointer transition-colors active:scale-95 border border-[#DEE3DE] shadow-2xs"
                                        aria-label={`Decrease ${p.name}`}
                                      >
                                        <Minus size={11} strokeWidth={2.5} />
                                      </button>
                                      <span className="w-4.5 text-center text-[12px] font-bold text-[#252825] tabular-nums">
                                        {qty}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => handleAddProductToCart(p)}
                                        disabled={isMaxReached}
                                        className="w-6 h-6 rounded-full bg-[#2F7D32] hover:bg-[#256B29] disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center cursor-pointer transition-colors active:scale-95 shadow-2xs"
                                        aria-label={`Increase ${p.name}`}
                                      >
                                        <Plus size={11} strokeWidth={2.5} />
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleAddProductToCart(p)}
                                      disabled={isOutOfStock}
                                      className="w-7 h-7 rounded-full bg-[#2F7D32] hover:bg-[#256B29] disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center transition-all cursor-pointer active:scale-95 shadow-2xs shrink-0"
                                      aria-label={`Add ${p.name}`}
                                    >
                                      <Plus size={14} strokeWidth={2.5} />
                                    </button>
                                  )
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleAddProductToCart(p)}
                                    className="w-7 h-7 rounded-full bg-[#2F7D32] hover:bg-[#256B29] text-white flex items-center justify-center transition-all cursor-pointer active:scale-95 shadow-2xs shrink-0"
                                    aria-label={`Select ${p.name}`}
                                  >
                                    <Plus size={14} strokeWidth={2.5} />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Bottom Floating Bar: Summary & Checkout + Switcher */}
                <div
                  className="absolute bottom-0 left-0 right-0 z-30 flex flex-col items-center gap-3.5 sm:gap-4 px-4 pt-6 bg-gradient-to-t from-[#F7F9FB] via-[#F7F9FB]/95 to-transparent pointer-events-none"
                  style={{
                    paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))',
                  }}
                >
                  {/* Floating Checkout Summary Bar (Sales Mode only) */}
                  {!isInventoryMode && totalQuantity > 0 && (
                    <div className="relative w-full max-w-[250px] sm:max-w-[270px] h-[54px] sm:h-[56px] flex items-center justify-between pl-4 sm:pl-4.5 pr-0 bg-[#EEF2F4] backdrop-blur-md rounded-full border border-[#DAE1E4] shadow-lg text-[#202522] pointer-events-auto">
                      <div className="flex flex-col text-left leading-tight py-0.5 min-w-0 pr-2">
                        <span className="text-[11px] text-[#586265] font-normal whitespace-nowrap">
                          {totalQuantity} {totalQuantity === 1 ? 'item' : 'items'} in cart
                        </span>
                        <span className="text-[15px] font-bold text-[#202522] tracking-tight">
                          ₱{totalAmount.toFixed(2)}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={handleCheckout}
                        aria-label="Proceed to checkout"
                        className="-mr-2.5 sm:-mr-3 w-[82px] sm:w-[90px] h-[58px] sm:h-[62px] rounded-full bg-white hover:bg-[#F2F4F2] active:bg-[#E5EAE6] text-[#202522] flex items-center justify-center shadow-[0_4px_18px_rgba(0,0,0,0.16)] active:scale-95 transition-all cursor-pointer z-10 shrink-0 select-none overflow-hidden relative"
                      >
                        <div className="absolute inset-0 m-auto w-[88px] h-[88px] sm:w-[98px] sm:h-[98px] flex items-center justify-center pointer-events-none shrink-0 origin-center scale-[1.65] -translate-y-2.5">
                          <LottieAnimation
                            animationData={shoppingCartData}
                            loop={true}
                            autoplay={true}
                            className="w-full h-full flex items-center justify-center"
                          />
                        </div>
                      </button>
                    </div>
                  )}

                  {/* Switcher Buttons: "Barcode" and "All products" (Sales Mode only) */}
                  {!isInventoryMode && (
                    <div className="flex items-center justify-center gap-3 pointer-events-auto">
                      <button
                        type="button"
                        onClick={() => handleSwitchInputMethod('barcode')}
                        className="w-28 sm:w-30 h-14 rounded-2xl bg-white hover:bg-[#F2F4F2] text-[#4B524D] border border-[#DEE3DE] shadow-xs flex flex-col items-center justify-center gap-1 font-semibold text-[13px] transition-all cursor-pointer select-none"
                      >
                        <ScanLine size={18} strokeWidth={2.3} />
                        <span>Barcode</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSwitchInputMethod('key')}
                        className="w-28 sm:w-30 h-14 rounded-2xl bg-[#2F7D32] text-white shadow-[0_4px_16px_rgba(47,125,50,0.38)] flex flex-col items-center justify-center gap-1 font-semibold text-[12.5px] sm:text-[13px] transition-all cursor-pointer select-none px-2"
                      >
                        <Package size={18} strokeWidth={2.2} />
                        <span className="whitespace-nowrap">All products</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Category Selection Pop-up Modal */}
                <AnimatePresence>
                  {isCategoryFilterOpen && (
                    <div
                      id="barcode-category-modal-overlay"
                      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs select-none"
                      onClick={() => setIsCategoryFilterOpen(false)}
                    >
                      <motion.div
                        initial={{ opacity: 0, scale: 0.94, y: 12 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.94, y: 12 }}
                        transition={{ duration: 0.18, ease: 'easeOut' }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl border border-[#DEE3DE] flex flex-col max-h-[80vh]"
                      >
                        {/* Modal Top Header with Title and X button */}
                        <div className="flex items-center justify-between pb-3.5 border-b border-[#F0F2F0]">
                          <div>
                            <h3 className="text-[17px] font-bold text-[#202522]">Categories</h3>
                            <p className="text-[12px] text-[#68716C] mt-0.5">
                              Select one or more categories
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setIsCategoryFilterOpen(false)}
                            className="w-8 h-8 rounded-full bg-[#F2F4F2] hover:bg-[#E5E9E5] text-[#202522] flex items-center justify-center transition-colors cursor-pointer"
                            aria-label="Close categories"
                          >
                            <X size={17} strokeWidth={2.2} />
                          </button>
                        </div>

                        {/* Scrollable Categories List */}
                        <div className="flex-1 overflow-y-auto py-3 space-y-1.5 pr-1 max-h-[55vh]">
                          {/* All Categories Option */}
                          <button
                            type="button"
                            onClick={() => setSelectedCategories([])}
                            className={`w-full px-3.5 py-2.5 rounded-2xl text-[13.5px] font-medium transition-all cursor-pointer flex items-center justify-between ${
                              selectedCategories.length === 0
                                ? 'bg-[#2F7D32] text-white font-semibold shadow-xs'
                                : 'bg-[#F7F9FB] hover:bg-[#F2F4F2] text-[#202522] border border-[#DEE3DE]/60'
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <div
                                className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                                  selectedCategories.length === 0
                                    ? 'bg-white text-[#2F7D32]'
                                    : 'border border-[#DEE3DE] bg-white'
                                }`}
                              >
                                {selectedCategories.length === 0 && (
                                  <Check size={13} strokeWidth={3} />
                                )}
                              </div>
                              <span>All categories</span>
                            </div>
                            <span
                              className={`text-[11.5px] px-2 py-0.5 rounded-full font-bold ${
                                selectedCategories.length === 0
                                  ? 'bg-white/20 text-white'
                                  : 'bg-white text-[#68716C] border border-[#DEE3DE]'
                              }`}
                            >
                              {products.length}
                            </span>
                          </button>

                          {/* Each Category Option with green container when selected */}
                          {categoryStats.map((cat) => {
                            const isSelected = selectedCategories.some(
                              (c) => c.toLowerCase() === cat.name.toLowerCase()
                            );
                            return (
                              <button
                                key={cat.name}
                                type="button"
                                onClick={() => handleToggleCategory(cat.name)}
                                className={`w-full px-3.5 py-2.5 rounded-2xl text-[13.5px] font-medium transition-all cursor-pointer flex items-center justify-between ${
                                  isSelected
                                    ? 'bg-[#2F7D32] text-white font-semibold shadow-xs'
                                    : 'bg-[#F7F9FB] hover:bg-[#F2F4F2] text-[#202522] border border-[#DEE3DE]/60'
                                }`}
                              >
                                <div className="flex items-center gap-2.5">
                                  <div
                                    className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                                      isSelected
                                        ? 'bg-white text-[#2F7D32]'
                                        : 'border border-[#DEE3DE] bg-white'
                                    }`}
                                  >
                                    {isSelected && <Check size={13} strokeWidth={3} />}
                                  </div>
                                  <span>{cat.name}</span>
                                </div>
                                {cat.count > 0 && (
                                  <span
                                    className={`text-[11.5px] px-2 py-0.5 rounded-full font-bold ${
                                      isSelected
                                        ? 'bg-white/20 text-white'
                                        : 'bg-white text-[#68716C] border border-[#DEE3DE]'
                                    }`}
                                  >
                                    {cat.count}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>

                        {/* Modal Footer with Selection Status & Apply Button */}
                        <div className="pt-3 border-t border-[#F0F2F0] flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[12px] text-[#68716C] truncate">
                              {selectedCategories.length === 0
                                ? 'Showing all categories'
                                : `${selectedCategories.length} selected`}
                            </span>
                            {selectedCategories.length > 0 && (
                              <button
                                type="button"
                                onClick={() => setSelectedCategories([])}
                                className="text-[12px] font-medium text-[#68716C] hover:text-[#202522] hover:underline cursor-pointer"
                              >
                                Reset
                              </button>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => setIsCategoryFilterOpen(false)}
                            className="px-5 py-2 rounded-full bg-[#2F7D32] hover:bg-[#256B29] active:bg-[#1E5A22] text-white text-[13px] font-bold shadow-[0_4px_14px_rgba(47,125,50,0.2)] transition-all cursor-pointer shrink-0"
                          >
                            Done
                          </button>
                        </div>
                      </motion.div>
                    </div>
                  )}
                </AnimatePresence>
              </motion.div>
            ) : (
              /* LIVE CAMERA BARCODE SCANNER VIEW (Full Page) */
              <motion.div
                key="camera-barcode"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                className="relative z-10 flex-1 w-full h-full bg-black/20 overflow-hidden flex flex-col justify-between cursor-pointer pt-[max(var(--safe-area-top,env(safe-area-inset-top)),16px)] pb-[max(var(--safe-area-bottom,env(safe-area-inset-bottom)),16px)]"
                onClick={handleViewfinderTap}
              >
                {/* Floating Top Header (Close on left, Controls on right) */}
                <div
                  className="relative p-3.5 flex items-center justify-between z-30"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center gap-2">
                    {/* Circular Translucent Close Button matching upload button format */}
                    <button
                      type="button"
                      onClick={onClose}
                      className="w-9 h-9 rounded-full bg-black/45 hover:bg-black/65 text-white flex items-center justify-center backdrop-blur-md transition-all cursor-pointer"
                      aria-label="Close scanner"
                    >
                      <X size={15} strokeWidth={2.4} />
                    </button>
                    {isInventoryMode && (
                      <span className="px-3 py-1 rounded-full bg-black/45 text-white/95 text-[12px] font-semibold backdrop-blur-md">
                        {title || 'Scan Product Barcode'}
                      </span>
                    )}
                  </div>

                  {/* Top Right Controls */}
                  <div className="flex items-center gap-2">
                    {torchAvailable && (
                      <button
                        type="button"
                        onClick={toggleTorch}
                        className={`w-9 h-9 rounded-full flex items-center justify-center backdrop-blur-md transition-all cursor-pointer ${
                          torchOn ? 'bg-[#22C55E] text-white shadow-md' : 'bg-black/45 text-white hover:bg-black/65'
                        }`}
                        aria-label="Toggle Flash"
                      >
                        {torchOn ? <Zap size={15} /> : <ZapOff size={15} />}
                      </button>
                    )}
                    {zoomAvailable && (
                      <button
                        type="button"
                        onClick={toggleZoom}
                        className="w-9 h-9 rounded-full bg-black/45 hover:bg-black/65 text-white flex items-center justify-center backdrop-blur-md transition-all cursor-pointer"
                        aria-label="Toggle Zoom"
                      >
                        {zoomLevel === 1 ? <ZoomIn size={15} /> : <ZoomOut size={15} />}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={toggleFacingMode}
                      className="w-9 h-9 rounded-full bg-black/45 hover:bg-black/65 text-white flex items-center justify-center backdrop-blur-md transition-all cursor-pointer"
                      aria-label="Flip Camera"
                    >
                      <FlipHorizontal size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-9 h-9 rounded-full bg-black/45 hover:bg-black/65 text-white flex items-center justify-center backdrop-blur-md transition-all cursor-pointer"
                      aria-label="Upload Barcode Photo"
                    >
                      <Upload size={15} />
                    </button>
                  </div>
                </div>

                {/* Tap-to-Focus Indicator */}
                {focusTapPos && (
                  <div
                    className="absolute w-14 h-14 -ml-7 -mt-7 rounded-full border border-white/80 animate-ping pointer-events-none z-20"
                    style={{ left: focusTapPos.x, top: focusTapPos.y }}
                  />
                )}

                {/* Center Viewfinder Reticle with Reference Rounded White Corners */}
                <div
                  className="relative z-20 flex items-center justify-center my-auto pointer-events-none"
                  style={{ visibility: hasCamera === true ? 'visible' : 'hidden' }}
                >
                  <div className="relative w-64 h-80 sm:w-72 sm:h-92 flex items-center justify-center transition-all duration-200">
                    {/* 4 Floating Rounded Corner Brackets in Pure White (Layered on top with z-30) */}
                    <svg
                      className="absolute top-0 left-0 w-10 h-10 pointer-events-none z-30"
                      viewBox="0 0 40 40"
                      fill="none"
                    >
                      <path
                        d="M4 36V16C4 9.37 9.37 4 16 4H36"
                        stroke="white"
                        strokeWidth="3.5"
                        strokeLinecap="round"
                      />
                    </svg>
                    <svg
                      className="absolute top-0 right-0 w-10 h-10 pointer-events-none z-30"
                      viewBox="0 0 40 40"
                      fill="none"
                    >
                      <path
                        d="M4 4H24C30.63 4 36 9.37 36 16V36"
                        stroke="white"
                        strokeWidth="3.5"
                        strokeLinecap="round"
                      />
                    </svg>
                    <svg
                      className="absolute bottom-0 left-0 w-10 h-10 pointer-events-none z-30"
                      viewBox="0 0 40 40"
                      fill="none"
                    >
                      <path
                        d="M4 4V24C4 30.63 9.37 36 16 36H36"
                        stroke="white"
                        strokeWidth="3.5"
                        strokeLinecap="round"
                      />
                    </svg>
                    <svg
                      className="absolute bottom-0 right-0 w-10 h-10 pointer-events-none z-30"
                      viewBox="0 0 40 40"
                      fill="none"
                    >
                      <path
                        d="M4 36H24C30.63 36 36 30.63 36 24V4"
                        stroke="white"
                        strokeWidth="3.5"
                        strokeLinecap="round"
                      />
                    </svg>

                    {/* Dedicated Inner Scan Chamber (Strictly contained within corners without overlapping) */}
                    <div className="absolute inset-y-3.5 inset-x-3.5 overflow-hidden pointer-events-none z-10">
                      {/* CamScanner Style Bidirectional Scan (Red Edition) */}
                      <div
                        className={`absolute inset-x-1 -translate-y-1/2 pointer-events-none ${
                          isScanningActive ? 'animate-camscanner-sweep-fast' : 'animate-camscanner-sweep'
                        }`}
                      >
                        {/* Downward Sweep Trailing Curtain (Separated cleanly ABOVE the red line) */}
                        <div
                          className={`absolute bottom-full mb-[2px] inset-x-0 h-28 sm:h-36 bg-gradient-to-t from-red-500/30 via-red-500/10 to-transparent overflow-hidden rounded-t-sm ${
                            isScanningActive ? 'animate-curtain-down-fast' : 'animate-curtain-down'
                          }`}
                        >
                          {/* Subtle Horizontal Digital Scanlines */}
                          <div
                            className="absolute inset-0 opacity-20"
                            style={{
                              backgroundImage:
                                'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(239, 68, 68, 0.4) 3px, rgba(239, 68, 68, 0.4) 4px)',
                            }}
                          />
                        </div>

                        {/* Upward Sweep Trailing Curtain (Separated cleanly BELOW the red line) */}
                        <div
                          className={`absolute top-full mt-[2px] inset-x-0 h-28 sm:h-36 bg-gradient-to-b from-red-500/30 via-red-500/10 to-transparent overflow-hidden rounded-b-sm ${
                            isScanningActive ? 'animate-curtain-up-fast' : 'animate-curtain-up'
                          }`}
                        >
                          {/* Subtle Horizontal Digital Scanlines */}
                          <div
                            className="absolute inset-0 opacity-20"
                            style={{
                              backgroundImage:
                                'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(239, 68, 68, 0.4) 3px, rgba(239, 68, 68, 0.4) 4px)',
                            }}
                          />
                        </div>

                        {/* Main Leading Red Laser Beam (Clean, solid, crisp with no overlapping haze) */}
                        <div className="relative w-full z-20 flex items-center justify-center">
                          <div className="h-[2.5px] w-full bg-[#EF4444] rounded-full shadow-[0_0_8px_#ef4444]" />
                        </div>
                      </div>

                      {/* CamScanner Digital Scan Particles (Scattered OCR Matrix Points) */}
                      <div className="absolute inset-2 pointer-events-none z-10 overflow-hidden">
                        {/* Particle Matrix Nodes */}
                        <div
                          className="absolute top-[18%] left-[15%] w-1.5 h-1.5 bg-red-400 shadow-[0_0_6px_#ef4444] rounded-[1px] animate-particle-flicker"
                          style={{ animationDelay: '0.1s' }}
                        />
                        <div
                          className="absolute top-[25%] right-[22%] w-1 h-1 bg-red-300 shadow-[0_0_4px_#ef4444] rounded-[1px] animate-particle-flicker"
                          style={{ animationDelay: '0.6s' }}
                        />
                        <div
                          className="absolute top-[38%] left-[28%] w-1 h-1 bg-red-400 shadow-[0_0_4px_#ef4444] rounded-[1px] animate-particle-flicker"
                          style={{ animationDelay: '1.2s' }}
                        />
                        <div
                          className="absolute top-[42%] right-[14%] w-1.5 h-1.5 bg-red-300 shadow-[0_0_6px_#ef4444] rounded-[1px] animate-particle-flicker"
                          style={{ animationDelay: '0.3s' }}
                        />
                        <div
                          className="absolute top-[55%] left-[18%] w-1 h-1 bg-red-400 shadow-[0_0_4px_#ef4444] rounded-[1px] animate-particle-flicker"
                          style={{ animationDelay: '0.9s' }}
                        />
                        <div
                          className="absolute top-[62%] right-[30%] w-1.5 h-1.5 bg-red-400 shadow-[0_0_6px_#ef4444] rounded-[1px] animate-particle-flicker"
                          style={{ animationDelay: '1.5s' }}
                        />
                        <div
                          className="absolute top-[75%] left-[32%] w-1 h-1 bg-red-300 shadow-[0_0_4px_#ef4444] rounded-[1px] animate-particle-flicker"
                          style={{ animationDelay: '0.4s' }}
                        />
                        <div
                          className="absolute top-[82%] right-[18%] w-1.5 h-1.5 bg-red-400 shadow-[0_0_6px_#ef4444] rounded-[1px] animate-particle-flicker"
                          style={{ animationDelay: '1.1s' }}
                        />
                        <div
                          className="absolute top-[48%] left-[60%] w-1 h-1 bg-red-300 shadow-[0_0_4px_#ef4444] rounded-[1px] animate-particle-flicker"
                          style={{ animationDelay: '0.7s' }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bottom Floating Bar */}
                <div
                  className="relative z-30 flex flex-col items-center gap-3.5 sm:gap-4 p-4 pt-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Floating Checkout Summary Bar if items have been scanned (Sales Mode only) */}
                  {!isInventoryMode && totalQuantity > 0 && (
                    <div className="relative w-full max-w-[250px] sm:max-w-[270px] h-[54px] sm:h-[56px] flex items-center justify-between pl-4 sm:pl-4.5 pr-0 bg-[#EEF2F4]/95 backdrop-blur-md rounded-full border border-[#DAE1E4] shadow-xl text-[#202522]">
                      <div className="flex flex-col text-left leading-tight py-0.5 min-w-0 pr-2">
                        <span className="text-[11px] text-[#586265] font-normal whitespace-nowrap">
                          {totalQuantity} {totalQuantity === 1 ? 'item' : 'items'} in cart
                        </span>
                        <span className="text-[15px] font-bold text-[#202522] tracking-tight">
                          ₱{totalAmount.toFixed(2)}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={handleCheckout}
                        aria-label="Proceed to checkout"
                        className="-mr-2.5 sm:-mr-3 w-[82px] sm:w-[90px] h-[58px] sm:h-[62px] rounded-full bg-white hover:bg-[#F2F4F2] active:bg-[#E5EAE6] text-[#202522] flex items-center justify-center shadow-[0_4px_18px_rgba(0,0,0,0.16)] active:scale-95 transition-all cursor-pointer z-10 shrink-0 select-none overflow-hidden relative"
                      >
                        <div className="absolute inset-0 m-auto w-[88px] h-[88px] sm:w-[98px] sm:h-[98px] flex items-center justify-center pointer-events-none shrink-0 origin-center scale-[1.65] -translate-y-2.5">
                          <LottieAnimation
                            animationData={shoppingCartData}
                            loop={true}
                            autoplay={true}
                            className="w-full h-full flex items-center justify-center"
                          />
                        </div>
                      </button>
                    </div>
                  )}

                  {/* Switcher Buttons: "Barcode" and "All products" with Sage Green Active Variant (Sales Mode only) */}
                  {!isInventoryMode && (
                    <div className="flex items-center justify-center gap-3">
                      <button
                        type="button"
                        onClick={() => handleSwitchInputMethod('barcode')}
                        className="w-28 sm:w-30 h-14 rounded-2xl bg-[#2F7D32] text-white shadow-[0_4px_16px_rgba(47,125,50,0.38)] flex flex-col items-center justify-center gap-1 font-semibold text-[13px] transition-all cursor-pointer select-none"
                      >
                        <ScanLine size={18} strokeWidth={2.3} />
                        <span>Barcode</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSwitchInputMethod('key')}
                        className="w-28 sm:w-30 h-14 rounded-2xl bg-white/15 hover:bg-white/25 text-white/85 border border-white/15 backdrop-blur-md flex flex-col items-center justify-center gap-1 font-semibold text-[12.5px] sm:text-[13px] transition-all cursor-pointer select-none px-2"
                      >
                        <Package size={18} strokeWidth={2.2} />
                        <span className="whitespace-nowrap">All products</span>
                      </button>
                    </div>
                  )}

                  {/* Center Circle with Scanner Icon */}
                  <div className="flex items-center justify-center gap-4 mt-1">
                    {/* Undo Button (Sales Mode only) */}
                    {!isInventoryMode && (
                      <button
                        type="button"
                        onClick={handleUndo}
                        disabled={!canUndo}
                        aria-label="Undo scan"
                        title="Undo scan"
                        className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center backdrop-blur-md transition-all duration-150 cursor-pointer ${
                          canUndo
                            ? 'bg-white/20 hover:bg-white/30 text-white shadow-md active:scale-95 border border-white/25'
                            : 'bg-white/5 text-white/25 border border-white/5 cursor-not-allowed pointer-events-none'
                        }`}
                      >
                        <Undo2 size={20} strokeWidth={2.4} />
                      </button>
                    )}

                    {/* Center Scan Button with Scanner Icon */}
                    <div className="p-1.5 rounded-full bg-white shadow-[0_4px_20px_rgba(0,0,0,0.35)] border border-[#DEE3DE]/80">
                      <button
                        type="button"
                        onClick={triggerScanSession}
                        aria-label="Scan Barcode"
                        title="Scan Barcode"
                        className={`w-[58px] h-[58px] sm:w-[62px] sm:h-[62px] rounded-full text-white flex items-center justify-center shadow-[0_5px_16px_rgba(47,125,50,0.38)] active:scale-95 transition-all duration-150 cursor-pointer focus-visible:outline-none ${
                          isScanningActive
                            ? 'bg-[#256B29] ring-4 ring-[#2F7D32]/40 shadow-[0_0_20px_rgba(47,125,50,0.6)]'
                            : 'bg-[#2F7D32] hover:bg-[#256B29] hover:shadow-[0_6px_20px_rgba(47,125,50,0.48)]'
                        }`}
                      >
                        <ScanLine size={27} strokeWidth={2.3} className="sm:w-7 sm:h-7 text-white" />
                      </button>
                    </div>

                    {/* Redo Button (Sales Mode only) */}
                    {!isInventoryMode && (
                      <button
                        type="button"
                        onClick={handleRedo}
                        disabled={!canRedo}
                        aria-label="Redo scan"
                        title="Redo scan"
                        className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center backdrop-blur-md transition-all duration-150 cursor-pointer ${
                          canRedo
                            ? 'bg-white/20 hover:bg-white/30 text-white shadow-md active:scale-95 border border-white/25'
                            : 'bg-white/5 text-white/25 border border-white/5 cursor-not-allowed pointer-events-none'
                        }`}
                      >
                        <Redo2 size={20} strokeWidth={2.4} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Hidden File Input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileScan}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
};


