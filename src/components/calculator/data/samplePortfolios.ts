import type { SamplePortfolio, Stock } from '../types';

// Reusable stock definitions with company names
const stockDefinitions: Record<string, string> = {
  // Fidelity
  FZROX: "Fidelity ZERO Total Market Index Fund",
  FZILX: "Fidelity ZERO International Index Fund",

  // Vanguard
  VTI: "Vanguard Total Stock Market ETF",
  VXUS: "Vanguard Total International Stock ETF",
  BND: "Vanguard Total Bond Market ETF",

  // Schwab
  SCHB: "Schwab U.S. Broad Market ETF",
  SCHF: "Schwab International Equity ETF",
  SCHZ: "Schwab U.S. Aggregate Bond ETF",

  // Sharia/SP Funds
  SPUS: "The SP Funds S&P 500 Sharia Industry Exclusions ETF",
  SPTE: "The SP Funds S&P Global Technology ETF",
  SPWO: "The SP Funds S&P World ETF",
  SPSK: "The SP Funds Dow Jones Global Sukuk ETF",
  SPRE: "The SP Funds S&P Global Reit Sharia ETF",

  // Other
  CASH: "Cash USD",
  GLD: "SPDR Gold Shares",
  AMAPX: "Amana Participation Investor",
  WISEX: "Azzad Wise Capital",
};

// Helper function to create stock entries with percentages
function createStock(name: string, percentage: number): Stock {
  return {
    name,
    percentage,
    companyName: stockDefinitions[name],
  };
}

export const samplePortfolios: SamplePortfolio[] = [
  {
    name: "Fidelity 2-Fund Portfolio",
    stocks: [
      createStock("FZROX", 80),
      createStock("FZILX", 20),
    ]
  },
  {
    name: "Vanguard 3-Fund Portfolio",
    stocks: [
      createStock("VTI", 60),
      createStock("VXUS", 30),
      createStock("BND", 10),
    ]
  },
  {
    name: "Schwab 3-Fund Portfolio",
    stocks: [
      createStock("SCHB", 60),
      createStock("SCHF", 30),
      createStock("SCHZ", 10),
    ]
  },
  {
    name: "Sharia Portfolio Aggressive",
    stocks: [
      createStock("SPUS", 40),
      createStock("SPTE", 38),
      createStock("SPWO", 20),
      createStock("SPSK", 5),
      createStock("SPRE", 5),
      createStock("CASH", 2),
    ]
  },
  {
    name: "Sharia Portfolio Growth",
    stocks: [
      createStock("SPUS", 35),
      createStock("SPSK", 20),
      createStock("SPRE", 8),
      createStock("SPTE", 27),
      createStock("SPWO", 8),
      createStock("CASH", 2),
    ]
  },
  {
    name: "Sharia Portfolio Moderate",
    stocks: [
      createStock("SPSK", 35),
      createStock("SPUS", 30),
      createStock("SPTE", 18),
      createStock("SPRE", 10),
      createStock("SPWO", 5),
      createStock("CASH", 2),
    ]
  },
  {
    name: "Sharia Portfolio Income",
    stocks: [
      createStock("SPSK", 47),
      createStock("SPUS", 25),
      createStock("SPRE", 10),
      createStock("SPTE", 9),
      createStock("SPWO", 6),
      createStock("GLD", 3),
      createStock("CASH", 2),
    ]
  },
  {
    name: "Sharia Portfolio Conservative",
    stocks: [
      createStock("SPSK", 58),
      createStock("SPUS", 20),
      createStock("SPRE", 10),
      createStock("SPWO", 5),
      createStock("GLD", 5),
      createStock("CASH", 2),
    ]
  },
  {
    name: "Sharia Portfolio Sukuk",
    stocks: [
      createStock("SPSK", 43),
      createStock("AMAPX", 10),
      createStock("SPUS", 10),
      createStock("WISEX", 10),
      createStock("SPRE", 13),
      createStock("GLD", 6),
      createStock("SPWO", 5),
      createStock("CASH", 2),
    ]
  }
];
