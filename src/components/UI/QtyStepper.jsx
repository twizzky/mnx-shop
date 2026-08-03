import './QtyStepper.css';

export default function QtyStepper({ value, onIncrement, onDecrement, size }) {
  const classes = `qty-stepper${size === 'sm' ? ' sm' : ''}`;

  return (
    <div className={classes}>
      <button type="button" onClick={onDecrement} aria-label="Decrease quantity">
        −
      </button>
      <span>{value}</span>
      <button type="button" onClick={onIncrement} aria-label="Increase quantity">
        +
      </button>
    </div>
  );
}
