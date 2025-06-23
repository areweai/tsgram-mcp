/**
 * Vitest setup file for dashboard tests
 */

import { expect, afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import * as matchers from '@testing-library/jest-dom/matchers'

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers)

// Clean up after each test
afterEach(() => {
  cleanup()
})

// Mock window.location for routing tests
Object.defineProperty(window, 'location', {
  value: {
    href: 'http://localhost:3001',
    origin: 'http://localhost:3001',
    pathname: '/',
    search: '',
    hash: ''
  },
  writable: true
})

// Mock window.open for external links
window.open = vi.fn()

// Global console warning suppression for test noise
const originalWarn = console.warn
console.warn = (...args) => {
  // Suppress specific React warnings during tests
  if (typeof args[0] === 'string' && args[0].includes('React Router')) {
    return
  }
  originalWarn(...args)
}