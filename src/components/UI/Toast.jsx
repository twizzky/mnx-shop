import { useToast } from '../../hooks/useToast';
import './Toast.css';

export default function Toast() {
  const { message, visible } = useToast();

  return (
    <div className={`toast${visible ? ' show' : ''}`} role="status" aria-live="polite">
      {message}
    </div>
  );
}
