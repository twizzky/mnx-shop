import { Link } from 'react-router-dom';
import { fmt } from '../../utils/format';
import Button from '../UI/Button';
import './CartSummary.css';

export default function CartSummary({ total, cartSavings }) {
  return (
    <div className="cart-summary">
      <h3>Order Summary</h3>
      <div className="sum-row">
        <span>Subtotal</span>
        <span>{fmt(total)}</span>
      </div>
      {cartSavings > 0 && (
        <div className="sum-row co-saving">
          <span>Offer savings</span>
          <span>-{fmt(cartSavings)}</span>
        </div>
      )}
      <div className="sum-row">
        <span>Shipping</span>
        <span>Calculated at delivery</span>
      </div>
      <div className="sum-row total">
        <span>Total</span>
        <span>{fmt(total)}</span>
      </div>
      <Button as={Link} to="/checkout" variant="primary" style={{ width: '100%', marginTop: 20 }}>
        Continue to Checkout
      </Button>
    </div>
  );
}
