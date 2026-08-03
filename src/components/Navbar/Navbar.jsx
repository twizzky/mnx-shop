import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import logo from '../../assets/images/logo.png';
import { SOCIAL_LINKS, buildWhatsAppLink } from '../../utils/constants';
import { useCart } from '../../hooks/useCart';
import { useNavScroll } from '../../hooks/useNavScroll';
import Button from '../UI/Button';
import './Navbar.css';

function CartIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  );
}

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const scrolled = useNavScroll();
  const { itemCount } = useCart();

  const closeMenu = () => setMenuOpen(false);
  const contactLink = buildWhatsAppLink("Hi MNX! I have a question.");

  return (
    <header className={`site-nav${scrolled ? ' scrolled' : ''}`}>
      <div className="wrap nav-inner">
        <NavLink to="/" className="nav-logo" onClick={closeMenu}>
          <img className="brand-logo" src={logo} alt="MNX Accessories logo" />
          MNX ACCESSORIES
        </NavLink>

        <nav className={`nav-links${menuOpen ? ' open' : ''}`}>
          <NavLink to="/" onClick={closeMenu} end>
            Home
          </NavLink>
          <NavLink to="/shop" onClick={closeMenu}>
            Categories
          </NavLink>
          <a href={SOCIAL_LINKS.instagram} target="_blank" rel="noopener noreferrer">
            Instagram
          </a>
          {/* Also reachable from inside the mobile menu, since nav-links
              collapses into the hamburger dropdown below 820px. */}
          <a href={contactLink} target="_blank" rel="noopener noreferrer" className="nav-contact-mobile">
            Contact Us
          </a>
        </nav>

        <div className="nav-actions">
          <NavLink to="/search" className="search-btn" aria-label="Search" onClick={closeMenu}>
            <SearchIcon />
          </NavLink>
          <Button
            href={contactLink}
            target="_blank"
            rel="noopener noreferrer"
            variant="outline"
            size="sm"
            className="nav-contact-btn"
          >
            Contact Us
          </Button>
          <NavLink to="/cart" className="cart-btn" aria-label="Cart">
            <CartIcon />
            <span className={`cart-count${itemCount > 0 ? ' show' : ''}`}>{itemCount}</span>
          </NavLink>
          <button
            type="button"
            className={`hamburger${menuOpen ? ' open' : ''}`}
            onClick={() => setMenuOpen((open) => !open)}
            aria-label="Menu"
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </div>
    </header>
  );
}
