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
} from 'lucide-react';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import { Product, SaleItem, SaleTransaction } from '../types';

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
        if (currentOnItemScanned) {
          currentOnItemScanned(matched);
        }

        const existingIdx = scannedCart.findIndex((item) => item.productId === matched.id);
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
    if (scannedCart.length === 0 && !unrecognizedBarcode) return;

    const {
      onProceedToActiveSale: currentOnProceedToActiveSale,
      onScanSuccess: currentOnScanSuccess,
      onClose: currentOnClose,
    } = propsRef.current;

    if (currentOnProceedToActiveSale) {
      currentOnProceedToActiveSale(scannedCart, unrecognizedBarcode);
    } else if (currentOnScanSuccess) {
      const firstCode = scannedCart[0]?.productId || unrecognizedBarcode || '';
      currentOnScanSuccess(firstCode);
    }
    currentOnClose();
  }, [scannedCart, unrecognizedBarcode]);

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
            width: { ideal: 1920, min: 1280 },
            height: { ideal: 1080, min: 720 },
            frameRate: { ideal: 60, min: 30 },
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

  // Counts for the barcode presence filter
  const barcodeFilterCounts = useMemo(() => {
    const all = products.length;
    const withBarcode = products.filter((p) => Boolean(p.sku && p.sku.trim().length > 0)).length;
    const withoutBarcode = all - withBarcode;
    return { all, withBarcode, withoutBarcode };
  }, [products]);

  // Filtered products based on search input and barcode filter ("All", "With barcodes", "Without barcodes")
  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return products.filter((p) => {
      const hasBarcode = Boolean(p.sku && p.sku.trim().length > 0);
      if (barcodeFilter === 'with-barcode' && !hasBarcode) return false;
      if (barcodeFilter === 'without-barcode' && hasBarcode) return false;

      if (q) {
        const nameMatch = p.name.toLowerCase().includes(q);
        const catMatch = p.category ? p.category.toLowerCase().includes(q) : false;
        const skuMatch = p.sku ? p.sku.toLowerCase().includes(q) : false;
        return nameMatch || catMatch || skuMatch;
      }
      return true;
    });
  }, [products, searchQuery, barcodeFilter]);

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

      playBeep();
      if (currentOnItemScanned) {
        currentOnItemScanned(product);
      }

      const existingIdx = scannedCart.findIndex((item) => item.productId === product.id);
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

          {/* Smooth transition between Key and Barcode camera views */}
          <AnimatePresence mode="wait" initial={false}>
            {inputMethod === 'key' ? (
              /* INVENTORY SELECTION "KEY" VIEW (Full Page) */
              <motion.div
                key="manual-key"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
                className="relative z-10 w-full h-full flex-1 flex flex-col bg-[#F7F9FB] text-[#252825] overflow-hidden select-none"
              >
                {/* Top header with close button, title & Checkout button */}
                <div
                  className="px-4 py-3 flex items-center justify-between border-b border-[#DEE3DE] bg-white shrink-0"
                  style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 14px)' }}
                >
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={onClose}
                      className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 text-[#161816] flex items-center justify-center transition-colors cursor-pointer"
                      aria-label="Close"
                    >
                      <X size={17} strokeWidth={2.5} />
                    </button>
                    <div>
                      <h2 className="text-[16px] sm:text-[17px] font-bold text-[#252825] leading-tight">
                        {isInventoryMode ? 'Select Product' : 'Product Inventory'}
                      </h2>
                      <p className="text-[12px] text-[#717671] leading-none mt-0.5">
                        {products.length} {products.length === 1 ? 'product' : 'products'} total
                      </p>
                    </div>
                  </div>

                  {/* Quick Checkout Button in Key View Header (Sales Mode only) */}
                  {!isInventoryMode && (totalQuantity > 0 || unrecognizedBarcode) && (
                    <button
                      type="button"
                      onClick={handleCheckout}
                      className="h-9 px-3.5 rounded-full bg-[#4F8065] hover:bg-[#3D684F] text-white flex items-center gap-1.5 shadow-[0_2px_8px_rgba(79,128,101,0.3)] font-bold text-[13px] active:scale-95 transition-all cursor-pointer"
                    >
                      <ShoppingCart size={14} strokeWidth={2.4} />
                      <span>Checkout ({totalQuantity})</span>
                    </button>
                  )}
                </div>

                {/* Search Bar & Filter selection: "All", "With barcodes", "Without barcodes" */}
                <div className="px-4 pt-3 pb-2.5 bg-white border-b border-[#DEE3DE] space-y-2.5 shrink-0">
                  {/* Search input */}
                  <div className="relative w-full">
                    <Search
                      size={17}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#717671] pointer-events-none"
                    />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search products, barcodes, category..."
                      className="w-full h-10 pl-10 pr-9 bg-[#F2F4F2] text-[#252825] text-[14px] rounded-xl border border-transparent focus:border-[#4F8065] focus:bg-white focus:outline-none transition-all placeholder:text-[#9CA3AF]"
                    />
                    {searchQuery.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-600 flex items-center justify-center cursor-pointer transition-colors"
                        aria-label="Clear search"
                      >
                        <X size={13} strokeWidth={2.4} />
                      </button>
                    )}
                  </div>

                  {/* Filter chips: "All", "With barcodes", "Without barcodes" */}
                  <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
                    <button
                      type="button"
                      onClick={() => setBarcodeFilter('all')}
                      className={`px-3 py-1.5 rounded-xl text-[12px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
                        barcodeFilter === 'all'
                          ? 'bg-[#252825] text-white shadow-xs'
                          : 'bg-[#F2F4F2] text-[#5A605B] hover:bg-[#E5E9E5] border border-[#DEE3DE]/80'
                      }`}
                    >
                      <span>All</span>
                      <span
                        className={`text-[11px] px-1.5 py-0.5 rounded-full ${
                          barcodeFilter === 'all'
                            ? 'bg-white/20 text-white'
                            : 'bg-black/5 text-[#717671]'
                        }`}
                      >
                        {barcodeFilterCounts.all}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setBarcodeFilter('with-barcode')}
                      className={`px-3 py-1.5 rounded-xl text-[12px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
                        barcodeFilter === 'with-barcode'
                          ? 'bg-[#4F8065] text-white shadow-xs'
                          : 'bg-[#F2F4F2] text-[#5A605B] hover:bg-[#E5E9E5] border border-[#DEE3DE]/80'
                      }`}
                    >
                      <span>With barcodes</span>
                      <span
                        className={`text-[11px] px-1.5 py-0.5 rounded-full ${
                          barcodeFilter === 'with-barcode'
                            ? 'bg-white/20 text-white'
                            : 'bg-black/5 text-[#717671]'
                        }`}
                      >
                        {barcodeFilterCounts.withBarcode}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setBarcodeFilter('without-barcode')}
                      className={`px-3 py-1.5 rounded-xl text-[12px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
                        barcodeFilter === 'without-barcode'
                          ? 'bg-[#4F8065] text-white shadow-xs'
                          : 'bg-[#F2F4F2] text-[#5A605B] hover:bg-[#E5E9E5] border border-[#DEE3DE]/80'
                      }`}
                    >
                      <span>Without barcodes</span>
                      <span
                        className={`text-[11px] px-1.5 py-0.5 rounded-full ${
                          barcodeFilter === 'without-barcode'
                            ? 'bg-white/20 text-white'
                            : 'bg-black/5 text-[#717671]'
                        }`}
                      >
                        {barcodeFilterCounts.withoutBarcode}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Available Products List */}
                <div
                  className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5"
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
                      {(searchQuery || barcodeFilter !== 'all') && (
                        <button
                          type="button"
                          onClick={() => {
                            setSearchQuery('');
                            setBarcodeFilter('all');
                          }}
                          className="mt-4 px-4 py-2 rounded-xl bg-[#F2F4F2] hover:bg-[#E5E9E5] text-[#252825] text-[13px] font-semibold cursor-pointer transition-colors"
                        >
                          Clear filters
                        </button>
                      )}
                    </div>
                  ) : (
                    filteredProducts.map((p) => {
                      const cartItem = scannedCart.find((i) => i.productId === p.id);
                      const qty = cartItem ? cartItem.quantity : 0;
                      const hasBarcode = Boolean(p.sku && p.sku.trim().length > 0);

                      return (
                        <div
                          key={p.id}
                          onClick={() => handleAddProductToCart(p)}
                          className={`w-full p-3 sm:p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                            qty > 0
                              ? 'bg-[#F2F8F4] border-[#4F8065] shadow-xs'
                              : 'bg-white border-[#DEE3DE] hover:border-gray-300 shadow-2xs active:bg-gray-50'
                          }`}
                        >
                          {/* Product details */}
                          <div className="flex-1 min-w-0">
                            <h3 className="text-[15px] font-semibold text-[#252825] truncate">
                              {p.name}
                            </h3>
                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                              <span className="text-[11px] font-medium text-[#555A55] bg-[#EAEFEA] px-2 py-0.5 rounded-md">
                                {p.category || 'General'}
                              </span>
                              {hasBarcode ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-mono text-[#555A55] bg-gray-100 px-2 py-0.5 rounded-md">
                                  <Barcode size={11} />
                                  <span className="truncate max-w-[120px]">{p.sku}</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center text-[11px] text-[#9E653A] bg-[#FDF4EC] px-2 py-0.5 rounded-md font-medium">
                                  No barcode
                                </span>
                              )}
                              {p.stock <= p.lowStockThreshold && (
                                <span className="text-[11px] text-amber-700 font-medium">
                                  {p.stock <= 0 ? 'Out of stock' : `${p.stock} left`}
                                </span>
                              )}
                            </div>
                            <div className="mt-1.5">
                              <span className="text-[15px] font-bold text-[#252825]">
                                ₱{p.price.toFixed(2)}
                              </span>
                            </div>
                          </div>

                          {/* Right Action / Quantity Stepper */}
                          <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                            {!isInventoryMode ? (
                              qty > 0 ? (
                                <div className="flex items-center gap-1.5 bg-white border border-[#4F8065]/50 rounded-xl p-1 shadow-2xs">
                                  <button
                                    type="button"
                                    onClick={() => handleDecrementProductInCart(p.id)}
                                    className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 text-[#252825] flex items-center justify-center cursor-pointer transition-colors active:scale-95"
                                    aria-label={`Decrease ${p.name}`}
                                  >
                                    <Minus size={13} strokeWidth={2.5} />
                                  </button>
                                  <span className="w-6 text-center text-[13px] font-bold text-[#252825]">
                                    {qty}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleAddProductToCart(p)}
                                    className="w-7 h-7 rounded-lg bg-[#4F8065] hover:bg-[#3D684F] text-white flex items-center justify-center cursor-pointer transition-colors active:scale-95"
                                    aria-label={`Increase ${p.name}`}
                                  >
                                    <Plus size={13} strokeWidth={2.5} />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleAddProductToCart(p)}
                                  className="h-8.5 px-3 rounded-xl bg-[#F2F4F2] hover:bg-[#4F8065] hover:text-white text-[#252825] font-semibold text-[13px] flex items-center gap-1 transition-all cursor-pointer active:scale-95 border border-[#DEE3DE]"
                                  aria-label={`Add ${p.name}`}
                                >
                                  <Plus size={14} strokeWidth={2.5} />
                                  <span>Add</span>
                                </button>
                              )
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleAddProductToCart(p)}
                                className="h-8.5 px-3 rounded-xl bg-[#4F8065] text-white font-semibold text-[13px] flex items-center gap-1 transition-all cursor-pointer active:scale-95"
                              >
                                <span>Select</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Bottom Floating Bar: Summary & Checkout + Switcher */}
                <div
                  className="absolute bottom-0 left-0 right-0 z-30 flex flex-col items-center gap-2.5 px-4 pt-6 bg-gradient-to-t from-[#F7F9FB] via-[#F7F9FB]/95 to-transparent pointer-events-none"
                  style={{
                    paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))',
                  }}
                >
                  {/* Floating Checkout Summary Bar (Sales Mode only) */}
                  {!isInventoryMode && totalQuantity > 0 && (
                    <div className="w-full max-w-sm flex items-center justify-between px-4 py-2.5 bg-[#161816]/95 backdrop-blur-md rounded-2xl border border-white/10 shadow-xl text-white pointer-events-auto">
                      <div className="flex flex-col text-left leading-tight">
                        <span className="text-[11px] text-gray-300 font-medium">
                          {totalQuantity} {totalQuantity === 1 ? 'item' : 'items'} in cart
                        </span>
                        <span className="text-[15px] font-bold text-white">
                          ₱{totalAmount.toFixed(2)}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={handleCheckout}
                        className="px-4 py-2 rounded-xl bg-[#4F8065] hover:bg-[#3D684F] text-white font-bold text-[13px] flex items-center gap-1 shadow-md active:scale-95 transition-all cursor-pointer"
                      >
                        <span>Checkout</span>
                        <ChevronRight size={15} strokeWidth={2.5} />
                      </button>
                    </div>
                  )}

                  {/* Switcher Buttons: "Barcode" and "Key" */}
                  <div className="flex items-center justify-center gap-3 pointer-events-auto">
                    <button
                      type="button"
                      onClick={() => handleSwitchInputMethod('barcode')}
                      className="w-28 h-14 rounded-2xl bg-white hover:bg-[#F2F4F2] text-[#4B524D] border border-[#DEE3DE] shadow-xs flex flex-col items-center justify-center gap-1 font-semibold text-[13px] transition-all cursor-pointer select-none"
                    >
                      <ScanLine size={18} strokeWidth={2.3} />
                      <span>Barcode</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSwitchInputMethod('key')}
                      className="w-28 h-14 rounded-2xl bg-[#4F8065] text-white shadow-[0_4px_16px_rgba(79,128,101,0.38)] flex flex-col items-center justify-center gap-1 font-semibold text-[13px] transition-all cursor-pointer select-none"
                    >
                      <Keyboard size={18} strokeWidth={2.2} />
                      <span>Key</span>
                    </button>
                  </div>
                </div>
              </motion.div>
            ) : (
              /* LIVE CAMERA BARCODE SCANNER VIEW (Full Page) */
              <motion.div
                key="camera-barcode"
                initial={{ opacity: 0, x: -24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 24 }}
                transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
                className="relative z-10 flex-1 w-full h-full bg-black/20 overflow-hidden flex flex-col justify-between cursor-pointer pt-[max(env(safe-area-inset-top),16px)] pb-[max(env(safe-area-inset-bottom),16px)]"
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
                  className="relative z-30 flex flex-col items-center gap-3 p-4 pt-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Floating Checkout Summary Bar if items have been scanned (Sales Mode only) */}
                  {!isInventoryMode && totalQuantity > 0 && (
                    <div className="w-full max-w-xs flex items-center justify-between px-4 py-2.5 bg-[#161816]/90 backdrop-blur-md rounded-2xl border border-white/15 shadow-2xl text-white">
                      <div className="flex flex-col text-left leading-tight">
                        <span className="text-[11px] text-gray-300 font-medium">
                          {totalQuantity} {totalQuantity === 1 ? 'item' : 'items'} in cart
                        </span>
                        <span className="text-[15px] font-bold text-white">
                          ₱{totalAmount.toFixed(2)}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={handleCheckout}
                        className="px-4 py-2 rounded-xl bg-[#4F8065] hover:bg-[#3D684F] text-white font-bold text-[13px] flex items-center gap-1 shadow-md active:scale-95 transition-all cursor-pointer"
                      >
                        <span>Checkout</span>
                        <ChevronRight size={15} strokeWidth={2.5} />
                      </button>
                    </div>
                  )}

                  {/* Switcher Buttons: "Barcode" and "Key" with Sage Green Active Variant */}
                  <div className="flex items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => handleSwitchInputMethod('barcode')}
                      className="w-28 h-14 rounded-2xl bg-[#4F8065] text-white shadow-[0_4px_16px_rgba(79,128,101,0.38)] flex flex-col items-center justify-center gap-1 font-semibold text-[13px] transition-all cursor-pointer select-none"
                    >
                      <ScanLine size={18} strokeWidth={2.3} />
                      <span>Barcode</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSwitchInputMethod('key')}
                      className="w-28 h-14 rounded-2xl bg-white/15 hover:bg-white/25 text-white/85 border border-white/15 backdrop-blur-md flex flex-col items-center justify-center gap-1 font-semibold text-[13px] transition-all cursor-pointer select-none"
                    >
                      <Keyboard size={18} strokeWidth={2.2} />
                      <span>Key</span>
                    </button>
                  </div>

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
                        className={`w-[58px] h-[58px] sm:w-[62px] sm:h-[62px] rounded-full text-white flex items-center justify-center shadow-[0_5px_16px_rgba(79,128,101,0.38)] active:scale-95 transition-all duration-150 cursor-pointer focus-visible:outline-none ${
                          isScanningActive
                            ? 'bg-[#3D684F] ring-4 ring-[#4F8065]/40 shadow-[0_0_20px_rgba(79,128,101,0.6)]'
                            : 'bg-[#4F8065] hover:bg-[#3D684F] hover:shadow-[0_6px_20px_rgba(79,128,101,0.48)]'
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


