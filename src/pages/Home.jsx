import { Link } from 'react-router-dom';
import Hero from '../components/Hero/Hero';
import Ticker from '../components/UI/Ticker';
import ProductGrid from '../components/ProductGrid/ProductGrid';
import Button from '../components/UI/Button';
import { useProducts } from '../hooks/useProducts';
import './Home.css';

export default function Home() {
  const { products, loading } = useProducts();
  const featured = products.filter((p) => p.featured);

  return (
    <main className="page">
      <Hero />

      <section className="about-strip section-tight">
        <div className="wrap about-grid">
          <div>
            <span className="eyebrow">Welcome to MNX</span>
            <p style={{ marginTop: 16 }}>
              MNX Accessories brings you handpicked anime keychains and gaming accessories — sourced, checked,
              and shipped with care to every wilaya.
            </p>
          </div>
          <div className="about-stats">
            <div className="stat">
              <b>500+</b>
              <span>Orders Delivered</span>
            </div>
            <div className="stat">
              <b>2</b>
              <span>Categories</span>
            </div>
            <div className="stat">
              <b>58</b>
              <span>Wilayas Delivered To</span>
            </div>
            <div className="stat">
              <b>4.9★</b>
              <span>Customer Rating</span>
            </div>
          </div>
        </div>
      </section>

      <Ticker />

      <section className="section">
        <div className="wrap">
          <div className="section-head">
            <div>
              <span className="eyebrow">Selected Pieces</span>
              <h2>Featured Drops</h2>
            </div>
            <Button as={Link} to="/shop" variant="outline" size="sm">
              View All Products
            </Button>
          </div>
        </div>
        {!loading && <ProductGrid products={featured} />}
      </section>
    </main>
  );
}
