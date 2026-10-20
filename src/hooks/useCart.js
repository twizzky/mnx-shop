import { useContext, useMemo, useState, useEffect } from 'react';
import { CartContext } from '../context/CartContext';
import { ProductsContext } from '../context/ProductsContext';
import { findActiveOffer, applyOffer } from '../services/offers';

/**
 * Convenience hook combining cart state with product lookups so
 * components can get line totals and a cart total without doing
 * the join themselves. Applies any active product offer to each line.
 */
export function useCart() {
  const cart = useContext(CartContext);
  const { findProduct, offers } = useContext(ProductsContext);

  if (!cart) {
    throw new Error('useCart must be used within a CartProvider');
  }

  const lineItems = useMemo(
    () =>
      Object.entries(cart.items)
        .map(([id, qty]) => {
          const product = findProduct(id);
          if (!product) return null;
          const offer = findActiveOffer(product, offers);
          const { total, savings, breakdown } = applyOffer(qty, product.price, offer);
          return {
            product,
            qty,
            lineTotal: total,
            offer,
            savings,
            breakdown,
          };
        })
        .filter(Boolean),
    [cart.items, findProduct, offers]
  );

  const cartTotal = useMemo(
    () => lineItems.reduce((sum, item) => sum + item.lineTotal, 0),
    [lineItems]
  );

  const cartSavings = useMemo(
    () => lineItems.reduce((sum, item) => sum + item.savings, 0),
    [lineItems]
  );

  return { ...cart, lineItems, cartTotal, cartSavings, offers };
}
