import { Link } from 'react-router-dom';
import { fmt } from '../../utils/format';
import { displayName } from '../../utils/variants';
import './OrderSummary.css';

export default function OrderSummary({ lineItems, subtotal, deliveryPrice, deliveryLabel }) {
  if (!lineItems.length) {
    return (
      <div className="co-summary">
        <p className="co-empty">
          Your cart is empty. <Link to="/shop">Go shopping</Link> first.
        </p>
      </div>
    );
  }

  const hasDelivery = deliveryPrice !== null && deliveryPrice !== undefined;
  const total = subtotal + (hasDelivery ? deliveryPrice : 0);

  return (
    <div className="co-summary">
      <h3>Order Summary</h3>
      {lineItems.map(({ product, qty, lineTotal }) => (
        <div className="co-line" key={product.id}>
          <span className="n">
            {displayName(product)} × {qty}
          </span>
          <span className="p">{fmt(lineTotal)}</span>
        </div>
      ))}
      <div className="co-line">
        <span className="n">Subtotal</span>
        <span className="p">{fmt(subtotal)}</span>
      </div>
      <div className="co-line">
        <span className="n">Delivery{deliveryLabel ? ` — ${deliveryLabel}` : ''}</span>
        <span className="p">{hasDelivery ? fmt(deliveryPrice) : 'Select wilaya'}</span>
      </div>
      <div className="co-line co-line--total">
        <span>Total</span>
        <span className="p">{fmt(total)}</span>
      </div>
    </div>
  );
}
