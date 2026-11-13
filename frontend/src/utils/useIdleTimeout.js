import { useEffect, useRef } from 'react';

// Auto-logout after a period of user inactivity.
// Activity = mouse, keyboard, touch, or scroll. The last-activity timestamp is
// mirrored to localStorage so the timeout is shared across browser tabs.
const IDLE_MINUTES = 30;
const IDLE_MS = IDLE_MINUTES * 60 * 1000;
const CHECK_MS = 30 * 1000; // re-check every 30s
const STORAGE_KEY = 'lastActivity';

export default function useIdleTimeout(onIdle, enabled = true) {
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;

  useEffect(() => {
    if (!enabled) return;

    const markActivity = () => {
      localStorage.setItem(STORAGE_KEY, String(Date.now()));
    };

    // Seed an initial timestamp if none exists.
    if (!localStorage.getItem(STORAGE_KEY)) markActivity();

    const events = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll', 'click'];
    // Throttle writes: only update at most once every 5s.
    let lastWrite = 0;
    const handler = () => {
      const now = Date.now();
      if (now - lastWrite > 5000) { lastWrite = now; markActivity(); }
    };
    events.forEach(e => window.addEventListener(e, handler, { passive: true }));

    const interval = setInterval(() => {
      const last = parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10);
      if (last && Date.now() - last > IDLE_MS) {
        onIdleRef.current?.();
      }
    }, CHECK_MS);

    return () => {
      events.forEach(e => window.removeEventListener(e, handler));
      clearInterval(interval);
    };
  }, [enabled]);
}

export { IDLE_MINUTES };
