import { http, HttpResponse } from 'msw';

// MSW handlers for API mocking
// Install msw: npm install --save-dev msw

export const handlers = [
  // Stock price API - handle both localhost and production URLs
  http.get('*/api/stock/:symbol', ({ params }) => {
    const { symbol } = params;
    const mockPrices: Record<string, number> = {
      AAPL: 150.25,
      MSFT: 350.50,
      GOOGL: 2800.00,
      VTSAX: 120.00,
      VOO: 450.00,
      FZROX: 15.50,
      FZILX: 12.75,
    };

    const price = mockPrices[symbol as string] || 100.00;
    
    return HttpResponse.json({ price });
  }),

  // Finnhub stock search API
  http.get('https://finnhub.io/api/v1/search', ({ request }) => {
    const url = new URL(request.url);
    const query = url.searchParams.get('q');
    
    const mockCompanies: Record<string, string> = {
      AAPL: 'Apple Inc.',
      MSFT: 'Microsoft Corporation',
      GOOGL: 'Alphabet Inc.',
      VTSAX: 'Vanguard Total Stock Market Index Fund',
      VOO: 'Vanguard S&P 500 ETF',
      FZROX: 'Fidelity ZERO Total Market Index Fund',
      FZILX: 'Fidelity ZERO International Index Fund',
    };

    const description = mockCompanies[query || ''] || `${query} Corporation`;
    
    return HttpResponse.json({
      result: [{ description, symbol: query }],
    });
  }),
];
