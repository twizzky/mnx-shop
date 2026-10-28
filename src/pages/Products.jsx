import { useMemo } from 'react';
import CategoryRow from '../components/CategorySection/CategoryRow';
import SquiggleDivider from '../components/UI/SquiggleDivider';
import { CATEGORIES } from '../utils/constants';
import { useProducts } from '../hooks/useProducts';
import './Products.css';

export default function Products() {
  const { products, loading } = useProducts();

  // Every variant row is its own card on the shop page — variants are no
  // longer collapsed, so every colour/model the client added shows up.
  const visibleProducts = useMemo(() => products, [products]);

  // One row per active category, in the order defined in utils/constants.js.
  const productsByCategory = useMemo(
    () => CATEGORIES.map((category) => ({ category, items: visibleProducts.filter((p) => p.cat === category) })),
    [visibleProducts]
  );

  const hasAnyProducts = productsByCategory.some(({ items }) => items.length > 0);

  return (
    <section className="page">
      <div className="wrap categories-head">
        <span className="eyebrow">Full Catalog</span>
        <h1 className="shop-title">Categories</h1>
      </div>

      <SquiggleDivider />

      <div className="categories-body">
        {!loading &&
          productsByCategory.map(({ category, items }) => (
            <CategoryRow key={category} category={category} products={items} />
          ))}

        {!loading && !hasAnyProducts && (
          <p className="empty-note">No products available yet — check back soon.</p>
        )}
      </div>
    </section>
  );
}
