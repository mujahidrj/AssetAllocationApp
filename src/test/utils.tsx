import { render as rtlRender, RenderOptions } from '@testing-library/react';
import { ReactElement, ReactNode } from 'react';

// Simple wrapper that doesn't require AuthProvider
// Most component tests don't need auth context
const SimpleWrapper = ({ children }: { children: ReactNode }) => {
  return <>{children}</>;
};

const customRender = (
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
) => rtlRender(ui, { wrapper: SimpleWrapper, ...options });

// Re-export everything
export * from '@testing-library/react';
export { customRender as render };

// Test utilities
export const createMockStock = (overrides?: Partial<import('../components/calculator/types').Stock>) => ({
  name: 'TEST',
  percentage: 50,
  companyName: 'Test Company',
  ...overrides,
});

export const createMockPosition = (overrides?: Partial<import('../components/calculator/types').CurrentPosition>) => ({
  symbol: 'TEST',
  value: 1000,
  inputType: 'value' as const,
  companyName: 'Test Company',
  ...overrides,
});

export const waitForAsync = () => new Promise(resolve => setTimeout(resolve, 0));
