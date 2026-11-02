import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { rememberSection } from '../../app/navigation';

const KEY = 'tcg.scroll';

function readPositions(): Record<string, number> {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) || '{}') as Record<string, number>;
  } catch {
    return {};
  }
}

/**
 * Scroll restoration for BrowserRouter: going Back restores where you were
 * (catalog → card → back lands on the same row); a new navigation starts at
 * the top. Query-only changes (filters, ?card=) keep the current position.
 * Also records the last section per area so the rail can return to it.
 */
export function ScrollMemory() {
  const location = useLocation();
  const navType = useNavigationType();
  const prevPath = useRef(location.pathname);

  useEffect(() => {
    rememberSection(location.pathname, location.search);
  }, [location.pathname, location.search]);

  useEffect(() => {
    const save = () => {
      const positions = readPositions();
      positions[location.key] = window.scrollY;
      try {
        sessionStorage.setItem(KEY, JSON.stringify(positions));
      } catch {
        /* storage unavailable */
      }
    };
    window.addEventListener('pagehide', save);
    return () => {
      save();
      window.removeEventListener('pagehide', save);
    };
  }, [location.key]);

  useLayoutEffect(() => {
    const pathChanged = prevPath.current !== location.pathname;
    prevPath.current = location.pathname;
    if (navType === 'POP') {
      const y = readPositions()[location.key];
      if (y != null) {
        // Content may still be loading; retry briefly until the page is tall enough.
        let tries = 0;
        const attempt = () => {
          window.scrollTo(0, y);
          if (Math.abs(window.scrollY - y) > 4 && tries++ < 20) requestAnimationFrame(attempt);
        };
        attempt();
        return;
      }
    }
    if (pathChanged && navType !== 'POP') window.scrollTo(0, 0);
  }, [location.key, location.pathname, navType]);

  return null;
}
