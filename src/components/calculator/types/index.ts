export interface ValidationErrors {
  [key: string]: string | undefined;
}

export interface Stock {
  name: string;
  percentage: number;
  companyName?: string;
}

export interface SamplePortfolio {
  name: string;
  stocks: Stock[];
}

export interface AllocationResult extends Stock {
  amount: string;
  currentPrice?: number | null;
  shares?: number;
}

export interface CurrentPosition {
  symbol: string;
  inputType: 'shares' | 'value';
  shares?: number;
  value?: number;
  companyName?: string;
}

export interface RebalanceResult extends AllocationResult {
  currentValue: number;
  currentPercentage: number;
  targetValue: number;
  difference: number;
  action: 'buy' | 'sell' | 'hold';
  sharesToTrade: number;
  currentShares?: number;
}

export type CalculatorMode = 'deposit' | 'rebalance';

export interface CalculatorState {
  amount: string;
  validationErrors: ValidationErrors;
  newStockName: string;
  localStocks: Stock[];
  currentStocks: Stock[];
  allocations: AllocationResult[] | null;
  loading: boolean;
  mode: CalculatorMode;
  currentPositions: CurrentPosition[];
  rebalanceStocks: Stock[];
  rebalanceResults: RebalanceResult[] | null;
  stockPrices: Record<string, number | null>;
  totalPortfolioValue: number;
}

export interface CalculatorActions {
  setAmount: (amount: string) => void;
  addStock: (symbol: string) => Promise<void>;
  addCash: () => void;
  removeStock: (index: number) => void;
  updateStockPercentage: (index: number, percentage: string) => void;
  handleSamplePortfolioChange: (portfolioName: string) => void;
  setNewStockName: (value: string) => void;
  setMode: (mode: CalculatorMode) => void;
  addCurrentPosition: (symbol: string) => Promise<void>;
  removeCurrentPosition: (index: number) => void;
  updateCurrentPosition: (index: number, updates: Partial<CurrentPosition>) => void;
  addRebalanceStock: (symbol: string) => Promise<void>;
  removeRebalanceStock: (index: number) => void;
  updateRebalancePercentage: (index: number, percentage: string) => void;
  addAssetToBoth: (symbol: string) => Promise<void>;
  addCashToBoth: () => void;
}
