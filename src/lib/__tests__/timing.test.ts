import { afterEach, describe, expect, it, vi } from 'vitest';
import { outcomeFor, reportTiming, startSignInTiming } from '../timing';

const clock = (...times: number[]) => {
  const spy = vi.spyOn(performance, 'now');
  times.forEach(t => spy.mockReturnValueOnce(t));
  return spy;
};

describe('sign-in timing', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(navigator, 'sendBeacon');
  });

  it('splits the wait into before the Google window, inside it, and after', () => {
    clock(1000, 1180, 3180, 4180);
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([
      { name: 'https://fonts.googleapis.com/css2', startTime: 10, duration: 40 },
      { name: 'https://apis.google.com/js/api.js', startTime: 1002, duration: 150.4 },
      { name: 'https://example.firebaseapp.com/__/auth/iframe', startTime: 1160, duration: 501 },
    ] as unknown as PerformanceEntryList);

    const timing = startSignInTiming();
    window.dispatchEvent(new Event('blur')); // the Google window takes focus
    window.dispatchEvent(new Event('focus')); // back here once it closes
    window.dispatchEvent(new Event('focus')); // later focus doesn't move it
    expect(timing.finish('signed-in')).toMatchObject({
      event: 'sign-in',
      outcome: 'signed-in',
      beforeWindowMs: 180,
      windowMs: 2000,
      afterWindowMs: 1000,
      totalMs: 3180,
      blurs: 1,
      helperScriptMs: 150,
      helperFrameMs: 501,
    });
  });

  it('counts extra blurs (switching apps) so an unreliable split shows', () => {
    clock(0, 50, 900);
    const timing = startSignInTiming();
    window.dispatchEvent(new Event('blur'));
    window.dispatchEvent(new Event('blur'));
    expect(timing.finish('popup-closed-by-user')).toMatchObject({
      beforeWindowMs: 50,
      windowMs: 850, // never came back before it finished
      afterWindowMs: null,
      blurs: 2,
    });
  });

  it('takes the page being hidden as the window opening, for windows that open as tabs', () => {
    clock(0, 40, 700, 760);
    const timing = startSignInTiming();
    const visibility = (state: string) => {
      Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    };
    try {
      visibility('hidden');
      visibility('visible');
    } finally {
      Reflect.deleteProperty(document, 'visibilityState');
    }
    expect(timing.finish('signed-in')).toMatchObject({ beforeWindowMs: 40, windowMs: 660, afterWindowMs: 60, blurs: 0 });
  });

  it('leaves the window times empty when it never opened, and counts attempts', () => {
    clock(0, 20);
    const first = startSignInTiming().finish('popup-blocked');
    clock(100, 130);
    const second = startSignInTiming().finish('popup-blocked');
    expect(first).toMatchObject({ beforeWindowMs: null, windowMs: null, afterWindowMs: null, totalMs: 20, blurs: 0 });
    expect(second.totalMs).toBe(30);
    expect(second.attempt).toBe(first.attempt + 1);
    expect(second.helperScriptMs).toBeUndefined();
  });

  it('turns Firebase error codes into short labels', () => {
    expect(outcomeFor('auth/popup-closed-by-user')).toBe('popup-closed-by-user');
    expect(outcomeFor('auth/operation-not-supported-in-this-environment')).toBe('operation-not-supported-in-this-environment');
    expect(outcomeFor('firestore/permission_denied')).toBe('firestore-permission-denied');
    expect(outcomeFor(undefined)).toBe('error');
  });

  it('logs to the console, keeps the last 20 on this device, and sends one to the log', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const beacon = vi.fn(() => true);
    Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true });

    for (let ms = 1; ms <= 22; ms++) reportTiming({ event: 'portfolios-load', outcome: 'ok', ms });

    expect(info).toHaveBeenCalledTimes(22);
    const saved = JSON.parse(window.localStorage.getItem('assetAllocation.timings') ?? '[]');
    expect(saved).toHaveLength(20);
    expect(saved[0]).toMatchObject({ event: 'portfolios-load', ms: 3 });
    expect(saved[19].ms).toBe(22);
    expect(beacon).toHaveBeenCalledTimes(22);
    expect(beacon).toHaveBeenLastCalledWith('/api/log', expect.any(Blob));
  });

  it.each(['{"not":"a list"}', 'not json'])('starts over when what was saved is unreadable: %s', bad => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    window.localStorage.setItem('assetAllocation.timings', bad);
    reportTiming({ event: 'portfolios-load', outcome: 'failed', ms: 900 });
    const saved = JSON.parse(window.localStorage.getItem('assetAllocation.timings') ?? '[]');
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ outcome: 'failed', ms: 900 });
  });
});
