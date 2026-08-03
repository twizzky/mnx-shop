import { SWIRL_PATH } from '../../utils/decorPaths';
import './Swirl.css';

export default function Swirl({ style }) {
  return (
    <svg
      className="squiggle-swirl"
      style={style}
      viewBox="0 0 220 320"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d={SWIRL_PATH} strokeWidth="24" strokeLinecap="round" />
    </svg>
  );
}
