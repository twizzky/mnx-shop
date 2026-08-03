import './SquiggleDivider.css';

export default function SquiggleDivider({ dense = false }) {
  return (
    <div className={`squiggle-divider${dense ? ' dense' : ''}`}>
      <svg
        className="wavy-divider"
        viewBox="0 0 1200 60"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M0,30 C100,5 200,55 300,30 C400,5 500,55 600,30 C700,5 800,55 900,30 C1000,5 1100,55 1200,30"
          strokeWidth="1"
          opacity=".5"
        />
        <path
          d="M0,40 C100,15 200,65 300,40 C400,15 500,65 600,40 C700,15 800,65 900,40 C1000,15 1100,65 1200,40"
          strokeWidth="1"
          opacity=".3"
        />
        <path
          d="M0,20 C100,-5 200,45 300,20 C400,-5 500,45 600,20 C700,-5 800,45 900,20 C1000,-5 1100,45 1200,20"
          strokeWidth="1"
          opacity=".2"
        />
      </svg>
    </div>
  );
}
