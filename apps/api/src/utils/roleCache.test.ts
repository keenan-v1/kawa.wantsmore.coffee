import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  getCachedRoles,
  setCachedRoles,
  invalidateCachedRoles,
  clearRoleCache,
} from './roleCache.js'

describe('roleCache', () => {
  beforeEach(() => {
    clearRoleCache()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('getCachedRoles', () => {
    it('should return undefined for uncached user', () => {
      expect(getCachedRoles(1)).toBeUndefined()
    })

    it('should return cached roles', () => {
      setCachedRoles(1, ['member', 'lead'])
      expect(getCachedRoles(1)).toEqual(['member', 'lead'])
    })

    it('should return undefined after TTL expires', () => {
      setCachedRoles(1, ['member'])

      // Advance time by 5 minutes + 1 second
      vi.advanceTimersByTime(5 * 60 * 1000 + 1000)

      expect(getCachedRoles(1)).toBeUndefined()
    })

    it('should return roles before TTL expires', () => {
      setCachedRoles(1, ['member'])

      // Advance time by 4 minutes 59 seconds
      vi.advanceTimersByTime(4 * 60 * 1000 + 59 * 1000)

      expect(getCachedRoles(1)).toEqual(['member'])
    })
  })

  describe('setCachedRoles', () => {
    it('should cache roles for a user', () => {
      setCachedRoles(1, ['applicant'])
      expect(getCachedRoles(1)).toEqual(['applicant'])
    })

    it('should overwrite existing cached roles', () => {
      setCachedRoles(1, ['applicant'])
      setCachedRoles(1, ['member', 'lead'])
      expect(getCachedRoles(1)).toEqual(['member', 'lead'])
    })

    it('should cache roles for multiple users independently', () => {
      setCachedRoles(1, ['member'])
      setCachedRoles(2, ['administrator'])

      expect(getCachedRoles(1)).toEqual(['member'])
      expect(getCachedRoles(2)).toEqual(['administrator'])
    })
  })

  describe('invalidateCachedRoles', () => {
    it('should remove cached roles for a user', () => {
      setCachedRoles(1, ['member'])
      invalidateCachedRoles(1)
      expect(getCachedRoles(1)).toBeUndefined()
    })

    it('should not affect other users', () => {
      setCachedRoles(1, ['member'])
      setCachedRoles(2, ['administrator'])

      invalidateCachedRoles(1)

      expect(getCachedRoles(1)).toBeUndefined()
      expect(getCachedRoles(2)).toEqual(['administrator'])
    })

    it('should be safe to call for non-existent user', () => {
      expect(() => invalidateCachedRoles(999)).not.toThrow()
    })
  })

  describe('clearRoleCache', () => {
    it('should clear all cached roles', () => {
      setCachedRoles(1, ['member'])
      setCachedRoles(2, ['administrator'])

      clearRoleCache()

      expect(getCachedRoles(1)).toBeUndefined()
      expect(getCachedRoles(2)).toBeUndefined()
    })
  })
})
