import { createContext, useEffect, useMemo, useState } from 'react';
import { fetchProducts } from '../services/api';

export const ProductsContext = createContext(null);

export function ProductsProvider({ children }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchProducts().then((data) => {
      if (!cancelled) {
        setProducts(data);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const findProduct = useMemo(() => (id) => products.find((p) => p.id === id), [products]);

  const value = useMemo(
    () => ({ products, loading, findProduct }),
    [products, loading, findProduct]
  );

  return <ProductsContext.Provider value={value}>{children}</ProductsContext.Provider>;
}
