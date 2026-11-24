import type { VercelRequest, VercelResponse } from '@vercel/node';

type Check = (value: unknown) => boolean;

const label = (pattern: RegExp): Check => value => typeof value === 'string' && pattern.test(value);
const ms: Check = value => value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value < 1e7);
const count: Check = value => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < 1000;

/**
 * Exactly the fields the app sends for each event (see src/lib/timing.ts), each with its format.
 * Anything else is dropped, so nothing like a name, an email or an account id can be logged.
 */
const FIELDS: Record<string, Record<string, Check>> = {
  'sign-in': {
    outcome: label(/^[a-z-]{1,64}$/),
    attempt: count,
    beforeWindowMs: ms,
    windowMs: ms,
    afterWindowMs: ms,
    totalMs: ms,
    blurs: count,
    helperScriptMs: ms,
    helperFrameMs: ms,
    net: label(/^(slow-2g|2g|3g|4g)$/),
  },
  'portfolios-load': {
    outcome: label(/^(ok|failed)$/),
    ms,
  },
};
const MAX_BODY = 1000;

/** Writes one timing line to the function logs, for finding out why a sign-in was slow. */
export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).end();
    return;
  }
  // Browsers say where a request came from; only the app's own pages may log
  const site = req.headers?.['sec-fetch-site'];
  if (site && site !== 'same-origin') {
    res.status(403).end();
    return;
  }

  let body: unknown = req.body;
  const raw = typeof body === 'string' ? body : JSON.stringify(body ?? null);
  if (raw.length > MAX_BODY) {
    res.status(413).end();
    return;
  }
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      res.status(400).end();
      return;
    }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    res.status(400).end();
    return;
  }

  const sent = body as Record<string, unknown>;
  const event = typeof sent.event === 'string' ? sent.event : '';
  const fields = Object.prototype.hasOwnProperty.call(FIELDS, event) ? FIELDS[event] : null;
  if (!fields) {
    res.status(400).end();
    return;
  }
  const clean: Record<string, unknown> = { event };
  for (const [key, check] of Object.entries(fields)) {
    if (!(key in sent) || !check(sent[key])) continue;
    const value = sent[key];
    clean[key] = typeof value === 'number' ? Math.round(value) : value;
  }

  console.log(`[timing] ${JSON.stringify(clean)}`);
  res.status(204).end();
}
