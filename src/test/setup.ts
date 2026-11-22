import '@testing-library/jest-dom'
import { afterEach, vi, beforeAll, afterAll } from 'vitest'
import { cleanup } from '@testing-library/react'
import './mocks'

// MSW setup - API mocking for tests
import { server } from './server'

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'warn' })
})

afterEach(() => {
  server.resetHandlers()
})

afterAll(() => {
  server.close()
})

// Reset mocks after each test
afterEach(() => {
  vi.clearAllMocks()
  cleanup()
  // The app saves to the browser and reads share links from the URL; start each test clean
  window.localStorage.clear()
  window.history.replaceState(null, '', '/')
})
