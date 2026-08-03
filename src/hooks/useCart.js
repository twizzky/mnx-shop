import { useContext, useMemo } from 'react';
import { CartContext } from '../context/CartContext';
import { ProductsContext } from '../context/ProductsContext';

/**
 * Convenience hook combining cart state with product lookups so
 * components can get line totals and a cart total without doing
 * the join themselves.
 */
export function useCart() {
  const cart = useContext(CartContext);
  const { findProduct } = useContext(ProductsContext);

  if (!cart) {
    throw new Error('useCart must be used within a CartProvider');
  }

  const lineItems = useMemo(
    () =>
      Object.entries(cart.items)
        .map(([id, qty]) => {
          const product = findProduct(id);
          if (!product) return null;
          return { product, qty, lineTotal: product.price * qty };
        })
        .filter(Boolean),
    [cart.items, findProduct]
  );

  const cartTotal = useMemo(
    () => lineItems.reduce((sum, item) => sum + item.lineTotal, 0),
    [lineItems]
  );

  return { ...cart, lineItems, cartTotal };
}
