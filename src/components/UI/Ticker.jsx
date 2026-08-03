import { CATEGORIES } from '../../utils/constants';
import './Ticker.css';

function DotIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <circle cx="12" cy="12" r="8" strokeDasharray="2 3" />
    </svg>
  );
}

export default function Ticker() {
  // Duplicated once so the marquee can loop seamlessly at -50% translate.
  const items = [...CATEGORIES, ...CATEGORIES];

  return (
    <div className="ticker">
      <div className="ticker-track">
        {items.map((category, i) => (
          <span key={`${category}-${i}`}>
            {category}
            <DotIcon />
          </span>
        ))}
      </div>
    </div>
  );
}
