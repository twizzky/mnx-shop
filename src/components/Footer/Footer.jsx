import { Link } from 'react-router-dom';
import logo from '../../assets/images/logo.png';
import { SOCIAL_LINKS } from '../../utils/constants';
import SquiggleDivider from '../UI/SquiggleDivider';
import './Footer.css';

function InstagramIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" />
    </svg>
  );
}
function TikTokIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5" />
    </svg>
  );
}
function WhatsAppIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M3 21l1.65-4.95A9 9 0 1 1 8 19.5L3 21" />
      <path d="M8.5 9.5c0 3.5 3 6.5 6.5 6.5" />
    </svg>
  );
}

export default function Footer() {
  return (
    <>
      <SquiggleDivider dense />
      <footer>
        <div className="wrap">
          <div className="footer-top">
            <div className="footer-brand">
              <img className="brand-logo" src={logo} alt="MNX Accessories logo" />
              <p>Anime keychains and gaming accessories — curated and shipped with care.</p>
            </div>
            <div className="footer-links">
              <span className="eyebrow">Info</span>
              <Link to="/delivery-prices">Delivery Prices</Link>
            </div>
            <div className="footer-social">
              <a className="social-btn" href={SOCIAL_LINKS.instagram} target="_blank" rel="noopener noreferrer" aria-label="Instagram">
                <InstagramIcon />
              </a>
              <a className="social-btn" href={SOCIAL_LINKS.tiktok} target="_blank" rel="noopener noreferrer" aria-label="TikTok">
                <TikTokIcon />
              </a>
              <a className="social-btn" href={SOCIAL_LINKS.whatsapp} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp">
                <WhatsAppIcon />
              </a>
            </div>
          </div>
          <div className="footer-bottom">
            <span>© 2026 MNX Accessories. All rights reserved.</span>
            <span>Curated drops, restocked regularly.</span>
          </div>
        </div>
      </footer>
    </>
  );
}
