import { useMemo } from 'react';
import CategoryRow from '../components/CategorySection/CategoryRow';
import SquiggleDivider from '../components/UI/SquiggleDivider';
import { CATEGORIES } from '../utils/constants';
import { dedupeVariants } from '../utils/variants';
import { useProducts } from '../hooks/useProducts';
import './Products.css';

export default function Products() {
  const { products, loading } = useProducts();

  // Variant groups show as a single post (representative row) — the
  // colour/model picker lives on the product page itself.
  const visibleProducts = useMemo(() => dedupeVariants(products), [products]);

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
