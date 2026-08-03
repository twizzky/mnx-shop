import { createContext, useCallback, useMemo, useRef, useState } from 'react';

export const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [message, setMessage] = useState('');
  const [visible, setVisible] = useState(false);
  const timerRef = useRef(null);

  const showToast = useCallback((msg) => {
    setMessage(msg);
    setVisible(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setVisible(false), 2200);
  }, []);

  const value = useMemo(() => ({ message, visible, showToast }), [message, visible, showToast]);

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}
