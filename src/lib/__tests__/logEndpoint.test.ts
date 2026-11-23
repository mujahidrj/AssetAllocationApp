import { afterEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import handler from '../../../api/log';

/** Runs the handler and returns the status it answered with. */
function call(method: string, body: unknown): number | undefined {
  let code: number | undefined;
  const res: Record<string, unknown> = {};
  res.status = (c: number) => { code = c; return res; };
  res.end = () => res;
  res.setHeader = () => res;
  handler({ method, body } as unknown as VercelRequest, res as unknown as VercelResponse);
  return code;
}

describe('/api/log', () => {
  afterEach(() => vi.restoreAllMocks());

  it('writes a timing line, keeping only short labels and plain numbers', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(call('POST', {
      event: 'sign-in',
      outcome: 'popup-closed-by-user',
      beforeWindowMs: 182.6,
      windowMs: null,
      at: '2026-11-23T18:30:00.000Z',
      email: 'someone@example.com',
      note: 'a long sentence with spaces in it',
      'bad key': 1,
      nested: { a: 1 },
      huge: 1e9,
    })).toBe(204);
    expect(log).toHaveBeenCalledWith(
      '[timing] {"event":"sign-in","outcome":"popup-closed-by-user","beforeWindowMs":183,"windowMs":null,"at":"2026-11-23T18:30:00.000Z"}',
    );
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
    expect(log).not.toHaveBeenCalled();
  });
});
