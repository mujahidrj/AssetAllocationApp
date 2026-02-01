import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();
const app = express();
const port = process.env.PORT || 3001;

app.use(cors());

app.get('/api/stock/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      return res.status(response.status).json({ 
        error: `Failed to fetch data from Yahoo Finance: ${response.statusText}` 
      });
    }
    
    const data = await response.json();
    
    // Extract price from Yahoo Finance API response structure
    // Response format: { chart: { result: [{ meta: { regularMarketPrice: number } }] } }
    if (data?.chart?.result?.[0]?.meta?.regularMarketPrice) {
      return res.json({
        symbol: data.chart.result[0].meta.symbol || symbol,
        price: data.chart.result[0].meta.regularMarketPrice
      });
    }
    
    // If no price data, return error
    console.error('Invalid Yahoo Finance API response:', { symbol, response: data });
    return res.status(500).json({ 
      error: `No price data available for symbol ${symbol}` 
    });
  } catch (error) {
    console.error('Error fetching stock data:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch stock data';
    return res.status(500).json({ error: errorMessage });
  }
});

app.listen(port, () => {
  console.log(`Proxy server running on port ${port}`);
});
