/**
 * How long sign-in takes, step by step, so a slow sign-in can be traced to the part that was slow.
 * Each timing goes to the browser console, stays on this device (the last 20, under
 * `assetAllocation.timings`), and is sent to `/api/log`, which writes it to the function logs.
 * Timings carry no names, emails or account ids. Timing never gets in the way: nothing here throws.
 */
export type Timing =
  | {
      event: 'sign-in';
      /** "signed-in", or why not: "popup-closed-by-user", "popup-blocked", … */
      outcome: string;
      /** 1 for the first sign-in since the page loaded (Firebase loads its helper then). */
      attempt: number;
      /** Click until this page lost focus or was hidden (the Google window opening); null if it never did. */
      beforeWindowMs: number | null;
      /** The Google window: from opening until this page had focus again (Google's pages plus choosing an account). */
      windowMs: number | null;
      /**
       * From this page getting focus back until Firebase finished: the sign-in itself after Google
       * answers, or Firebase noticing the window was closed (it checks every few seconds).
       */
      afterWindowMs: number | null;
      totalMs: number;
      /** Times this page lost focus during the attempt. More than 1 (switching apps) makes the split unreliable. */
      blurs: number;
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

function savedTimings(): unknown[] {
  try {
    const saved: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(saved) ? saved : [];
  } catch {
    return []; // unreadable: start over
  }
}

export function reportTiming(timing: Timing) {
  try {
    const line = { ...timing, at: new Date().toISOString() };
    console.info('[timing]', line);
    try {
      window.localStorage.setItem(KEY, JSON.stringify([...savedTimings(), line].slice(-KEEP)));
    } catch {
      // Storage full or off: the console line is still there
    }
    if (typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon('/api/log', new Blob([JSON.stringify(line)], { type: 'application/json' }));
    }
  } catch {
    // Logging must never get in the way
  }
}

/** A Firebase error code as a short label: "auth/popup-blocked" → "popup-blocked". */
export function outcomeFor(code: unknown): string {
  if (typeof code !== 'string') return 'error';
  return code.replace(/^auth\//, '').toLowerCase().replace(/[^a-z-]/g, '-').slice(0, 64) || 'error';
}

let attempts = 0;

/**
 * Starts timing one sign-in. The Google window opening shows up as this page losing focus
 * (or being hidden, when it opens as a tab), and closing as the page getting focus back,
 * so nothing of Firebase's has to be touched.
 */
export function startSignInTiming() {
  attempts += 1;
  const attempt = attempts;
  const start = performance.now();
  let opened: number | null = null;
  let back: number | null = null;
  let blurs = 0;

  const away = () => {
    if (opened === null) opened = performance.now();
  };
  const onBlur = () => { blurs += 1; away(); };
  const onFocus = () => {
    if (opened !== null && back === null) back = performance.now();
  };
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') away();
    else onFocus();
  };
  window.addEventListener('blur', onBlur);
  window.addEventListener('focus', onFocus);
  document.addEventListener('visibilitychange', onVisibility);

  return {
    finish(outcome: string): SignInTiming {
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      const end = performance.now();
      const timing: SignInTiming = {
        event: 'sign-in',
        outcome,
        attempt,
        beforeWindowMs: opened === null ? null : Math.round(opened - start),
        windowMs: opened === null ? null : Math.round((back ?? end) - opened),
        afterWindowMs: back === null ? null : Math.round(end - back),
        totalMs: Math.round(end - start),
        blurs,
      };
      try {
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
      } catch {
        // The extras are nice to have
      }
      return timing;
    },
  };
}
