import { Link } from 'react-router-dom';
import Button from '../UI/Button';
import './ConfirmScreen.css';

export default function ConfirmScreen({ orderNumber, whatsappLink, onBackToHome }) {
  return (
    <div className="confirm-screen show">
      <div className="confirm-icon">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </div>
      <h2>Order confirmed</h2>
      <p>Thank you — your order has been logged with MNX Accessories. We&apos;ll reach out to confirm delivery details.</p>
      <p className="order-id">Order Reference — {orderNumber}</p>
      <div className="confirm-actions">
        <Button as={Link} to="/" variant="primary" onClick={onBackToHome}>
          Back to Home
        </Button>
        <Button href={whatsappLink} target="_blank" rel="noopener noreferrer" variant="outline">
          Message Us on WhatsApp
        </Button>
      </div>
    </div>
  );
}
