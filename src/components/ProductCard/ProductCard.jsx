import { Link } from 'react-router-dom';
import { fmt, productImages } from '../../utils/format';
import { useRevealOnScroll } from '../../hooks/useRevealOnScroll';
import StockBadge from '../UI/StockBadge';
import './ProductCard.css';

export default function ProductCard({ product, index = 0 }) {
  const [ref, isVisible] = useRevealOnScroll();
  // Same stagger pattern as the original: 0/60/120/180ms repeating every 4 cards.
  const transitionDelay = `${(index % 4) * 60}ms`;
  const [thumbnail] = productImages(product, 600);

  return (
    <div
      ref={ref}
      className={`pcard${isVisible ? ' in' : ''}`}
      style={{ transitionDelay }}
    >
      <Link to={`/product/${product.id}`} className="pcard-link">
        <div className="pcard-img">
          {product.tag && <span className="pcard-tag">{product.tag}</span>}
          <StockBadge stock={product.stock} />
          <img loading="lazy" src={thumbnail} alt={product.name} />
        </div>
        <div className="pcard-body">
          <div className="pcard-cat">{product.cat}</div>
          <div className="pcard-name">{product.name}</div>
          <div className="pcard-price">{fmt(product.price)}</div>
        </div>
      </Link>
    </div>
  );
}
