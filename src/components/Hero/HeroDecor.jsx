import logo from '../../assets/images/logo.png';
import heroFlower from '../../assets/images/hero-flower.png';
import Blob from '../UI/Blob';
import Swirl from '../UI/Swirl';
import './HeroDecor.css';

export default function HeroDecor() {
  return (
    <div className="hero-decor">
      <Blob pathIndex={0} opacityClass="o1" style={{ width: 420, height: 420, top: '-8%', left: '-6%' }} />
      <Blob pathIndex={1} opacityClass="o2" style={{ width: 340, height: 340, bottom: '-10%', left: '38%' }} />
      <Blob pathIndex={0} opacityClass="o2" style={{ width: 220, height: 220, top: '36%', left: '64%' }} />

      <img className="hero-logo-mark" src={logo} alt="" aria-hidden="true" />

      {/* Static — no continuous rotation, just a one-time fade/scale-in on load. */}
      <img
        className="hero-flower-graphic"
        src={heroFlower}
        alt=""
        aria-hidden="true"
        style={{ width: 120, height: 120, top: '14%', left: '7%' }}
      />
      <img
        className="hero-flower-graphic"
        src={heroFlower}
        alt=""
        aria-hidden="true"
        style={{ width: 72, height: 72, bottom: '16%', right: '10%', animationDelay: '0.15s' }}
      />

      <Swirl style={{ width: 160, height: 230, bottom: '-4%', left: '2%' }} />
    </div>
  );
}
