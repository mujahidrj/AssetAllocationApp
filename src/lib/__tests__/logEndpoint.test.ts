import { afterEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import handler from '../../../api/log';

/** Runs the handler and returns the status it answered with. */
function call(method: string, body: unknown, headers: Record<string, string> = { 'sec-fetch-site': 'same-origin' }): number | undefined {
  let code: number | undefined;
  const res: Record<string, unknown> = {};
  res.status = (c: number) => { code = c; return res; };
  res.end = () => res;
  res.setHeader = () => res;
  handler({ method, body, headers } as unknown as VercelRequest, res as unknown as VercelResponse);
  return code;
}

describe('/api/log', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("writes a timing line with only each event's own fields, in their own formats", () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(call('POST', {
      event: 'sign-in',
      outcome: 'popup-closed-by-user',
      attempt: 1,
      beforeWindowMs: 182.6,
      windowMs: null,
      blurs: 2.5,
      net: 'wifi',
      at: '2026-11-23T18:30:00.000Z',
      uid: 'aB3dE5gH7jK9mN1pQ3sT5vX7zA9c',
      totalMs: 'alice.smith',
      email: 'someone@example.com',
    })).toBe(204);
    expect(log).toHaveBeenCalledWith(
      '[timing] {"event":"sign-in","outcome":"popup-closed-by-user","attempt":1,"beforeWindowMs":183,"windowMs":null}',
    );
  });

  it('drops an outcome that could carry anything else', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(call('POST', { event: 'sign-in', outcome: 'alice.smith@example.com', totalMs: 900 })).toBe(204);
    expect(log).toHaveBeenCalledWith('[timing] {"event":"sign-in","totalMs":900}');
  });

  it('reads a body sent as text', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(call('POST', JSON.stringify({ event: 'portfolios-load', outcome: 'ok', ms: 640 }))).toBe(204);
    expect(log).toHaveBeenCalledWith('[timing] {"event":"portfolios-load","outcome":"ok","ms":640}');
  });

  it('turns away anything else', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(call('GET', undefined)).toBe(405);
    expect(call('POST', { event: 'something-else', ms: 1 })).toBe(400);
    expect(call('POST', 'not json')).toBe(400);
    expect(call('POST', [1, 2])).toBe(400);
    expect(call('POST', { event: 'sign-in', pad: 'x'.repeat(2000) })).toBe(413);
    expect(call('POST', { event: 'toString' })).toBe(400);
    expect(call('POST', { event: 'sign-in', totalMs: 1 }, { 'sec-fetch-site': 'cross-site' })).toBe(403);
    expect(log).not.toHaveBeenCalled();
  });
});
