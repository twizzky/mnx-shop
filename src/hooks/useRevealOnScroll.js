import { useEffect, useRef, useState } from 'react';

/**
 * Observes the returned ref and flips `isVisible` to true the first
 * time the element scrolls into view, then stops observing. Used to
 * replace the original IntersectionObserver + classList.add('in') DOM
 * manipulation with React state.
 */
export function useRevealOnScroll(threshold = 0.1) {
  const ref = useRef(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [threshold]);

  return [ref, isVisible];
}
