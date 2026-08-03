import { createContext, useCallback, useMemo, useState } from 'react';

export const CartContext = createContext(null);

export function CartProvider({ children }) {
  // { [productId]: qty } — intentionally in-memory only, resets on
  // reload, exactly like the original implementation.
  const [items, setItems] = useState({});

  const addItem = useCallback((productId, qty = 1) => {
    setItems((prev) => ({ ...prev, [productId]: (prev[productId] || 0) + qty }));
  }, []);

  const changeQty = useCallback((productId, delta) => {
    setItems((prev) => {
      const next = { ...prev };
      const newQty = (next[productId] || 0) + delta;
      if (newQty <= 0) {
        delete next[productId];
      } else {
        next[productId] = newQty;
      }
      return next;
    });
  }, []);

  const removeItem = useCallback((productId) => {
    setItems((prev) => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  }, []);

  const clearCart = useCallback(() => setItems({}), []);

  const itemCount = useMemo(
    () => Object.values(items).reduce((sum, qty) => sum + qty, 0),
    [items]
  );

  const value = useMemo(
    () => ({ items, addItem, changeQty, removeItem, clearCart, itemCount }),
    [items, addItem, changeQty, removeItem, clearCart, itemCount]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
