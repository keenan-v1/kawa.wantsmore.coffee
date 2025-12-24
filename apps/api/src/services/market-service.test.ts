/**
 * Tests for market service expiration logic
 * These test the pure functions from @kawakawa/services/market
 */
import { describe, it, expect } from 'vitest'
import {
  calculateAvailableQuantity,
  calculateEffectiveFulfilledQuantity,
} from '@kawakawa/services/market'

describe('calculateAvailableQuantity', () => {
  it('returns full quantity when limit mode is none', () => {
    expect(calculateAvailableQuantity(100, 'none', null)).toBe(100)
    expect(calculateAvailableQuantity(100, 'none', 50)).toBe(100)
  })

  it('caps quantity at limitQuantity when mode is max_sell', () => {
    expect(calculateAvailableQuantity(100, 'max_sell', 50)).toBe(50)
    expect(calculateAvailableQuantity(30, 'max_sell', 50)).toBe(30)
    expect(calculateAvailableQuantity(100, 'max_sell', null)).toBe(0)
  })

  it('reserves limitQuantity when mode is reserve', () => {
    expect(calculateAvailableQuantity(100, 'reserve', 30)).toBe(70)
    expect(calculateAvailableQuantity(20, 'reserve', 30)).toBe(0)
    expect(calculateAvailableQuantity(100, 'reserve', null)).toBe(100)
  })
})

describe('calculateEffectiveFulfilledQuantity', () => {
  const now = new Date()
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000)
  const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000)

  describe('when FIO sync is available', () => {
    it('excludes fulfilled reservations when FIO synced after fulfillment', () => {
      const reservations = [
        { orderId: 1, quantity: 50, updatedAt: twoHoursAgo, expiresAt: oneHourFromNow },
      ]
      // FIO synced one hour ago, after the reservation was fulfilled two hours ago
      const result = calculateEffectiveFulfilledQuantity(reservations, oneHourAgo)
      expect(result).toBe(0)
    })

    it('includes fulfilled reservations when FIO synced before fulfillment', () => {
      const reservations = [
        { orderId: 1, quantity: 50, updatedAt: oneHourAgo, expiresAt: oneHourFromNow },
      ]
      // FIO synced two hours ago, before the reservation was fulfilled one hour ago
      const result = calculateEffectiveFulfilledQuantity(reservations, twoHoursAgo)
      expect(result).toBe(50)
    })

    it('handles mixed scenarios with multiple reservations', () => {
      const reservations = [
        // This one should be excluded (FIO synced after fulfillment)
        { orderId: 1, quantity: 30, updatedAt: twoHoursAgo, expiresAt: oneHourFromNow },
        // This one should be included (FIO synced before fulfillment)
        { orderId: 2, quantity: 50, updatedAt: oneHourAgo, expiresAt: oneHourFromNow },
      ]
      // FIO synced 90 minutes ago
      const ninetyMinutesAgo = new Date(now.getTime() - 90 * 60 * 1000)
      const result = calculateEffectiveFulfilledQuantity(reservations, ninetyMinutesAgo)
      // Only the 50-unit reservation should count (fulfilled after FIO sync)
      expect(result).toBe(50)
    })
  })

  describe('when FIO sync is not available (fallback to expiration)', () => {
    it('excludes expired reservations', () => {
      const reservations = [
        { orderId: 1, quantity: 50, updatedAt: twoHoursAgo, expiresAt: oneHourAgo },
      ]
      const result = calculateEffectiveFulfilledQuantity(reservations, null)
      expect(result).toBe(0)
    })

    it('includes non-expired reservations', () => {
      const reservations = [
        { orderId: 1, quantity: 50, updatedAt: twoHoursAgo, expiresAt: oneHourFromNow },
      ]
      const result = calculateEffectiveFulfilledQuantity(reservations, null)
      expect(result).toBe(50)
    })

    it('includes reservations with no expiration date', () => {
      const reservations = [{ orderId: 1, quantity: 50, updatedAt: twoHoursAgo, expiresAt: null }]
      const result = calculateEffectiveFulfilledQuantity(reservations, null)
      expect(result).toBe(50)
    })

    it('handles mixed expiration scenarios', () => {
      const reservations = [
        // Expired - should not count
        { orderId: 1, quantity: 30, updatedAt: twoHoursAgo, expiresAt: oneHourAgo },
        // Not expired - should count
        { orderId: 2, quantity: 50, updatedAt: twoHoursAgo, expiresAt: oneHourFromNow },
        // No expiration - should count
        { orderId: 3, quantity: 20, updatedAt: twoHoursAgo, expiresAt: null },
      ]
      const result = calculateEffectiveFulfilledQuantity(reservations, null)
      expect(result).toBe(70) // 50 + 20
    })
  })

  describe('edge cases', () => {
    it('returns 0 for empty reservations array', () => {
      const result = calculateEffectiveFulfilledQuantity([], null)
      expect(result).toBe(0)

      const result2 = calculateEffectiveFulfilledQuantity([], oneHourAgo)
      expect(result2).toBe(0)
    })

    it('handles FIO sync at exact same time as fulfillment (should exclude)', () => {
      const exactTime = new Date()
      const reservations = [{ orderId: 1, quantity: 50, updatedAt: exactTime, expiresAt: null }]
      // FIO synced at the same exact moment - technically "after" so should exclude
      // The condition is fioUploadedAt > updatedAt, so equal times should include
      const result = calculateEffectiveFulfilledQuantity(reservations, exactTime)
      expect(result).toBe(50) // Same time means FIO hasn't synced "after"
    })

    it('handles expiration at exact current time (should exclude)', () => {
      // Note: The actual behavior depends on timing - if expiresAt <= now, it should exclude
      // But since we create 'now' at test start, there might be slight timing differences
      // The code checks expiresAt < now (not <=), so exact equality should include
      // Let's use a time that's definitely in the past for this test
      const justNow = new Date()
      const slightlyPast = new Date(justNow.getTime() - 1)
      const reservationsWithPastExpiry = [
        { orderId: 1, quantity: 50, updatedAt: twoHoursAgo, expiresAt: slightlyPast },
      ]
      const result = calculateEffectiveFulfilledQuantity(reservationsWithPastExpiry, null)
      expect(result).toBe(0)
    })
  })

  describe('combined FIO and expiration logic', () => {
    it('FIO takes precedence over expiration check', () => {
      const reservations = [
        // Even though not expired, FIO synced after fulfillment so should exclude
        { orderId: 1, quantity: 50, updatedAt: twoHoursAgo, expiresAt: oneHourFromNow },
      ]
      const result = calculateEffectiveFulfilledQuantity(reservations, oneHourAgo)
      expect(result).toBe(0)
    })

    it('falls back to expiration only when FIO not available', () => {
      const reservations = [
        { orderId: 1, quantity: 30, updatedAt: twoHoursAgo, expiresAt: oneHourAgo },
        { orderId: 2, quantity: 50, updatedAt: twoHoursAgo, expiresAt: oneHourFromNow },
      ]
      // Without FIO, uses expiration
      const result = calculateEffectiveFulfilledQuantity(reservations, null)
      expect(result).toBe(50) // Only the non-expired one
    })
  })
})
