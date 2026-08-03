import { useEffect, useState } from 'react';

/** Returns true once the page has scrolled past `offset` pixels. */
export function useNavScroll(offset = 10) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > offset);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [offset]);

  return scrolled;
}
