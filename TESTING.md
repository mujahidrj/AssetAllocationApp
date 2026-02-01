# Testing Guide

## Current Status

**Coverage: 84.77%** ✅ (All thresholds exceeded)

- **Statements**: 84.77%
- **Branches**: 81.00%
- **Functions**: 84.09%
- **Lines**: 84.77%

See [COVERAGE_REPORT.md](./COVERAGE_REPORT.md) for detailed breakdown.

## Test Maintenance & CI/CD

### Automated Testing

Tests run automatically on:

- ✅ **Every push** to `main` or `develop` branches
- ✅ **Every pull request** to `main` or `develop` branches
- ✅ **Daily at 2 AM UTC** (scheduled run to catch regressions)

See [`.github/workflows/test.yml`](.github/workflows/test.yml) for CI configuration.

### Pre-Commit Testing (Recommended)

To run tests before committing locally, you can set up a pre-commit hook:

```bash
# Install husky (optional, for git hooks)
npm install --save-dev husky

# Create pre-commit hook
npx husky init
echo "npm test" > .husky/pre-commit
chmod +x .husky/pre-commit
```bash

Or manually run before committing:

```bash
npm test && git commit -m "your message"
```

### Test Maintenance Guidelines

1. **When to Update Tests:**
   - ✅ When adding new features/components
   - ✅ When fixing bugs (add regression test)
   - ✅ When refactoring code
   - ✅ When changing component behavior

2. **Coverage Requirements:**
   - **Minimum**: 80% overall coverage
   - **Target**: 85%+ overall coverage
   - **New code**: Should maintain or improve coverage

3. **Before Committing:**

   ```bash
   # Run tests locally
   npm test
   
   # Check coverage
   npm run test:coverage
   
   # Ensure no warnings
   npm test 2>&1 | grep -i warning
   ```

4. **Regular Maintenance:**
   - Review failing tests weekly
   - Update tests when dependencies change
   - Keep test data/mocks up to date
   - Review coverage reports monthly

5. **Handling Test Failures:**
   - Fix the test if it's a false positive
   - Fix the code if it's a real regression
   - Update tests if behavior intentionally changed
   - Document any intentional test exclusions

## Quick Start

### Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch

# Run specific test file
npm test -- useCalculator
```bash

### Viewing Coverage

```bash
npm run test:coverage
```

This generates:

- Terminal summary
- HTML report at `coverage/index.html`
- JSON report at `coverage/coverage-final.json`

## Test Structure

```text
src/
  components/
    calculator/
      ui/
        __tests__/
          AmountInput.test.tsx
          ViewToggle.test.tsx
          AllocationSummary.test.tsx
          ResultsSection.test.tsx
          StockList.test.tsx
          HoldingsTable.test.tsx
      hooks/
        __tests__/
          useCalculator.test.ts
  test/
    RothIRACalculator.test.tsx
    handlers.ts          # MSW API mocks
    server.ts            # MSW server setup
    setup.ts             # Test configuration
    utils.tsx             # Test utilities
    mocks.ts              # Firebase mocks
```text

## Test Utilities

### Custom Render Function

```typescript
import { render, screen } from '../../../test/utils';

// Automatically includes all providers (Auth, etc.)
```

### Mock Data Factories

```typescript
import { createMockStock, createMockPosition } from '../../../test/utils';

const stock = createMockStock({ name: 'AAPL', percentage: 50 });
const position = createMockPosition({ symbol: 'AAPL', value: 1000 });
```

### API Mocking (MSW)

API calls are automatically mocked via handlers in `src/test/handlers.ts`:

- Stock price API: `/api/stock/:symbol`
- Finnhub search: `https://finnhub.io/api/v1/search`

### Firebase Mocking

Firebase is mocked in `src/test/mocks.ts`. Extend as needed for specific tests.

## Writing Tests

### Component Tests

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '../../../test/utils';
import { ComponentName } from '../ComponentName';

describe('ComponentName', () => {
  it('should render correctly', () => {
    render(<ComponentName prop="value" />);
    expect(screen.getByText('Expected Text')).toBeInTheDocument();
  });
});
```

### Hook Tests

```typescript
import { renderHook, act, waitFor } from '@testing-library/react';
import { useCalculator } from '../useCalculator';

describe('useCalculator', () => {
  it('should initialize correctly', () => {
    const { result } = renderHook(() => useCalculator({ ... }));
    expect(result.current.state.amount).toBe('');
  });
});
```

### Best Practices

1. **Test Behavior, Not Implementation**
   - Focus on what users see/do
   - Avoid testing internal state directly

2. **Use User Events**

   ```typescript
   const user = userEvent.setup();
   await user.click(button);
   await user.type(input, 'text');
   ```

3. **Wait for Async Operations**

   ```typescript
   await waitFor(() => {
     expect(screen.getByText('Loaded')).toBeInTheDocument();
   });
   ```

4. **Wrap State Updates in `act()`**

   ```typescript
   act(() => {
     result.current.actions.setAmount('1000');
   });
   ```

## Test Coverage

### Well Covered (80%+)

- ✅ Calculator UI Components (82.98%)
- ✅ Calculator Hooks (82.97%)
- ✅ Sample Portfolio Data (100%)
- ✅ Firebase Configuration (100%)
- ✅ `LoginButton.tsx` (100%)
- ✅ `RothIRACalculator.tsx` (92.72%)

### Needs Improvement

- ⚠️ `ResultsSection.tsx` (12%) - Coverage calculation issue (tests are passing)

See [COVERAGE_REPORT.md](./COVERAGE_REPORT.md) for detailed breakdown.

## Troubleshooting

### MSW Not Working

- Ensure `msw` is installed: `npm install --save-dev msw`
- Check `src/test/setup.ts` imports server
- Verify handlers in `src/test/handlers.ts`

### Coverage Not Generating

- Ensure `@vitest/coverage-v8` is installed
- Check `vite.config.ts` has coverage config
- Run `npm run test:coverage`

### Firebase Mock Issues

- Check `src/test/mocks.ts`
- Ensure mocks match actual hook signatures
- Update mocks if hook interfaces change

## Resources

- **Vitest Docs**: <https://vitest.dev/>
- **React Testing Library**: <https://testing-library.com/react>
- **MSW Docs**: <https://mswjs.io/>
- **Testing Best Practices**: <https://kentcdodds.com/blog/common-mistakes-with-react-testing-library>

---

Last updated: February 2025
