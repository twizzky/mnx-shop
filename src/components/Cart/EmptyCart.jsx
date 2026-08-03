import { Link } from 'react-router-dom';
import Button from '../UI/Button';
import './EmptyCart.css';

export default function EmptyCart() {
  return (
    <div className="empty-cart">
      <span className="eyebrow">Your cart is empty</span>
      <p>Looks like you haven&apos;t added any pieces yet.</p>
      <Button as={Link} to="/shop" variant="primary">
        Browse the Shop
      </Button>
    </div>
  );
}
