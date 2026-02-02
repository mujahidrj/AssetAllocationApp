import type { VercelRequest, VercelResponse } from '@vercel/node';
import fetch from 'node-fetch';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Allow requests from any origin in development, specific origin in production
  const origin = process.env.NODE_ENV === 'production'
    ? 'https://asset-allocation-app-nine.vercel.app'
    : '*';

  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,HEAD');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { q } = req.query;

  if (!q || typeof q !== 'string') {
    return res.status(400).json({ error: 'Query parameter q is required' });
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    // Yahoo Finance autocomplete endpoint
    // Using query1.finance.yahoo.com which seems more reliable than d.yimg.com
    const response = await fetch(
      `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json'
        },
        signal: controller.signal
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Yahoo Finance search API error:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText
      });
      return res.status(response.status).json({
        error: `Failed to fetch search results from Yahoo Finance: ${response.statusText}`
      });
    }

    const data = await response.json() as {
      quotes?: Array<{
        symbol?: string;
        shortname?: string;
        longname?: string;
        quoteType?: string;
      }>;
    };

    // Transform Yahoo Finance response to match our expected format
    const results = (data.quotes || []).map((quote) => ({
      symbol: quote.symbol || '',
      description: quote.longname || quote.shortname || quote.symbol || '',
    })).filter(item => item.symbol && item.description);

    return res.json({
      result: results
    });
  } catch (error) {
    console.error('Error fetching search results:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch search results';
    return res.status(500).json({ error: errorMessage });
  }
}
