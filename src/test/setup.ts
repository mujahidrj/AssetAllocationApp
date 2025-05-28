import '@testing-library/jest-dom'
import { afterEach, beforeEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import './mocks'

beforeEach(() => {
  vi.clearAllMocks()
})

// Runs a cleanup after each test case
afterEach(() => {
  cleanup()
})
