import ProductCard from '../ProductCard/ProductCard';
import './ProductGrid.css';

export default function ProductGrid({ products, fullBleed = false }) {
  return (
    <div className={`grid-products${fullBleed ? ' full-bleed' : ''}`}>
      {products.map((product, i) => (
        <ProductCard key={product.id} product={product} index={i} />
      ))}
    </div>
  );
}
