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
          MNX ACCESSORIES is a virtual heaven for all algerian weirdos out there, where you will find all types of accessories and anime merch.
          from your pintrest feed to your hands.
          check our instagram page for more details!
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
