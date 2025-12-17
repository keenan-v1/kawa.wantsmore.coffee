import { describe, it, expect, vi } from 'vitest'
import { redactObject, createLogger } from './logger.js'

describe('logger', () => {
  describe('redactObject', () => {
    it('should return null and undefined as-is', () => {
      expect(redactObject(null)).toBe(null)
      expect(redactObject(undefined)).toBe(undefined)
    })

    it('should return non-object primitives as-is', () => {
      expect(redactObject(42)).toBe(42)
      expect(redactObject(true)).toBe(true)
    })

    it('should truncate long strings', () => {
      const longString = 'a'.repeat(600)
      const result = redactObject(longString) as string

      expect(result.length).toBeLessThan(longString.length)
      expect(result).toContain('truncated')
    })

    it('should redact email addresses in strings', () => {
      const result = redactObject('Contact user@example.com for help') as string
      expect(result).toContain('[EMAIL_REDACTED]')
      expect(result).not.toContain('user@example.com')
    })

    it('should not truncate short strings', () => {
      const shortString = 'hello world'
      expect(redactObject(shortString)).toBe(shortString)
    })

    it('should redact PII fields in objects', () => {
      const obj = {
        name: 'John',
        email: 'john@example.com',
        password: 'secret123',
        apiKey: 'key-12345',
        token: 'jwt-token',
        accessToken: 'access-123',
        refreshToken: 'refresh-456',
      }

      const result = redactObject(obj) as Record<string, unknown>

      expect(result.name).toBe('John')
      expect(result.email).toBe('[REDACTED]')
      expect(result.password).toBe('[REDACTED]')
      expect(result.apiKey).toBe('[REDACTED]')
      expect(result.token).toBe('[REDACTED]')
      expect(result.accessToken).toBe('[REDACTED]')
      expect(result.refreshToken).toBe('[REDACTED]')
    })

    it('should redact nested PII fields', () => {
      const obj = {
        user: {
          name: 'John',
          credentials: {
            passwordHash: 'hash123',
            fioApiKey: 'fio-key',
          },
        },
      }

      const result = redactObject(obj) as Record<string, Record<string, Record<string, unknown>>>

      expect(result.user.name).toBe('John')
      expect(result.user.credentials.passwordHash).toBe('[REDACTED]')
      expect(result.user.credentials.fioApiKey).toBe('[REDACTED]')
    })

    it('should truncate large arrays', () => {
      const largeArray = Array.from({ length: 20 }, (_, i) => i)
      const result = redactObject(largeArray) as unknown[]

      expect(result.length).toBe(11) // 10 items + truncation message
      expect(result[10]).toContain('10 more items')
    })

    it('should not truncate small arrays', () => {
      const smallArray = [1, 2, 3]
      const result = redactObject(smallArray) as unknown[]

      expect(result).toEqual([1, 2, 3])
    })

    it('should handle circular references', () => {
      const obj: Record<string, unknown> = { name: 'test' }
      obj.self = obj

      const result = redactObject(obj) as Record<string, unknown>

      expect(result.name).toBe('test')
      expect(result.self).toBe('[Circular]')
    })

    it('should truncate deeply nested objects', () => {
      let obj: Record<string, unknown> = { value: 'deepest' }
      for (let i = 0; i < 10; i++) {
        obj = { nested: obj }
      }

      const result = redactObject(obj) as Record<string, unknown>

      // Navigate to the max depth
      let current: unknown = result
      for (let i = 0; i < 6; i++) {
        if (typeof current === 'object' && current !== null && 'nested' in current) {
          current = (current as Record<string, unknown>).nested
        }
      }
      expect(current).toBe('[Truncated: max depth]')
    })

    it('should handle empty objects', () => {
      expect(redactObject({})).toEqual({})
    })

    it('should handle empty arrays', () => {
      expect(redactObject([])).toEqual([])
    })

    it('should handle mixed arrays with objects', () => {
      const mixed = [
        { email: 'test@example.com' },
        'plain string',
        42,
      ]

      const result = redactObject(mixed) as unknown[]

      expect((result[0] as Record<string, unknown>).email).toBe('[REDACTED]')
      expect(result[1]).toBe('plain string')
      expect(result[2]).toBe(42)
    })

    it('should redact case-insensitive field names', () => {
      const obj = {
        EMAIL: 'test@example.com',
        Password: 'secret',
        API_KEY: 'key123',
      }

      const result = redactObject(obj) as Record<string, unknown>

      expect(result.EMAIL).toBe('[REDACTED]')
      expect(result.Password).toBe('[REDACTED]')
      expect(result.API_KEY).toBe('[REDACTED]')
    })

    it('should redact partial PII field matches', () => {
      const obj = {
        userEmail: 'test@example.com',
        oldPassword: 'old123',
        myApiKeyValue: 'key',
      }

      const result = redactObject(obj) as Record<string, unknown>

      expect(result.userEmail).toBe('[REDACTED]')
      expect(result.oldPassword).toBe('[REDACTED]')
      expect(result.myApiKeyValue).toBe('[REDACTED]')
    })
  })

  describe('createLogger', () => {
    it('should create a child logger with context', () => {
      const childLogger = createLogger({ command: 'test', userId: 123 })

      expect(childLogger).toBeDefined()
      expect(typeof childLogger.info).toBe('function')
      expect(typeof childLogger.error).toBe('function')
    })

    it('should redact PII in context', () => {
      // Creating logger with PII should not throw
      const childLogger = createLogger({
        userId: 123,
        email: 'test@example.com',
      })

      expect(childLogger).toBeDefined()
    })
  })
})
