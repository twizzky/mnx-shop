import { Link } from 'react-router-dom';
import { fmt } from '../../utils/format';
import { displayName } from '../../utils/variants';
import './OrderSummary.css';

export default function OrderSummary({ lineItems, subtotal, cartSavings, deliveryPrice, deliveryLabel }) {
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
      {lineItems.map(({ product, qty, lineTotal, breakdown }) => (
        <div className="co-line" key={product.id}>
          <span className="n">
            {displayName(product)} × {qty}
            {breakdown && <span className="co-offer">({breakdown})</span>}
          </span>
          <span className="p">{fmt(lineTotal)}</span>
        </div>
      ))}
      {cartSavings > 0 && (
        <div className="co-line co-line--saving">
          <span>Offer savings</span>
          <span className="p co-saving">-{fmt(cartSavings)}</span>
        </div>
      )}
      <div className="co-line">
        <span>Subtotal</span>
        <span className="p">{fmt(subtotal)}</span>
      </div>
      <div className="co-line">
        <span>Delivery{deliveryLabel ? ` — ${deliveryLabel}` : ''}</span>
        <span className="p">{hasDelivery ? fmt(deliveryPrice) : 'Select wilaya'}</span>
      </div>
      <div className="co-line co-line--total">
        <span>Total</span>
        <span className="p">{fmt(total)}</span>
      </div>
    </div>
  );
}
