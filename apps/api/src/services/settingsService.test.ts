import { describe, it, expect, vi, beforeEach } from 'vitest'
import { settingsService, invalidateCache } from './settingsService.js'
import { db } from '@kawakawa/db'

// Mock the database
vi.mock('@kawakawa/db', () => ({
  db: {
    execute: vi.fn(),
    insert: vi.fn(),
  },
  settings: {
    id: 'id',
    key: 'key',
    value: 'value',
    changedByUserId: 'changedByUserId',
    effectiveAt: 'effectiveAt',
    createdAt: 'createdAt',
  },
}))

describe('settingsService', () => {
  let mockExecute: ReturnType<typeof vi.fn>
  let mockInsert: ReturnType<typeof vi.fn>
  let mockValues: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    // Clear the cache before each test
    invalidateCache()

    mockValues = vi.fn().mockResolvedValue(undefined)
    mockInsert = vi.fn().mockReturnValue({ values: mockValues })
    mockExecute = vi.fn()

    vi.mocked(db.execute).mockImplementation(mockExecute as any)
    vi.mocked(db.insert).mockImplementation(mockInsert as any)
  })

  describe('get', () => {
    it('should return null for non-existent key', async () => {
      mockExecute.mockResolvedValueOnce([])

      const result = await settingsService.get('nonexistent')

      expect(result).toBeNull()
    })

    it('should return value for existing key', async () => {
      mockExecute.mockResolvedValueOnce([{ key: 'discord.clientId', value: 'test-client-id' }])

      const result = await settingsService.get('discord.clientId')

      expect(result).toBe('test-client-id')
    })

    it('should use cache on subsequent calls', async () => {
      mockExecute.mockResolvedValueOnce([{ key: 'discord.clientId', value: 'cached-value' }])

      // First call populates cache
      await settingsService.get('discord.clientId')
      // Second call should use cache
      const result = await settingsService.get('discord.clientId')

      expect(result).toBe('cached-value')
      // DB should only be called once
      expect(mockExecute).toHaveBeenCalledTimes(1)
    })
  })

  describe('getAll', () => {
    it('should return empty object when no settings exist', async () => {
      mockExecute.mockResolvedValueOnce([])

      const result = await settingsService.getAll()

      expect(result).toEqual({})
    })

    it('should return all settings', async () => {
      mockExecute.mockResolvedValueOnce([
        { key: 'discord.clientId', value: 'client-123' },
        { key: 'discord.guildId', value: 'guild-456' },
        { key: 'other.setting', value: 'other-value' },
      ])

      const result = await settingsService.getAll()

      expect(result).toEqual({
        'discord.clientId': 'client-123',
        'discord.guildId': 'guild-456',
        'other.setting': 'other-value',
      })
    })

    it('should filter by prefix', async () => {
      mockExecute.mockResolvedValueOnce([
        { key: 'discord.clientId', value: 'client-123' },
        { key: 'discord.guildId', value: 'guild-456' },
        { key: 'other.setting', value: 'other-value' },
      ])

      const result = await settingsService.getAll('discord.')

      expect(result).toEqual({
        'discord.clientId': 'client-123',
        'discord.guildId': 'guild-456',
      })
    })

    it('should use cache on subsequent calls', async () => {
      mockExecute.mockResolvedValueOnce([{ key: 'test.key', value: 'test-value' }])

      await settingsService.getAll()
      await settingsService.getAll()

      expect(mockExecute).toHaveBeenCalledTimes(1)
    })
  })

  describe('set', () => {
    it('should insert a new setting', async () => {
      mockExecute.mockResolvedValueOnce([]) // For any cache population

      await settingsService.set('discord.clientId', 'new-client-id')

      expect(mockInsert).toHaveBeenCalled()
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'discord.clientId',
          value: 'new-client-id',
          changedByUserId: null,
        })
      )
    })

    it('should include userId when provided', async () => {
      mockExecute.mockResolvedValueOnce([])

      await settingsService.set('discord.clientId', 'new-value', 42)

      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'discord.clientId',
          value: 'new-value',
          changedByUserId: 42,
        })
      )
    })

    it('should invalidate cache after setting', async () => {
      // Populate cache first
      mockExecute.mockResolvedValueOnce([{ key: 'discord.clientId', value: 'old-value' }])
      await settingsService.get('discord.clientId')
      expect(mockExecute).toHaveBeenCalledTimes(1)

      // Set new value
      await settingsService.set('discord.clientId', 'new-value')

      // Next get should hit the database again
      mockExecute.mockResolvedValueOnce([{ key: 'discord.clientId', value: 'new-value' }])
      await settingsService.get('discord.clientId')
      expect(mockExecute).toHaveBeenCalledTimes(2)
    })
  })

  describe('setMany', () => {
    it('should insert multiple settings atomically', async () => {
      mockExecute.mockResolvedValueOnce([])

      await settingsService.setMany({
        'discord.clientId': 'client-123',
        'discord.guildId': 'guild-456',
      })

      expect(mockValues).toHaveBeenCalledWith([
        expect.objectContaining({
          key: 'discord.clientId',
          value: 'client-123',
        }),
        expect.objectContaining({
          key: 'discord.guildId',
          value: 'guild-456',
        }),
      ])
    })

    it('should not call insert for empty settings', async () => {
      await settingsService.setMany({})

      expect(mockInsert).not.toHaveBeenCalled()
    })

    it('should include userId for all settings', async () => {
      await settingsService.setMany(
        {
          'discord.clientId': 'client-123',
          'discord.guildId': 'guild-456',
        },
        42
      )

      expect(mockValues).toHaveBeenCalledWith([
        expect.objectContaining({ changedByUserId: 42 }),
        expect.objectContaining({ changedByUserId: 42 }),
      ])
    })

    it('should invalidate cache after setting multiple', async () => {
      // Populate cache
      mockExecute.mockResolvedValueOnce([{ key: 'discord.clientId', value: 'old' }])
      await settingsService.getAll()
      expect(mockExecute).toHaveBeenCalledTimes(1)

      // Set multiple values
      await settingsService.setMany({
        'discord.clientId': 'new-client',
        'discord.guildId': 'new-guild',
      })

      // Next call should hit database
      mockExecute.mockResolvedValueOnce([
        { key: 'discord.clientId', value: 'new-client' },
        { key: 'discord.guildId', value: 'new-guild' },
      ])
      await settingsService.getAll()
      expect(mockExecute).toHaveBeenCalledTimes(2)
    })
  })

  describe('getHistory', () => {
    it('should return empty array when no history exists', async () => {
      mockExecute.mockResolvedValueOnce([])

      const result = await settingsService.getHistory('nonexistent')

      expect(result).toEqual([])
    })

    it('should return history entries', async () => {
      const now = new Date()
      mockExecute.mockResolvedValueOnce([
        {
          id: 2,
          key: 'discord.clientId',
          value: 'new-value',
          changed_by_username: 'admin',
          effective_at: now,
          created_at: now,
        },
        {
          id: 1,
          key: 'discord.clientId',
          value: 'old-value',
          changed_by_username: null,
          effective_at: new Date(now.getTime() - 1000),
          created_at: new Date(now.getTime() - 1000),
        },
      ])

      const result = await settingsService.getHistory('discord.clientId')

      expect(result).toHaveLength(2)
      expect(result[0]).toEqual(
        expect.objectContaining({
          id: 2,
          key: 'discord.clientId',
          value: 'new-value',
          changedByUsername: 'admin',
        })
      )
      expect(result[1]).toEqual(
        expect.objectContaining({
          id: 1,
          changedByUsername: null,
        })
      )
    })
  })

  describe('exists', () => {
    it('should return false for non-existent key', async () => {
      mockExecute.mockResolvedValueOnce([])

      const result = await settingsService.exists('nonexistent')

      expect(result).toBe(false)
    })

    it('should return true for existing key', async () => {
      mockExecute.mockResolvedValueOnce([{ key: 'discord.clientId', value: 'some-value' }])

      const result = await settingsService.exists('discord.clientId')

      expect(result).toBe(true)
    })
  })

  describe('invalidateCache', () => {
    it('should clear the cache', async () => {
      // Populate cache
      mockExecute.mockResolvedValueOnce([{ key: 'test', value: 'value' }])
      await settingsService.getAll()
      expect(mockExecute).toHaveBeenCalledTimes(1)

      // Invalidate
      invalidateCache()

      // Next call should hit database
      mockExecute.mockResolvedValueOnce([{ key: 'test', value: 'new-value' }])
      await settingsService.getAll()
      expect(mockExecute).toHaveBeenCalledTimes(2)
    })
  })
})
