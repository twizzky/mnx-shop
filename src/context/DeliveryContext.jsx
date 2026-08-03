import { createContext, useEffect, useMemo, useState } from 'react';
import { fetchDeliveryPrices } from '../services/deliveryApi';
import { DELIVERY_METHODS } from '../utils/constants';

export const DeliveryContext = createContext(null);

export function DeliveryProvider({ children }) {
  const [deliveryPrices, setDeliveryPrices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchDeliveryPrices().then((data) => {
      if (!cancelled) {
        setDeliveryPrices(data);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Looks up the price for a wilaya + delivery method value, or null if either isn't found yet. */
  const findPrice = useMemo(
    () => (wilaya, methodValue) => {
      const row = deliveryPrices.find((d) => d.wilaya === wilaya);
      const method = DELIVERY_METHODS.find((m) => m.value === methodValue);
      if (!row || !method) return null;
      return Number(row[method.priceField]);
    },
    [deliveryPrices]
  );

  const value = useMemo(
    () => ({ deliveryPrices, loading, findPrice }),
    [deliveryPrices, loading, findPrice]
  );

  return <DeliveryContext.Provider value={value}>{children}</DeliveryContext.Provider>;
}
