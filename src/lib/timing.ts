/**
 * How long sign-in takes, step by step, so a slow sign-in can be traced to the part that was slow.
 * Each timing goes to the browser console, stays on this device (the last 20, under
 * `assetAllocation.timings`), and is sent to `/api/log`, which writes it to the function logs.
 * Timings carry no names, emails or account ids.
 */
export type Timing =
  | {
      event: 'sign-in';
      /** "signed-in", or why not: "popup-closed-by-user", "popup-blocked", … */
      outcome: string;
      /** 1 for the first sign-in since the page loaded (Firebase loads its helper then). */
      attempt: number;
      /** Click until the Google window took focus; null if it never opened. */
      beforeWindowMs: number | null;
      /** From the window opening until sign-in finished: Google's pages plus choosing an account. */
      windowMs: number | null;
      totalMs: number;
      /** Firebase's helper, when it loaded during this attempt: Google's script and its frame. */
      helperScriptMs?: number;
      helperFrameMs?: number;
      /** The browser's guess at the connection: "4g", "3g", … */
      net?: string;
    }
  | {
      event: 'portfolios-load';
      outcome: 'ok' | 'failed';
      /** Reading the saved portfolios from the account after signing in (or opening the page signed in). */
      ms: number;
    };

type SignInTiming = Extract<Timing, { event: 'sign-in' }>;

const KEY = 'assetAllocation.timings';
const KEEP = 20;

export function reportTiming(timing: Timing) {
  const line = { ...timing, at: new Date().toISOString() };
  console.info('[timing]', line);
  try {
    const saved: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? '[]');
    const list = Array.isArray(saved) ? saved : [];
    window.localStorage.setItem(KEY, JSON.stringify([...list, line].slice(-KEEP)));
  } catch {
    // Storage full or off: the console line is still there
  }
  try {
    if (typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon('/api/log', new Blob([JSON.stringify(line)], { type: 'application/json' }));
    }
  } catch {
    // Logging must never get in the way
  }
}

let attempts = 0;

/**
 * Starts timing one sign-in. The Google window opening is seen as this page losing focus
 * to it, so nothing of Firebase's has to be touched.
 */
export function startSignInTiming() {
  attempts += 1;
  const attempt = attempts;
  const start = performance.now();
  let opened: number | null = null;
  const onBlur = () => { if (opened === null) opened = performance.now(); };
  window.addEventListener('blur', onBlur);

  return {
    finish(outcome: string): SignInTiming {
      window.removeEventListener('blur', onBlur);
      const end = performance.now();
      const timing: SignInTiming = {
        event: 'sign-in',
        outcome,
        attempt,
        beforeWindowMs: opened === null ? null : Math.round(opened - start),
        windowMs: opened === null ? null : Math.round(end - opened),
        totalMs: Math.round(end - start),
      };
      // Firebase's helper: Google's script, then a frame from the project's auth domain
      const loads = typeof performance.getEntriesByType === 'function'
        ? performance.getEntriesByType('resource').filter(r => r.startTime >= start - 1)
        : [];
      const script = loads.find(r => r.name.includes('apis.google.com/js/api.js'));
      const frame = loads.find(r => r.name.includes('/__/auth/iframe'));
      if (script) timing.helperScriptMs = Math.round(script.duration);
      if (frame) timing.helperFrameMs = Math.round(frame.duration);
      const net = (navigator as Navigator & { connection?: { effectiveType?: string } }).connection?.effectiveType;
      if (net) timing.net = net;
      return timing;
    },
  };
}
