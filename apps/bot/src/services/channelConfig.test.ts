import { describe, it, expect, beforeEach, vi } from 'vitest'

// Create hoisted mock functions
const { mockDbSelect } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
}))

// Mock the database module
vi.mock('@kawakawa/db', () => ({
  db: {
    select: mockDbSelect,
  },
  channelConfig: {
    channelId: 'channelId',
    key: 'key',
    value: 'value',
  },
}))

// Mock drizzle-orm
vi.mock('drizzle-orm', () => ({
  inArray: vi.fn().mockImplementation((field, values) => ({ inArray: { field, values } })),
}))

// Import after mocks are set up
import {
  getChannelConfig,
  getChannelConfigValue,
  resolveEffectiveValue,
  wasOverriddenByChannel,
  resolveMessageVisibility,
  DEFAULT_CHANNEL_ID,
} from './channelConfig.js'

describe('channelConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('DEFAULT_CHANNEL_ID', () => {
    it('is "0"', () => {
      expect(DEFAULT_CHANNEL_ID).toBe('0')
    })
  })

  describe('getChannelConfig', () => {
    it('returns null when no config exists', async () => {
      mockDbSelect.mockReturnValue({
        from: () => ({
          where: vi.fn().mockResolvedValue([]),
        }),
      })

      const result = await getChannelConfig('123456789')
      expect(result).toBeNull()
    })

    it('returns channel-specific config when it exists', async () => {
      mockDbSelect.mockReturnValue({
        from: () => ({
          where: vi.fn().mockResolvedValue([
            { channelId: '123456789', key: 'commandPrefix', value: '!' },
            { channelId: '123456789', key: 'visibility', value: 'internal' },
          ]),
        }),
      })

      const result = await getChannelConfig('123456789')
      expect(result).not.toBeNull()
      expect(result?.commandPrefix).toBe('!')
      expect(result?.visibility).toBe('internal')
    })

    it('returns default config (channelId "0") when no channel-specific config exists', async () => {
      mockDbSelect.mockReturnValue({
        from: () => ({
          where: vi.fn().mockResolvedValue([
            { channelId: '0', key: 'commandPrefix', value: '?' },
            { channelId: '0', key: 'visibility', value: 'partner' },
          ]),
        }),
      })

      const result = await getChannelConfig('123456789')
      expect(result).not.toBeNull()
      expect(result?.commandPrefix).toBe('?')
      expect(result?.visibility).toBe('partner')
    })

    it('merges default and channel-specific config (channel overrides defaults)', async () => {
      mockDbSelect.mockReturnValue({
        from: () => ({
          where: vi.fn().mockResolvedValue([
            // Default config
            { channelId: '0', key: 'commandPrefix', value: '?' },
            { channelId: '0', key: 'visibility', value: 'partner' },
            { channelId: '0', key: 'currency', value: 'CIS' },
            // Channel-specific config (overrides commandPrefix)
            { channelId: '123456789', key: 'commandPrefix', value: '!' },
          ]),
        }),
      })

      const result = await getChannelConfig('123456789')
      expect(result).not.toBeNull()
      // Channel-specific overrides default
      expect(result?.commandPrefix).toBe('!')
      // Defaults are preserved when no channel-specific value
      expect(result?.visibility).toBe('partner')
      expect(result?.currency).toBe('CIS')
    })

    it('parses boolean enforced fields correctly', async () => {
      mockDbSelect.mockReturnValue({
        from: () => ({
          where: vi.fn().mockResolvedValue([
            { channelId: '123456789', key: 'visibilityEnforced', value: 'true' },
            { channelId: '123456789', key: 'currencyEnforced', value: 'false' },
          ]),
        }),
      })

      const result = await getChannelConfig('123456789')
      expect(result?.visibilityEnforced).toBe(true)
      expect(result?.currencyEnforced).toBe(false)
    })

    it('handles all config keys', async () => {
      mockDbSelect.mockReturnValue({
        from: () => ({
          where: vi.fn().mockResolvedValue([
            { channelId: '123456789', key: 'visibility', value: 'internal' },
            { channelId: '123456789', key: 'priceList', value: 'KAWA' },
            { channelId: '123456789', key: 'currency', value: 'ICA' },
            { channelId: '123456789', key: 'messageVisibility', value: 'public' },
            { channelId: '123456789', key: 'visibilityEnforced', value: 'true' },
            { channelId: '123456789', key: 'priceListEnforced', value: 'true' },
            { channelId: '123456789', key: 'currencyEnforced', value: 'false' },
            { channelId: '123456789', key: 'messageVisibilityEnforced', value: 'false' },
            { channelId: '123456789', key: 'announceInternal', value: '111111111' },
            { channelId: '123456789', key: 'announcePartner', value: '222222222' },
            { channelId: '123456789', key: 'commandPrefix', value: '.' },
          ]),
        }),
      })

      const result = await getChannelConfig('123456789')
      expect(result).toEqual({
        visibility: 'internal',
        priceList: 'KAWA',
        currency: 'ICA',
        messageVisibility: 'public',
        visibilityEnforced: true,
        priceListEnforced: true,
        currencyEnforced: false,
        messageVisibilityEnforced: false,
        announceInternal: '111111111',
        announcePartner: '222222222',
        commandPrefix: '.',
      })
    })
  })

  describe('getChannelConfigValue', () => {
    it('returns null when no config exists', async () => {
      mockDbSelect.mockReturnValue({
        from: () => ({
          where: vi.fn().mockResolvedValue([]),
        }),
      })

      const result = await getChannelConfigValue('123456789', 'commandPrefix')
      expect(result).toBeNull()
    })

    it('returns channel-specific value when it exists', async () => {
      mockDbSelect.mockReturnValue({
        from: () => ({
          where: vi
            .fn()
            .mockResolvedValue([{ channelId: '123456789', key: 'commandPrefix', value: '!' }]),
        }),
      })

      const result = await getChannelConfigValue('123456789', 'commandPrefix')
      expect(result).toBe('!')
    })

    it('falls back to default when no channel-specific value', async () => {
      mockDbSelect.mockReturnValue({
        from: () => ({
          where: vi.fn().mockResolvedValue([{ channelId: '0', key: 'commandPrefix', value: '?' }]),
        }),
      })

      const result = await getChannelConfigValue('123456789', 'commandPrefix')
      expect(result).toBe('?')
    })

    it('prefers channel-specific over default', async () => {
      mockDbSelect.mockReturnValue({
        from: () => ({
          where: vi.fn().mockResolvedValue([
            { channelId: '0', key: 'commandPrefix', value: '?' },
            { channelId: '123456789', key: 'commandPrefix', value: '!' },
          ]),
        }),
      })

      const result = await getChannelConfigValue('123456789', 'commandPrefix')
      expect(result).toBe('!')
    })
  })

  describe('resolveEffectiveValue', () => {
    it('returns system default when nothing else is set', () => {
      const result = resolveEffectiveValue(null, null, false, null, 'default')
      expect(result).toBe('default')
    })

    it('returns user default over system default', () => {
      const result = resolveEffectiveValue(null, null, false, 'user', 'default')
      expect(result).toBe('user')
    })

    it('returns channel default over user default', () => {
      const result = resolveEffectiveValue(null, 'channel', false, 'user', 'default')
      expect(result).toBe('channel')
    })

    it('returns command option over channel default', () => {
      const result = resolveEffectiveValue('command', 'channel', false, 'user', 'default')
      expect(result).toBe('command')
    })

    it('enforced channel default overrides command option', () => {
      const result = resolveEffectiveValue('command', 'channel', true, 'user', 'default')
      expect(result).toBe('channel')
    })

    it('enforced without channel default falls back to command option', () => {
      const result = resolveEffectiveValue('command', null, true, 'user', 'default')
      expect(result).toBe('command')
    })
  })

  describe('wasOverriddenByChannel', () => {
    it('returns false when not enforced', () => {
      const result = wasOverriddenByChannel('command', 'channel', false)
      expect(result).toBe(false)
    })

    it('returns false when no channel default', () => {
      const result = wasOverriddenByChannel('command', null, true)
      expect(result).toBe(false)
    })

    it('returns false when no command option', () => {
      const result = wasOverriddenByChannel(null, 'channel', true)
      expect(result).toBe(false)
    })

    it('returns false when values match', () => {
      const result = wasOverriddenByChannel('same', 'same', true)
      expect(result).toBe(false)
    })

    it('returns true when enforced channel overrides different command option', () => {
      const result = wasOverriddenByChannel('command', 'channel', true)
      expect(result).toBe(true)
    })
  })

  describe('resolveMessageVisibility', () => {
    it('returns ephemeral by default', () => {
      const result = resolveMessageVisibility(null, null, null)
      expect(result).toEqual({ visibility: 'ephemeral', isEphemeral: true })
    })

    it('respects command option', () => {
      const result = resolveMessageVisibility('public', null, null)
      expect(result).toEqual({ visibility: 'public', isEphemeral: false })
    })

    it('respects user default', () => {
      const result = resolveMessageVisibility(null, null, 'public')
      expect(result).toEqual({ visibility: 'public', isEphemeral: false })
    })

    it('respects channel default', () => {
      const channelSettings = {
        visibility: null,
        priceList: null,
        currency: null,
        messageVisibility: 'public' as const,
        visibilityEnforced: false,
        priceListEnforced: false,
        currencyEnforced: false,
        messageVisibilityEnforced: false,
        announceInternal: null,
        announcePartner: null,
        commandPrefix: null,
      }
      const result = resolveMessageVisibility(null, channelSettings, null)
      expect(result).toEqual({ visibility: 'public', isEphemeral: false })
    })

    it('enforced channel visibility overrides command option', () => {
      const channelSettings = {
        visibility: null,
        priceList: null,
        currency: null,
        messageVisibility: 'ephemeral' as const,
        visibilityEnforced: false,
        priceListEnforced: false,
        currencyEnforced: false,
        messageVisibilityEnforced: true,
        announceInternal: null,
        announcePartner: null,
        commandPrefix: null,
      }
      const result = resolveMessageVisibility('public', channelSettings, null)
      expect(result).toEqual({ visibility: 'ephemeral', isEphemeral: true })
    })

    it('treats "use-channel" user default as null', () => {
      const result = resolveMessageVisibility(null, null, 'use-channel')
      expect(result).toEqual({ visibility: 'ephemeral', isEphemeral: true })
    })
  })
})
