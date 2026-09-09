import { useState, useEffect, useCallback } from 'react';
import {
  getAllProductImages,
  saveProductImage,
  deleteProductImage,
  getCachedProductImage,
} from '../utils/imageStorage';

/**
 * Hook providing reactive access to locally stored offline product images.
 * Keeps UI components in sync with IndexedDB and in-memory cache.
 */
export function useProductImages() {
  const [images, setImages] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Load all images from IndexedDB on initial mount
  useEffect(() => {
    let isMounted = true;
    getAllProductImages()
      .then((loaded) => {
        if (isMounted) {
          setImages(loaded);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) setIsLoading(false);
      });

    const handleUpdated = (e: Event) => {
      const customEvent = e as CustomEvent<{ productId: string; dataUrl: string }>;
      if (customEvent.detail) {
        setImages((prev) => ({
          ...prev,
          [customEvent.detail.productId]: customEvent.detail.dataUrl,
        }));
      }
    };

    const handleDeleted = (e: Event) => {
      const customEvent = e as CustomEvent<{ productId: string }>;
      if (customEvent.detail) {
        setImages((prev) => {
          const next = { ...prev };
          delete next[customEvent.detail.productId];
          return next;
        });
      }
    };

    window.addEventListener('product-image-updated', handleUpdated);
    window.addEventListener('product-image-deleted', handleDeleted);

    return () => {
      isMounted = false;
      window.removeEventListener('product-image-updated', handleUpdated);
      window.removeEventListener('product-image-deleted', handleDeleted);
    };
  }, []);

  const getImage = useCallback(
    (productId: string): string | null => {
      return images[productId] || getCachedProductImage(productId) || null;
    },
    [images]
  );

  const saveImage = useCallback(
    async (productId: string, input: File | Blob | string): Promise<string> => {
      const result = await saveProductImage(productId, input);
      setImages((prev) => ({ ...prev, [productId]: result }));
      return result;
    },
    []
  );

  const deleteImage = useCallback(async (productId: string): Promise<void> => {
    await deleteProductImage(productId);
    setImages((prev) => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  }, []);

  return {
    images,
    isLoading,
    getImage,
    saveImage,
    deleteImage,
  };
}
