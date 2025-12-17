import { describe, it, expect } from 'vitest'
import {
  getDisplayName,
  getOwnerDisplayName,
  getCounterpartyDisplayName,
  type UserDisplayInfo,
  type ReservationUserInfo,
} from './userDisplay.js'

describe('userDisplay', () => {
  describe('getDisplayName', () => {
    it('should prefer FIO username when available', () => {
      const user: UserDisplayInfo = {
        username: 'john',
        displayName: 'John Doe',
        fioUsername: 'JohnFIO',
      }
      expect(getDisplayName(user)).toBe('JohnFIO')
    })

    it('should use display name when FIO username is null', () => {
      const user: UserDisplayInfo = {
        username: 'john',
        displayName: 'John Doe',
        fioUsername: null,
      }
      expect(getDisplayName(user)).toBe('John Doe')
    })

    it('should use username as fallback', () => {
      const user: UserDisplayInfo = {
        username: 'john',
        displayName: null,
        fioUsername: null,
      }
      expect(getDisplayName(user)).toBe('john')
    })

    it('should handle undefined FIO username', () => {
      const user: UserDisplayInfo = {
        username: 'john',
        displayName: 'John Doe',
      }
      expect(getDisplayName(user)).toBe('John Doe')
    })
  })

  describe('getOwnerDisplayName', () => {
    const baseReservation: ReservationUserInfo = {
      ownerUsername: 'owner',
      ownerDisplayName: null,
      ownerFioUsername: null,
      counterpartyUsername: 'counterparty',
      counterpartyDisplayName: null,
      counterpartyFioUsername: null,
    }

    it('should prefer FIO username for owner', () => {
      const reservation = { ...baseReservation, ownerFioUsername: 'OwnerFIO' }
      expect(getOwnerDisplayName(reservation)).toBe('OwnerFIO')
    })

    it('should use display name when FIO is null', () => {
      const reservation = { ...baseReservation, ownerDisplayName: 'Owner Name' }
      expect(getOwnerDisplayName(reservation)).toBe('Owner Name')
    })

    it('should fallback to username', () => {
      expect(getOwnerDisplayName(baseReservation)).toBe('owner')
    })
  })

  describe('getCounterpartyDisplayName', () => {
    const baseReservation: ReservationUserInfo = {
      ownerUsername: 'owner',
      ownerDisplayName: null,
      ownerFioUsername: null,
      counterpartyUsername: 'counterparty',
      counterpartyDisplayName: null,
      counterpartyFioUsername: null,
    }

    it('should prefer FIO username for counterparty', () => {
      const reservation = { ...baseReservation, counterpartyFioUsername: 'CounterpartyFIO' }
      expect(getCounterpartyDisplayName(reservation)).toBe('CounterpartyFIO')
    })

    it('should use display name when FIO is null', () => {
      const reservation = { ...baseReservation, counterpartyDisplayName: 'Counterparty Name' }
      expect(getCounterpartyDisplayName(reservation)).toBe('Counterparty Name')
    })

    it('should fallback to username', () => {
      expect(getCounterpartyDisplayName(baseReservation)).toBe('counterparty')
    })
  })
})
