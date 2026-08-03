import { stockStatus } from '../../utils/stock';
import './AvailabilityIndicator.css';

export default function AvailabilityIndicator({ stock }) {
  const status = stockStatus(stock);

  return (
    <div className={`avail ${status.state}`}>
      <span className="dot" />
      {status.label}
    </div>
  );
}
