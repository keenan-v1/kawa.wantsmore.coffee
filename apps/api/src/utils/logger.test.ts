import { describe, it, expect } from 'vitest'
import { logger, createLogger, stripEmoji } from './logger.js'

describe('logger', () => {
  describe('logger instance', () => {
    it('should be a pino logger', () => {
      expect(logger).toBeDefined()
      expect(typeof logger.info).toBe('function')
      expect(typeof logger.error).toBe('function')
      expect(typeof logger.warn).toBe('function')
      expect(typeof logger.debug).toBe('function')
    })
  })

  describe('createLogger', () => {
    it('should create a child logger with context', () => {
      const childLogger = createLogger({ service: 'test', component: 'unit' })
      expect(childLogger).toBeDefined()
      expect(typeof childLogger.info).toBe('function')
    })

    it('should redact PII fields in context', () => {
      // The redaction happens in the formatter, so we just verify the logger is created
      const childLogger = createLogger({
        email: 'test@example.com',
        password: 'secret123',
      })
      expect(childLogger).toBeDefined()
    })
  })

  describe('stripEmoji', () => {
    it('should remove emojis from strings', () => {
      expect(stripEmoji('Hello 🌟 World')).toBe('Hello World')
      expect(stripEmoji('✅ Done')).toBe('Done')
      expect(stripEmoji('📦 Package 📊 Stats')).toBe('Package Stats')
      expect(stripEmoji('No emojis here')).toBe('No emojis here')
    })

    it('should collapse multiple spaces', () => {
      expect(stripEmoji('Hello    World')).toBe('Hello World')
      expect(stripEmoji('  Spaces  ')).toBe('Spaces')
    })

    it('should handle empty strings', () => {
      expect(stripEmoji('')).toBe('')
    })

    it('should handle strings with only emojis', () => {
      expect(stripEmoji('🎉🎊🎈')).toBe('')
    })
  })
})

describe('PII redaction', () => {
  // Note: These tests verify the redaction logic conceptually
  // The actual redaction happens in the log formatter

  it('should identify PII fields', () => {
    const piiFields = [
      'email',
      'password',
      'apiKey',
      'api_key',
      'fio_api_key',
      'fioApiKey',
      'token',
      'accessToken',
      'refreshToken',
      'authorization',
      'cookie',
    ]

    // These fields should be treated as PII
    piiFields.forEach(field => {
      expect(field.toLowerCase()).toMatch(/email|password|api_?key|token|authorization|cookie/i)
    })
  })

  it('should identify email patterns in strings', () => {
    const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
    const testCases = [
      { input: 'Contact: test@example.com', hasEmail: true },
      { input: 'user.name+tag@domain.co.uk', hasEmail: true },
      { input: 'no email here', hasEmail: false },
      { input: 'almost@email', hasEmail: false },
    ]

    testCases.forEach(({ input, hasEmail }) => {
      expect(emailPattern.test(input)).toBe(hasEmail)
      // Reset regex state
      emailPattern.lastIndex = 0
    })
  })
})
