// Stock is tracked as a real number in the database, but customers only
// ever see one of three states — the exact count is never exposed.
export const LOW_STOCK_THRESHOLD = 3;

/**
 * @param {number} stock
 * @returns {{ state: 'out' | 'low' | 'in', label: string }}
 */
export function stockStatus(stock) {
  const n = Number(stock) || 0;
  if (n <= 0) return { state: 'out', label: 'Out of Stock' };
  if (n <= LOW_STOCK_THRESHOLD) return { state: 'low', label: 'Almost Gone — Order Soon' };
  return { state: 'in', label: 'In Stock — Ready to Ship' };
}
