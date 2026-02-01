import type { SamplePortfolio } from '../types';

export const samplePortfolios: SamplePortfolio[] = [
  {
    name: "Fidelity 2-Fund Portfolio",
    stocks: [
      { name: "FZROX", percentage: 80, companyName: "Fidelity ZERO Total Market Index Fund" },
      { name: "FZILX", percentage: 20, companyName: "Fidelity ZERO International Index Fund" },
    ]
  },
  {
    name: "Vanguard 3-Fund Portfolio",
    stocks: [
      { name: "VTI", percentage: 60, companyName: "Vanguard Total Stock Market ETF" },
      { name: "VXUS", percentage: 30, companyName: "Vanguard Total International Stock ETF" },
      { name: "BND", percentage: 10, companyName: "Vanguard Total Bond Market ETF" },
    ]
  },
  {
    name: "Schwab 3-Fund Portfolio",
    stocks: [
      { name: "SCHB", percentage: 60, companyName: "Schwab U.S. Broad Market ETF" },
      { name: "SCHF", percentage: 30, companyName: "Schwab International Equity ETF" },
      { name: "SCHZ", percentage: 10, companyName: "Schwab U.S. Aggregate Bond ETF" },
    ]
  },
  {
    name: "Sharia Portfolio Aggressive",
    "stocks": [
      { name: "SPUS", percentage: 40, companyName: "The SP Funds S&P 500 Sharia Industry Exclusions ETF" },
      { name: "SPTE", percentage: 38, companyName: "The SP Funds S&P Global Technology ETF" },
      { name: "SPWO", percentage: 20, companyName: "The SP Funds S&P World ETF" },
      { name: "SPSK", percentage: 5, companyName: "The SP Funds Dow Jones Global Sukuk ETF" },
      { name: "SPRE", percentage: 5, companyName: "The SP Funds S&P Global Reit Sharia ETF" },
      { name: "CASH", percentage: 2, companyName: "Cash USD" }
    ]
  },
  {
    name: "Sharia Portfolio Growth",
    "stocks": [
      { name: "SPUS", percentage: 35, companyName: "The SP Funds S&P 500 Sharia Industry Exclusions ETF" },
      { name: "SPSK", percentage: 20, companyName: "The SP Funds Dow Jones Global Sukuk ETF" },
      { name: "SPRE", percentage: 8, companyName: "The SP Funds S&P Global Reit Sharia ETF" },
      { name: "SPTE", percentage: 27, companyName: "The SP Funds S&P Global Technology ETF" },
      { name: "SPWO", percentage: 8, companyName: "The SP Funds S&P World ETF" },
      { name: "CASH", percentage: 2, companyName: "Cash USD" }
    ]
  },
  {
    name: "Sharia Portfolio Moderate",
    "stocks": [
      { name: "SPSK", percentage: 35, companyName: "The SP Funds Dow Jones Global Sukuk ETF" },
      { name: "SPUS", percentage: 30, companyName: "The SP Funds S&P 500 Sharia Industry Exclusions ETF" },
      { name: "SPTE", percentage: 18, companyName: "The SP Funds S&P Global Technology ETF" },
      { name: "SPRE", percentage: 10, companyName: "The SP Funds S&P Global Reit Sharia ETF" },
      { name: "SPWO", percentage: 5, companyName: "The SP Funds S&P World ETF" },
      { name: "CASH", percentage: 2, companyName: "Cash USD" }
    ]
  },
  {
    name: "Sharia Portfolio Income",
    "stocks": [
      { name: "SPSK", percentage: 47, companyName: "The SP Funds Dow Jones Global Sukuk ETF" },
      { name: "SPUS", percentage: 25, companyName: "The SP Funds S&P 500 Sharia Industry Exclusions ETF" },
      { name: "SPRE", percentage: 10, companyName: "The SP Funds S&P Global Reit Sharia ETF" },
      { name: "SPTE", percentage: 9, companyName: "The SP Funds S&P Global Technology ETF" },
      { name: "SPWO", percentage: 6, companyName: "The SP Funds S&P World ETF" },
      { name: "GLD", percentage: 3, companyName: "SPDR Gold Shares" },
      { name: "CASH", percentage: 2, companyName: "Cash USD" }
    ]
  },
  {
    name: "Sharia Portfolio Conservative",
    "stocks": [
      { name: "SPSK", percentage: 58, companyName: "The SP Funds Dow Jones Global Sukuk ETF" },
      { name: "SPUS", percentage: 20, companyName: "The SP Funds S&P 500 Sharia Industry Exclusions ETF" },
      { name: "SPRE", percentage: 10, companyName: "The SP Funds S&P Global Reit Sharia ETF" },
      { name: "SPWO", percentage: 5, companyName: "The SP Funds S&P World ETF" },
      { name: "GLD", percentage: 5, companyName: "SPDR Gold Shares" },
      { name: "CASH", percentage: 2, companyName: "Cash USD" }
    ]
  },
  {
    name: "Sharia Portfolio Sukuk",
    "stocks": [
      { name: "SPSK", percentage: 43, companyName: "The SP Funds Dow Jones Global Sukuk ETF" },
      { name: "AMAPX", percentage: 10, companyName: "Amana Participation Investor" },
      { name: "SPUS", percentage: 10, companyName: "The SP Funds S&P 500 Sharia Industry Exclusions ETF" },
      { name: "WISEX", percentage: 10, companyName: "Azzad Wise Capital" },
      { name: "SPRE", percentage: 13, companyName: "The SP Funds S&P Global Reit Sharia ETF" },
      { name: "GLD", percentage: 6, companyName: "SPDR Gold Shares" },
      { name: "SPWO", percentage: 5, companyName: "The SP Funds S&P World ETF" },
      { name: "CASH", percentage: 2, companyName: "Cash USD" }
    ]
  }
];
