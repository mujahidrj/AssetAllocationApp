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
}

export interface CalculatorState {
  amount: string;
  validationErrors: ValidationErrors;
  newStockName: string;
  localStocks: Stock[];
  currentStocks: Stock[];
  allocations: AllocationResult[] | null;
  loading: boolean;
}

export interface CalculatorActions {
  setAmount: (amount: string) => void;
  addStock: (symbol: string) => Promise<void>;
  removeStock: (index: number) => void;
  updateStockPercentage: (index: number, percentage: string) => void;
  handleSamplePortfolioChange: (portfolioName: string) => void;
  setNewStockName: (value: string) => void;
}
