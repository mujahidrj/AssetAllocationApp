import type { SamplePortfolio } from '../types';

export const samplePortfolios: SamplePortfolio[] = [
  {
    name: "Fidelity 2-Fund Portfolio",
    stocks: [
      { name: "FZROX", percentage: 80, companyName: "Fidelity ZERO Total Market Index Fund" },
      { name: "FZILX", percentage: 20, companyName: "Fidelity ZERO International Index Fund" }
    ]
  },
  {
    name: "Vanguard 3-Fund Portfolio",
    stocks: [
      { name: "VTI", percentage: 60, companyName: "Vanguard Total Stock Market ETF" },
      { name: "VXUS", percentage: 30, companyName: "Vanguard Total International Stock ETF" },
      { name: "BND", percentage: 10, companyName: "Vanguard Total Bond Market ETF" }
    ]
  },
  {
    name: "Schwab 3-Fund Portfolio",
    stocks: [
      { name: "SCHB", percentage: 60, companyName: "Schwab U.S. Broad Market ETF" },
      { name: "SCHF", percentage: 30, companyName: "Schwab International Equity ETF" },
      { name: "SCHZ", percentage: 10, companyName: "Schwab U.S. Aggregate Bond ETF" }
    ]
  }
];
