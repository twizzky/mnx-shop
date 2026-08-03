import { stockStatus } from '../../utils/stock';
import './StockBadge.css';

export default function StockBadge({ stock }) {
  const status = stockStatus(stock);

  if (status.state === 'out') {
    return <span className="stock-badge out">Sold Out</span>;
  }
  if (status.state === 'low') {
    return <span className="stock-badge low">Low Stock</span>;
  }
  return null;
}
