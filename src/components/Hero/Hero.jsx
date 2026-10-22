import { Link } from 'react-router-dom';
import Button from '../UI/Button';
import HeroDecor from './HeroDecor';
import { SOCIAL_LINKS } from '../../utils/constants';
import './Hero.css';

export default function Hero() {
  return (
    <section className="hero">
      <HeroDecor />
      <div className="wrap hero-content">
        <span className="eyebrow">Keychains · Accessories · Nationwide Delivery</span>
        <h1>Keychains &amp; accessories, delivered anywhere in Algeria.</h1>
        <p>
          MNX Accessories is a virtual haven for Algerian anime and accessory fans, where you'll find all types of accessories and anime merch
          straight from your Pinterest feed to your hands. 
          Follow us on Instagram for more details.
        </p>
        <div className="hero-actions">
          <Button as={Link} to="/shop" variant="primary">
            View All Products
          </Button>
          <Button href={SOCIAL_LINKS.instagram} target="_blank" rel="noopener noreferrer" variant="outline">
            Follow on Instagram
          </Button>
        </div>
      </div>
      <div className="scroll-cue">
        <span className="line" />
        Scroll
      </div>
    </section>
  );
}
