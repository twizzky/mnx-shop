import { createContext, useEffect, useMemo, useState } from 'react';
import { fetchProducts } from '../services/api';
import { fetchActiveOffers } from '../services/offers';

export const ProductsContext = createContext(null);

export function ProductsProvider({ children }) {
  const [products, setProducts] = useState([]);
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchProducts(), fetchActiveOffers()]).then(
      ([productsData, offersData]) => {
        if (!cancelled) {
          setProducts(productsData);
          setOffers(offersData);
          setLoading(false);
        }
      }
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const findProduct = useMemo(() => (id) => products.find((p) => p.id === id), [products]);

  /**
   * Mirrors an image save into the already-loaded catalog so the admin
   * page shows the new photos without a full refetch. The server is the
   * source of truth; this only keeps the local copy in step with it.
   */
  const applyImageUpdate = useMemo(
    () => (ids, urls) => {
      const targets = new Set(ids);
      setProducts((prev) =>
        prev.map((p) =>
          targets.has(p.id)
            ? { ...p, image_urls: urls, image_url: urls[0] || null }
            : p
        )
      );
    },
    []
  );

  const value = useMemo(
    () => ({ products, loading, findProduct, applyImageUpdate, offers }),
    [products, loading, findProduct, applyImageUpdate, offers]
  );

  return <ProductsContext.Provider value={value}>{children}</ProductsContext.Provider>;
}
