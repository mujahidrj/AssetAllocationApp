import type { VercelRequest, VercelResponse } from '@vercel/node';

/** The events the app sends (see src/lib/timing.ts). Anything else is turned away. */
const EVENTS = new Set(['sign-in', 'portfolios-load']);
const MAX_BODY = 1000;
const MAX_FIELDS = 12;

/**
 * Writes one timing line to the function logs, for finding out why a sign-in was slow.
 * It's open to anyone, so it keeps only short labels and plain numbers: nothing that
 * could carry a name, an email or a long message.
 */
export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).end();
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

  const clean: Record<string, string | number | null> = {};
  for (const [key, value] of Object.entries(body)) {
    if (Object.keys(clean).length >= MAX_FIELDS) break;
    if (!/^[a-zA-Z]{1,24}$/.test(key)) continue;
    if (typeof value === 'number' && Number.isFinite(value) && Math.abs(value) < 1e7) clean[key] = Math.round(value);
    else if (typeof value === 'string' && /^[\w:.-]{1,40}$/.test(value)) clean[key] = value;
    else if (value === null) clean[key] = null;
  }
  if (typeof clean.event !== 'string' || !EVENTS.has(clean.event)) {
    res.status(400).end();
    return;
  }

  console.log(`[timing] ${JSON.stringify(clean)}`);
  res.status(204).end();
}
