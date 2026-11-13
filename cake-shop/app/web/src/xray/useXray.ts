// The studio's side of the x-ray window (devlog 07). The window is a show-only child window: it never calls the server.
// While it is open, the studio polls the order's trace and forwards the events to it with postMessage.
import { useCallback, useEffect, useRef, useState } from 'react';
import windowHtml from './window.html?raw';

const NAME = 'cake-xray';
const MARK = 1;
const SESSION = Math.random().toString(36).slice(2);

export function useXray(id: string, token: string) {
  const [available, setAvailable] = useState(false);
  const target = useRef<Window | null>(null);
  const last = useRef(0);

  // The x-ray button is shown only when the server records a trace (XRAY is not off).
  useEffect(() => {
    let live = true;
    fetch('/api/health')
      .then((r) => r.json())
      .then((h) => live && setAvailable(!!h.xray))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!available) return;
    const post = (msg: Record<string, unknown>) => {
      const w = target.current;
      if (!w || w.closed) return;
      try {
        w.postMessage({ cakeXray: MARK, ...msg }, window.location.origin);
      } catch {
        /* the window is gone */
      }
    };
    // A new window says hello; the studio answers and starts feeding it. After a studio reload the same window says hello again.
    const onMessage = (e: MessageEvent) => {
      const m = e.data;
      if (e.origin !== window.location.origin || !m || m.cakeXray !== MARK || m.type !== 'hello' || !e.source || e.source === window) return;
      if (target.current !== e.source) {
        target.current = e.source as Window;
        last.current = 0;
      }
      post({ type: 'ok', order: id, session: SESSION });
    };
    window.addEventListener('message', onMessage);
    // The studio is now showing another order (or just started): the window starts clean.
    last.current = 0;
    post({ type: 'order', order: id });

    let busy = false;
    const poll = window.setInterval(async () => {
      const w = target.current;
      if (!w) return;
      if (w.closed) {
        target.current = null;
        return;
      }
      if (busy) return;
      busy = true;
      try {
        const res = await fetch(`/api/orders/${id}/trace?t=${encodeURIComponent(token)}&after=${last.current}`, { cache: 'no-store' });
        if (!res.ok) return;
        const body = (await res.json()) as { events: { seq: number }[]; last: number };
        if (body.events.length) {
          last.current = body.events[body.events.length - 1].seq;
          post({ type: 'events', order: id, events: body.events });
        }
      } catch {
        /* the next poll tries again */
      } finally {
        busy = false;
      }
    }, 300);

    const gone = () => post({ type: 'gone' });
    window.addEventListener('pagehide', gone);
    return () => {
      window.clearInterval(poll);
      window.removeEventListener('message', onMessage);
      window.removeEventListener('pagehide', gone);
    };
  }, [available, id, token]);

  /** Opens the window (or brings the one that is open to the front). A second press never opens a second window. */
  const open = useCallback(() => {
    const w = window.open('', NAME, 'popup,width=1100,height=800');
    if (!w) return;
    if (!(w as Window & { __xray?: boolean }).__xray) {
      w.document.open();
      w.document.write(windowHtml);
      w.document.close();
    }
    w.focus();
  }, []);

  return { available, open };
}
