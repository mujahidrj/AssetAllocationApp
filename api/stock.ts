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

  const { symbol } = req.query;

  if (!symbol || typeof symbol !== 'string') {
    return res.status(400).json({ error: 'Symbol is required' });
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Accept': 'application/json'
        },
        signal: controller.signal
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Yahoo Finance API error:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText
      });
      return res.status(response.status).json({
        error: `Failed to fetch data from Yahoo Finance: ${response.statusText}`
      });
    }

    const data = await response.json() as {
      chart?: {
        result?: Array<{
          meta?: {
            regularMarketPrice?: number;
            symbol?: string;
          }
        }>
      }
    };

    if (!data?.chart?.result?.[0]?.meta?.regularMarketPrice) {
      console.error('Invalid Yahoo Finance API response:', {
        symbol,
        response: data
      });
      return res.status(500).json({
        error: `No price data available for symbol ${symbol}`
      });
    }

    // Return only the necessary data
    return res.json({
      symbol: data.chart.result[0].meta.symbol,
      price: data.chart.result[0].meta.regularMarketPrice
    });
  } catch (error) {
    console.error('Error fetching stock data:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch stock data';
    return res.status(500).json({ error: errorMessage });
  }
}
