import { useState } from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import { fmt, productImages } from '../utils/format';
import { stockStatus } from '../utils/stock';
import { useProducts } from '../hooks/useProducts';
import { useCart } from '../hooks/useCart';
import { useToast } from '../hooks/useToast';
import QtyStepper from '../components/UI/QtyStepper';
import AvailabilityIndicator from '../components/UI/AvailabilityIndicator';
import Button from '../components/UI/Button';
import './ProductDetails.css';

export default function ProductDetails() {
  const { id } = useParams();
  const { findProduct, loading } = useProducts();
  const { addItem } = useCart();
  const { showToast } = useToast();

  const [qty, setQty] = useState(1);
  const [justAdded, setJustAdded] = useState(false);
  const [activeImage, setActiveImage] = useState(0);

  if (loading) return null;

  const product = findProduct(id);
  if (!product) return <Navigate to="/shop" replace />;

  const images = productImages(product, 800);
  const status = stockStatus(product.stock);
  const canBuy = status.state !== 'out';
  const maxQty = Math.max(1, Number(product.stock) || 1);

  const stepQty = (delta) => {
    setQty((v) => Math.min(Math.max(1, v + delta), canBuy ? maxQty : 1));
  };

  const handleAddToCart = () => {
    addItem(product.id, qty);
    showToast(`${product.name} added to cart`);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1100);
  };

  return (
    <section className="page">
      <div className="wrap pd-wrap">
        <Link className="back-link" to="/shop">
          &larr; Back to shop
        </Link>

        <div className="pd-grid">
          <div>
            <div className="pd-main-img">
              <img src={images[activeImage]} alt={product.name} />
            </div>
            {images.length > 1 && (
              <div className="pd-thumbs">
                {images.map((src, i) => (
                  <button
                    type="button"
                    key={src}
                    className={`pd-thumb${i === activeImage ? ' active' : ''}`}
                    onClick={() => setActiveImage(i)}
                    aria-label={`Show image ${i + 1}`}
                  >
                    <img src={src} alt="" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="pd-info">
            <div className="pcard-cat">{product.cat}</div>
            <h1>{product.name}</h1>
            <div className="pd-price">{fmt(product.price)}</div>
            <p className="pd-desc">{product.desc}</p>

            <AvailabilityIndicator stock={product.stock} />

            <div className="qty-row">
              <span className="eyebrow">Qty</span>
              <QtyStepper value={qty} onDecrement={() => stepQty(-1)} onIncrement={() => stepQty(1)} />
            </div>

            <Button
              type="button"
              variant="primary"
              className={`pd-add${justAdded ? ' added' : ''}`}
              disabled={!canBuy}
              onClick={handleAddToCart}
            >
              <span>{canBuy ? 'Add to Cart' : 'Sold Out'}</span>
              <span className="check">Added ✓</span>
            </Button>

            <div className="pd-meta">
              Ships within 2–4 days · DM us for bulk orders
              <br />
              Local pickup available on request
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
