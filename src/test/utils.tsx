import {
  render as rtlRender,
  RenderOptions,
  screen,
  waitFor,
  within,
  queryByText,
  getByText,
  queryByRole,
  getByRole,
  queryByLabelText,
  getByLabelText,
  queryByPlaceholderText,
  getByPlaceholderText,
} from '@testing-library/react';
import { ReactElement } from 'react';
import { SimpleWrapper } from './SimpleWrapper';

const customRender = (
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
) => rtlRender(ui, { wrapper: SimpleWrapper, ...options });

// Explicitly export what's needed from @testing-library/react
export { customRender as render };
export {
  screen,
  waitFor,
  within,
  queryByText,
  getByText,
  queryByRole,
  getByRole,
  queryByLabelText,
  getByLabelText,
  queryByPlaceholderText,
  getByPlaceholderText,
};

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
