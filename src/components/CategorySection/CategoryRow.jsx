import { useRef } from 'react';
import ProductCard from '../ProductCard/ProductCard';
import './CategoryRow.css';

function ChevronIcon({ direction }) {
  const d = direction === 'left' ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6';
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export default function CategoryRow({ category, products }) {
  const scrollRef = useRef(null);

  const scrollByAmount = (direction) => {
    const node = scrollRef.current;
    if (!node) return;
    // Scroll by roughly 80% of the visible row width, in either direction.
    node.scrollBy({ left: node.clientWidth * 0.8 * direction, behavior: 'smooth' });
  };

  if (!products.length) return null;

  return (
    <section className="category-row">
      <div className="wrap category-row-head">
        <h2>{category}</h2>
        {/* Arrow controls are a desktop convenience for mouse users;
            touch devices simply swipe the row directly (hidden via CSS
            below 640px). */}
        <div className="category-row-nav">
          <button type="button" aria-label={`Scroll ${category} left`} onClick={() => scrollByAmount(-1)}>
            <ChevronIcon direction="left" />
          </button>
          <button type="button" aria-label={`Scroll ${category} right`} onClick={() => scrollByAmount(1)}>
            <ChevronIcon direction="right" />
          </button>
        </div>
      </div>

      <div className="category-row-scroll" ref={scrollRef}>
        {products.map((product, i) => (
          <div className="category-row-item" key={product.id}>
            <ProductCard product={product} index={i} />
          </div>
        ))}
      </div>
    </section>
  );
}
