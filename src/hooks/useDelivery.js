import { useContext } from 'react';
import { DeliveryContext } from '../context/DeliveryContext';

export function useDelivery() {
  const ctx = useContext(DeliveryContext);
  if (!ctx) {
    throw new Error('useDelivery must be used within a DeliveryProvider');
  }
  return ctx;
}
