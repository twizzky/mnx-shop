import { useContext, useMemo, useState, useEffect } from 'react';
import { CartContext } from '../context/CartContext';
import { ProductsContext } from '../context/ProductsContext';
import { findActiveOffer, applyOffer } from '../services/offers';

/**
 * Convenience hook combining cart state with product lookups so
 * components can get line totals and a cart total without doing
 * the join themselves. Applies any active product offer to each line.
 *
 * Offers apply to the entire product (all variants in a group), so
 * quantities are combined across variant rows before the discount is
 * calculated, then distributed back proportionally to each line.
 */
export function useCart() {
  const cart = useContext(CartContext);
  const { products, findProduct, offers } = useContext(ProductsContext);

  if (!cart) {
    throw new Error('useCart must be used within a CartProvider');
  }

  // Group cart lines by variant group so an offer on one variant applies
  // to the combined quantity of all variants in the group. Standalone
  // products (no variant_group) use their own id as the group key.
  const groups = new Map();
  for (const [id, qty] of Object.entries(cart.items)) {
    const product = findProduct(id);
    if (!product) continue;
    const key = product.variant_group || id;
    if (!groups.has(key)) groups.set(key, { products: [], totalQty: 0 });
    groups.get(key).products.push({ id, qty, product });
    groups.get(key).totalQty += qty;
  }

  const lineItems = useMemo(
    () => {
      const out = [];
      for (const [, group] of groups) {
        const representative = group.products[0].product;
        const offer = findActiveOffer(representative, offers, products);
        const { total, savings } = applyOffer(group.totalQty, representative.price, offer);
        const groupRegular = group.products.reduce(
          (sum, { product, qty }) => sum + product.price * qty,
          0
        );
        for (const { id, qty, product } of group.products) {
          const itemRegular = product.price * qty;
          const itemTotal =
            groupRegular > 0 ? total * (itemRegular / groupRegular) : total / group.products.length;
          const itemSavings = itemRegular - itemTotal;
          out.push({
            product,
            qty,
            lineTotal: itemTotal,
            offer,
            savings: itemSavings,
            breakdown: group.products.length === 1 ? undefined : undefined,
          });
        }
      }
      return out.filter(Boolean);
    },
    [cart.items, findProduct, offers, products]
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
