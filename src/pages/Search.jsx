import { useMemo, useState } from 'react';
import { useProducts } from '../hooks/useProducts';
import ProductGrid from '../components/ProductGrid/ProductGrid';
import './Search.css';

function SearchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  );
}

export default function Search() {
  const { products, loading } = useProducts();
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => {
      return (
        p.name?.toLowerCase().includes(q) ||
        p.cat?.toLowerCase().includes(q) ||
        p.desc?.toLowerCase().includes(q)
      );
    });
  }, [products, query]);

  return (
    <section className="page">
      <div className="wrap search-head">
        <span className="eyebrow">Find Something</span>
        <h1 className="shop-title">Search</h1>
        <div className="search-input-wrap">
          <SearchIcon />
          <input
            type="text"
            className="search-input"
            placeholder="Search by name, category, or keyword…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </div>
      </div>

      {loading && (
        <div className="wrap">
          <p className="search-status">Loading products…</p>
        </div>
      )}

      {!loading && results.length > 0 && <ProductGrid products={results} />}

      {!loading && results.length === 0 && (
        <div className="wrap">
          <p className="empty-note">
            No products found{query ? ` for “${query}”` : ''}. Try a different name, category, or keyword.
          </p>
        </div>
      )}
    </section>
  );
}
