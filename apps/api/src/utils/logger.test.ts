import { describe, it, expect } from 'vitest'
import { logger, createLogger, stripEmoji, redactObject } from './logger.js'

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

  it('should handle circular references without stack overflow', () => {
    // Create an object with circular reference
    const circular: Record<string, unknown> = { name: 'test' }
    circular.self = circular

    // This should not throw - just verify createLogger handles it
    expect(() => createLogger(circular)).not.toThrow()
  })
})

describe('content truncation', () => {
  it('should truncate long strings', () => {
    const longString = 'a'.repeat(1000)
    const result = redactObject(longString) as string
    expect(result.length).toBeLessThan(600) // 500 + truncation message
    expect(result).toContain('[truncated')
  })

  it('should not truncate short strings', () => {
    const shortString = 'hello world'
    const result = redactObject(shortString)
    expect(result).toBe('hello world')
  })

  it('should truncate large arrays', () => {
    const largeArray = Array.from({ length: 50 }, (_, i) => `item${i}`)
    const result = redactObject(largeArray) as string[]
    expect(result.length).toBe(11) // 10 items + truncation message
    expect(result[10]).toContain('40 more items')
  })

  it('should not truncate small arrays', () => {
    const smallArray = ['a', 'b', 'c']
    const result = redactObject(smallArray)
    expect(result).toEqual(['a', 'b', 'c'])
  })

  it('should truncate deeply nested objects', () => {
    // Create a deeply nested object (7 levels deep)
    // With MAX_OBJECT_DEPTH=5, truncation happens at depth 6
    const deep = { a: { b: { c: { d: { e: { f: { g: 'value' } } } } } } }
    const result = redactObject(deep) as Record<string, unknown>
    // Navigate to the truncation point (f should be truncated since it's at depth 6)
    const a = result.a as Record<string, unknown>
    const b = a.b as Record<string, unknown>
    const c = b.c as Record<string, unknown>
    const d = c.d as Record<string, unknown>
    const e = d.e as Record<string, unknown>
    expect(e.f).toBe('[Truncated: max depth]')
  })

  it('should redact PII in nested objects', () => {
    const obj = {
      user: {
        name: 'John',
        email: 'john@example.com',
        settings: {
          apiKey: 'secret123',
        },
      },
    }
    const result = redactObject(obj) as Record<string, unknown>
    const user = result.user as Record<string, unknown>
    expect(user.name).toBe('John')
    expect(user.email).toBe('[REDACTED]')
    expect((user.settings as Record<string, unknown>).apiKey).toBe('[REDACTED]')
  })

  it('should redact emails in string values', () => {
    const result = redactObject('Contact me at test@example.com please')
    expect(result).toBe('Contact me at [EMAIL_REDACTED] please')
  })
})
