# Asset Allocation Calculator

A web app that tells you exactly what to buy or sell to keep a portfolio at its target mix.

Live: https://asset-allocation-app-nine.vercel.app/

## What it does

- **Deposit / Withdrawal:** type an amount and it's split across your funds by target percentage, with share counts at the latest price.
- **Rebalance:** enter what you hold and your targets, and it lists the buys and sells that bring each fund back to target.
- **Model portfolios:** start from a Fidelity, Vanguard, Schwab or Sharia-compliant mix.
- **Google sign-in:** saves your funds, holdings and targets to your account.

Prices are the last market price from Yahoo Finance. This is a calculator, not financial advice.

## Stack

- React 18, TypeScript and Vite, styled with CSS Modules
- Vercel serverless functions in `api/` that proxy Yahoo Finance search and quotes (`server/server.js` is the same API for local development)
- Firebase Auth (Google) and Firestore for saved data; security rules are in `firestore.rules`
- Vitest, Testing Library and MSW for tests, run by GitHub Actions on every pull request

## Running it locally

Requires Node 20 or 22.

```bash
npm install
npm run dev        # API server and Vite dev server together
```

Other scripts:

```bash
npm test               # run the tests once
npm run test:coverage  # tests with a coverage report (CI requires 75%)
npm run lint
npm run build          # type-check and build for production
```

## Deploying

- The site deploys to Vercel from `master`; every pull request gets a preview deployment.
- Firestore rules deploy separately with the Firebase CLI: `firebase deploy --only firestore:rules` (project `asset-allocation-bf70b`, set in `.firebaserc`).

## Project layout

```
api/                         Vercel functions: search.ts, stock.ts
server/server.js             local copy of the API
src/components/              main screen and sign-in button
src/components/calculator/   calculator hook, UI pieces, model portfolios
src/lib/                     Firebase setup, auth, shared helpers
src/test/                    test setup and MSW handlers
```
