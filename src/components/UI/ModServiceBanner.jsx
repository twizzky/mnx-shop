import Button from './Button';
import Swirl from './Swirl';
import { buildWhatsAppLink } from '../../utils/constants';
import './ModServiceBanner.css';

export default function ModServiceBanner() {
  const modLink = buildWhatsAppLink("Hi MNX! I'd like to ask about a custom console mod.");

  return (
    <section className="mod-service section-tight">
      <Swirl style={{ width: 120, height: 180, top: '-10%', right: '4%', color: 'var(--paper)', opacity: 0.06 }} />
      <div className="wrap mod-grid">
        <div>
          <span className="eyebrow">Custom Work</span>
          <h2>Console modding service</h2>
          <p>
            Got a console you want to make your own? Send us your specs — custom shells, buttons, paint jobs, or
            a full internal mod — and we&apos;ll bring it to life.
          </p>
        </div>
        <Button href={modLink} target="_blank" rel="noopener noreferrer" variant="primary">
          Request a Mod
        </Button>
      </div>
    </section>
  );
}
