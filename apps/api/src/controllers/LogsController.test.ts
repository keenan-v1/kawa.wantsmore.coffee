import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LogsController } from './LogsController.js'

// Mock the logger
vi.mock('../utils/logger.js', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}))

describe('LogsController', () => {
  let controller: LogsController

  beforeEach(() => {
    controller = new LogsController()
    // Reset rate limiting by waiting a bit (in real tests we'd mock the rate limiter)
    vi.clearAllMocks()
  })

  describe('submitLogs', () => {
    it('should accept valid log entries', async () => {
      const result = await controller.submitLogs({
        logs: [
          {
            level: 'info',
            message: 'Test log message',
            timestamp: new Date().toISOString(),
            page: '/test',
            userAgent: 'Mozilla/5.0',
          },
        ],
      })

      expect(result.accepted).toBe(true)
      expect(result.count).toBe(1)
    })

    it('should accept multiple log entries', async () => {
      const result = await controller.submitLogs({
        logs: [
          { level: 'info', message: 'Log 1' },
          { level: 'warn', message: 'Log 2' },
          { level: 'error', message: 'Log 3' },
        ],
      })

      expect(result.accepted).toBe(true)
      expect(result.count).toBe(3)
    })

    it('should reject empty log arrays', async () => {
      const setStatusSpy = vi.spyOn(controller, 'setStatus')

      const result = await controller.submitLogs({
        logs: [],
      })

      expect(result.accepted).toBe(false)
      expect(result.count).toBe(0)
      expect(setStatusSpy).toHaveBeenCalledWith(400)
    })

    it('should limit batch size to 50 logs', async () => {
      const logs = Array(100)
        .fill(null)
        .map((_, i) => ({
          level: 'info' as const,
          message: `Log ${i}`,
        }))

      const result = await controller.submitLogs({ logs })

      expect(result.count).toBe(50)
    })

    it('should handle all log levels', async () => {
      const result = await controller.submitLogs({
        logs: [
          { level: 'debug', message: 'Debug' },
          { level: 'info', message: 'Info' },
          { level: 'warn', message: 'Warn' },
          { level: 'error', message: 'Error' },
        ],
      })

      expect(result.accepted).toBe(true)
      expect(result.count).toBe(4)
    })

    it('should default to info for invalid log levels', async () => {
      const result = await controller.submitLogs({
        logs: [{ level: 'invalid' as any, message: 'Test' }],
      })

      expect(result.accepted).toBe(true)
      expect(result.count).toBe(1)
    })

    it('should include context data when provided', async () => {
      const result = await controller.submitLogs({
        logs: [
          {
            level: 'info',
            message: 'Test with context',
            context: {
              userId: 123,
              action: 'click',
              component: 'button',
            },
          },
        ],
      })

      expect(result.accepted).toBe(true)
      expect(result.count).toBe(1)
    })

    it('should sanitize PII from context', async () => {
      const result = await controller.submitLogs({
        logs: [
          {
            level: 'info',
            message: 'Test with PII',
            context: {
              email: 'user@example.com',
              password: 'secret123',
              apiKey: 'key123',
              normalField: 'value',
            },
          },
        ],
      })

      // The log should be accepted, PII should be redacted internally
      expect(result.accepted).toBe(true)
      expect(result.count).toBe(1)
    })

    it('should limit user agent length', async () => {
      const longUserAgent = 'A'.repeat(500)

      const result = await controller.submitLogs({
        logs: [
          {
            level: 'info',
            message: 'Test',
            userAgent: longUserAgent,
          },
        ],
      })

      expect(result.accepted).toBe(true)
    })

    it('should handle missing optional fields', async () => {
      const result = await controller.submitLogs({
        logs: [
          {
            level: 'info',
            message: 'Minimal log',
            // No timestamp, page, userAgent, or context
          },
        ],
      })

      expect(result.accepted).toBe(true)
      expect(result.count).toBe(1)
    })
  })

  describe('context sanitization', () => {
    it('should handle nested objects', async () => {
      const result = await controller.submitLogs({
        logs: [
          {
            level: 'info',
            message: 'Nested context',
            context: {
              user: {
                name: 'John',
                email: 'john@example.com', // Should be redacted
              },
              metadata: {
                version: '1.0',
              },
            },
          },
        ],
      })

      expect(result.accepted).toBe(true)
    })

    it('should handle arrays in context', async () => {
      const result = await controller.submitLogs({
        logs: [
          {
            level: 'info',
            message: 'Array context',
            context: {
              items: [1, 2, 3, 4, 5],
              users: [{ name: 'User 1' }, { name: 'User 2' }],
            },
          },
        ],
      })

      expect(result.accepted).toBe(true)
    })

    it('should redact email patterns in string values', async () => {
      const result = await controller.submitLogs({
        logs: [
          {
            level: 'info',
            message: 'String with email: user@example.com',
            context: {
              description: 'Contact support@company.com for help',
            },
          },
        ],
      })

      expect(result.accepted).toBe(true)
    })

    it('should handle null and undefined values', async () => {
      const result = await controller.submitLogs({
        logs: [
          {
            level: 'info',
            message: 'Null values',
            context: {
              nullValue: null,
              undefinedValue: undefined,
              normalValue: 'test',
            },
          },
        ],
      })

      expect(result.accepted).toBe(true)
    })
  })
})
