import { Product, SaleItem } from '../types';

/**
 * Checks if a product is out of stock (stock <= 0 or product not found).
 */
export const isProductOutOfStock = (
  productId: string,
  products: Product[]
): boolean => {
  const prod = products.find((p) => p.id === productId);
  if (!prod) return true;
  return Number(prod.stock) <= 0;
};

/**
 * Gets the actual available stock count for a given product.
 */
export const getProductAvailableStock = (
  productId: string,
  products: Product[]
): number => {
  const prod = products.find((p) => p.id === productId);
  if (!prod) return 0;
  return Math.max(0, Number(prod.stock) || 0);
};

export interface StockValidationResult {
  isValid: boolean;
  invalidItems: {
    productId: string;
    name: string;
    requested: number;
    available: number;
    reason: 'out_of_stock' | 'exceeds_stock';
  }[];
}

/**
 * Validates that all items in a cart exist and have sufficient stock.
 * Blocks any items that have stock <= 0 or whose quantity exceeds available stock.
 */
export const validateCartStock = (
  cart: SaleItem[],
  products: Product[]
): StockValidationResult => {
  const invalidItems: StockValidationResult['invalidItems'] = [];

  for (const item of cart) {
    const prod = products.find((p) => p.id === item.productId);
    const available = prod ? Math.max(0, Number(prod.stock) || 0) : 0;

    if (!prod || available <= 0) {
      invalidItems.push({
        productId: item.productId,
        name: item.name,
        requested: item.quantity,
        available: 0,
        reason: 'out_of_stock',
      });
    } else if (item.quantity > available) {
      invalidItems.push({
        productId: item.productId,
        name: item.name,
        requested: item.quantity,
        available,
        reason: 'exceeds_stock',
      });
    }
  }

  return {
    isValid: invalidItems.length === 0,
    invalidItems,
  };
};

/**
 * Sanitizes a cart by eliminating out-of-stock items and clamping
 * quantities to available inventory limits.
 */
export const sanitizeCartStock = (
  cart: SaleItem[],
  products: Product[]
): SaleItem[] => {
  return cart
    .map((item) => {
      const prod = products.find((p) => p.id === item.productId);
      const available = prod ? Math.max(0, Number(prod.stock) || 0) : 0;
      if (!prod || available <= 0) {
        return null;
      }
      return {
        ...item,
        quantity: Math.max(1, Math.min(item.quantity, available)),
      };
    })
    .filter((item): item is SaleItem => item !== null);
};
