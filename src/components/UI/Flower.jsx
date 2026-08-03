import './Flower.css';

export default function Flower({ style, spin = true }) {
  const petals = Array.from({ length: 6 }, (_, i) => {
    const angle = i * 60;
    return (
      <ellipse
        key={angle}
        className="petal"
        cx="0"
        cy="-11"
        rx="6.5"
        ry="10"
        transform={`rotate(${angle})`}
      />
    );
  });

  return (
    <svg
      className={`doodle-flower${spin ? ' spin' : ''}`}
      style={style}
      viewBox="-20 -20 40 40"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <g>
        {petals}
        <circle className="center" r="3.2" />
      </g>
    </svg>
  );
}
