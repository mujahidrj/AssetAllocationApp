# Test Maintenance Guide

This document outlines best practices for keeping tests up to date and preventing regressions.

## Automated Testing

### CI/CD Pipeline

Tests run automatically via GitHub Actions on:
- **Every push** to `main` or `develop` branches
- **Every pull request** to `main` or `develop` branches  
- **Daily at 2 AM UTC** (scheduled run to catch regressions)

**Location**: `.github/workflows/test.yml`

### Pre-Commit Hooks (Optional)

To catch issues before pushing:

```bash
# Option 1: Use husky (recommended)
npm install --save-dev husky
npx husky init
echo "npm test" > .husky/pre-commit
chmod +x .husky/pre-commit

# Option 2: Manual check before committing
npm test && git commit -m "your message"
```

## When to Update Tests

### ✅ Always Update Tests When:

1. **Adding New Features**
   - Write tests for new components/hooks
   - Test happy paths and error cases
   - Aim for 80%+ coverage on new code

2. **Fixing Bugs**
   - Add a regression test that reproduces the bug
   - Ensures the bug doesn't come back
   - Example: `it('should handle X edge case that caused bug Y')`

3. **Refactoring Code**
   - Update tests if behavior changes
   - Keep tests passing during refactor
   - Update test descriptions if needed

4. **Changing Component Behavior**
   - Update tests to match new behavior
   - Remove tests for deprecated features
   - Add tests for new functionality

### ⚠️ When NOT to Update Tests:

- **Only styling changes** (CSS, layout)
- **Documentation updates**
- **Configuration changes** (unless they affect behavior)

## Coverage Requirements

### Thresholds

- **Minimum**: 80% overall coverage
- **Target**: 85%+ overall coverage
- **New Code**: Should maintain or improve overall coverage

### Checking Coverage

```bash
# Generate coverage report
npm run test:coverage

# View HTML report
open coverage/index.html

# Check specific thresholds
npm run test:coverage | grep "All files"
```

## Regular Maintenance Tasks

### Weekly

- [ ] Review any failing tests
- [ ] Check for new warnings in test output
- [ ] Review PR test results

### Monthly

- [ ] Review coverage trends
- [ ] Update test dependencies if needed
- [ ] Review and update test mocks/data
- [ ] Check for deprecated testing patterns

### Quarterly

- [ ] Review test suite performance
- [ ] Identify slow tests and optimize
- [ ] Update testing documentation
- [ ] Review CI/CD pipeline efficiency

## Handling Test Failures

### 1. Identify the Cause

```bash
# Run specific test file
npm test -- TestName

# Run with verbose output
npm test -- --reporter=verbose

# Run in watch mode for debugging
npm run test:watch
```

### 2. Determine Fix Strategy

**If test is wrong (false positive):**
- Update test to match correct behavior
- Document why test was changed

**If code has a regression:**
- Fix the code, not the test
- Add additional tests if needed

**If behavior intentionally changed:**
- Update test to match new behavior
- Document the change in commit message

### 3. Update Snapshot Tests (if applicable)

```bash
# Update snapshots
npm run test:update
```

## Best Practices

### 1. Write Maintainable Tests

- ✅ Use descriptive test names
- ✅ Test one thing per test
- ✅ Use setup/teardown appropriately
- ✅ Keep tests independent

### 2. Keep Tests Fast

- ✅ Mock external dependencies
- ✅ Use MSW for API mocking
- ✅ Avoid unnecessary waits/timeouts
- ✅ Run tests in parallel when possible

### 3. Keep Tests Reliable

- ✅ Avoid flaky tests (timing, random data)
- ✅ Use `waitFor` for async operations
- ✅ Clean up after tests
- ✅ Use proper `act()` wrapping

### 4. Keep Tests Up to Date

- ✅ Update tests when dependencies change
- ✅ Keep mocks in sync with real APIs
- ✅ Update test data as needed
- ✅ Remove obsolete tests

## Monitoring & Alerts

### Coverage Monitoring

Track coverage trends over time:
- Review coverage reports in CI artifacts
- Set up coverage badges (optional)
- Monitor coverage drops in PRs

### Test Performance

Monitor test suite performance:
- Track test execution time
- Identify slow tests
- Optimize as needed

## Troubleshooting

### Common Issues

**Tests pass locally but fail in CI:**
- Check Node.js version matches
- Verify environment variables
- Check for timing issues

**Coverage drops unexpectedly:**
- Review what changed
- Check if new code is untested
- Verify coverage exclusions

**Flaky tests:**
- Add proper waits/timeouts
- Use `waitFor` for async operations
- Check for race conditions

## Resources

- [Testing Guide](./TESTING.md) - How to write and run tests
- [Coverage Report](./COVERAGE_REPORT.md) - Detailed coverage breakdown
- [Vitest Documentation](https://vitest.dev/) - Testing framework docs
- [React Testing Library](https://testing-library.com/react) - Component testing guide

---

**Last Updated**: February 2025
