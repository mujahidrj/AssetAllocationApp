import '@testing-library/jest-dom'
import { afterEach, vi, beforeAll, afterAll } from 'vitest'
import { cleanup } from '@testing-library/react'
import './mocks'

// MSW setup - API mocking for tests
import { server } from './server'
import { resetSheetHistory } from '../app/sheetHistory'

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'warn' })
  useJsdomAbortSignalsWithNodeFetch()
})

// Tests run in jsdom, so `new AbortController()` makes jsdom's AbortSignal, but
// `fetch` is Node's own, and from Node 24 it rejects any signal that isn't
// Node's ("Expected signal to be an instance of AbortSignal"). Pass the request
// on without the signal and honour aborts here instead. Installed after
// server.listen() so it wraps MSW's fetch rather than being replaced by it.
function useJsdomAbortSignalsWithNodeFetch() {
  const inner = globalThis.fetch
  globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const signal = init?.signal
    if (!signal) return inner(input, init)
    const rest: RequestInit = { ...init }
    delete rest.signal
    const aborted = () => new DOMException('The operation was aborted.', 'AbortError')
    if (signal.aborted) return Promise.reject(aborted())
    return new Promise<Response>((resolve, reject) => {
      const onAbort = () => reject(aborted())
      signal.addEventListener('abort', onAbort, { once: true })
      inner(input, rest)
        .then(resolve, reject)
        .finally(() => signal.removeEventListener('abort', onAbort))
    })
  }
}

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
  resetSheetHistory()
  window.localStorage.clear()
  window.history.replaceState(null, '', '/')
})
