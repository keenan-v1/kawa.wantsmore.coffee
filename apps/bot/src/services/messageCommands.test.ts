import { describe, it, expect, beforeEach, vi } from 'vitest'

// Create hoisted mock functions
const { mockGetChannelConfig, mockDbSelect } = vi.hoisted(() => ({
  mockGetChannelConfig: vi.fn(),
  mockDbSelect: vi.fn(),
}))

// Mock the channelConfig module
vi.mock('./channelConfig.js', () => ({
  getChannelConfig: mockGetChannelConfig,
}))

// Mock the database module
vi.mock('@kawakawa/db', () => ({
  db: {
    select: mockDbSelect,
  },
  channelConfig: {
    key: 'key',
    value: 'value',
  },
}))

// Mock drizzle-orm eq function
vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
}))

// Mock the MessageInteractionAdapter
vi.mock('../adapters/messageInteraction.js', () => ({
  MessageInteractionAdapter: class MockMessageInteractionAdapter {
    replied = false
    deferred = false
    reply = vi.fn()
    followUp = vi.fn()
    constructor() {}
  },
}))

// Mock logger
vi.mock('../utils/logger.js', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

// Import after mocks
import {
  getEffectivePrefix,
  handleMessageCommand,
  getAllPrefixes,
  findMatchingPrefix,
  clearPrefixCache,
} from './messageCommands.js'
import type { Message } from 'discord.js'
import type { BotClient, Command } from '../client.js'
import { Collection } from 'discord.js'

// Helper to set up db mock chain
function setupDbMock(prefixes: string[]) {
  const mockWhere = vi.fn().mockResolvedValue(prefixes.map(p => ({ value: p })))
  const mockFrom = vi.fn().mockReturnValue({ where: mockWhere })
  mockDbSelect.mockReturnValue({ from: mockFrom })
  return { mockWhere, mockFrom }
}

// Helper to create mock message
// Using Record<string, unknown> instead of Partial<Message> to avoid valueOf() type conflicts
function createMockMessage(overrides: Record<string, unknown> = {}): Message {
  return {
    author: { bot: false, id: 'user123', username: 'testuser' },
    content: '',
    channelId: 'channel123',
    guildId: 'guild123',
    channel: {
      isDMBased: () => false,
    },
    reply: vi.fn(),
    ...overrides,
  } as unknown as Message
}

// Helper to create mock client
function createMockClient(commands: Map<string, Command> = new Map()): BotClient {
  return {
    commands: new Collection(commands),
  } as unknown as BotClient
}

// Helper to create mock command
function createMockCommand(name: string): Command {
  return {
    data: { name, description: `${name} command`, toJSON: () => ({}) },
    execute: vi.fn().mockResolvedValue(undefined),
  }
}

describe('messageCommands', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearPrefixCache() // Clear cache between tests
  })

  describe('getEffectivePrefix', () => {
    it('returns channel-specific prefix when configured', async () => {
      mockGetChannelConfig.mockResolvedValue({
        commandPrefix: '!',
      })

      const result = await getEffectivePrefix('channel123', false)
      expect(result).toBe('!')
    })

    it('returns default prefix from channelId "0" when channel has no config', async () => {
      mockGetChannelConfig.mockResolvedValue({
        commandPrefix: '?',
      })

      const result = await getEffectivePrefix('channel123', false)
      expect(result).toBe('?')
    })

    it('returns "!" for DMs when no prefix configured', async () => {
      mockGetChannelConfig.mockResolvedValue(null)

      const result = await getEffectivePrefix('dm123', true)
      expect(result).toBe('!')
    })

    it('returns null for guild channels when no prefix configured', async () => {
      mockGetChannelConfig.mockResolvedValue(null)

      const result = await getEffectivePrefix('channel123', false)
      expect(result).toBeNull()
    })

    it('returns configured DM prefix over default', async () => {
      mockGetChannelConfig.mockResolvedValue({
        commandPrefix: '.',
      })

      const result = await getEffectivePrefix('dm123', true)
      expect(result).toBe('.')
    })
  })

  describe('handleMessageCommand', () => {
    it('ignores bot messages', async () => {
      const message = createMockMessage({
        author: { bot: true, id: 'bot123', username: 'botuser' } as Message['author'],
        content: '!help',
      })
      const client = createMockClient()

      await handleMessageCommand(message, client)

      expect(mockGetChannelConfig).not.toHaveBeenCalled()
    })

    it('ignores messages without content', async () => {
      const message = createMockMessage({
        content: '',
      })
      const client = createMockClient()

      await handleMessageCommand(message, client)

      expect(mockGetChannelConfig).not.toHaveBeenCalled()
    })

    it('ignores messages when no prefix configured for guild channel', async () => {
      mockGetChannelConfig.mockResolvedValue(null)

      const message = createMockMessage({
        content: 'hello there',
      })
      const client = createMockClient()

      await handleMessageCommand(message, client)

      expect(mockGetChannelConfig).toHaveBeenCalledWith('channel123')
    })

    it('ignores messages not starting with prefix', async () => {
      mockGetChannelConfig.mockResolvedValue({
        commandPrefix: '!',
      })

      const message = createMockMessage({
        content: 'hello there',
      })
      const helpCommand = createMockCommand('help')
      const client = createMockClient(new Map([['help', helpCommand]]))

      await handleMessageCommand(message, client)

      expect(helpCommand.execute).not.toHaveBeenCalled()
    })

    it('ignores unknown commands', async () => {
      mockGetChannelConfig.mockResolvedValue({
        commandPrefix: '!',
      })

      const message = createMockMessage({
        content: '!unknowncommand',
      })
      const helpCommand = createMockCommand('help')
      const client = createMockClient(new Map([['help', helpCommand]]))

      await handleMessageCommand(message, client)

      expect(helpCommand.execute).not.toHaveBeenCalled()
    })

    it('executes known command with prefix', async () => {
      mockGetChannelConfig.mockResolvedValue({
        commandPrefix: '!',
      })

      const message = createMockMessage({
        content: '!help',
      })
      const helpCommand = createMockCommand('help')
      const client = createMockClient(new Map([['help', helpCommand]]))

      await handleMessageCommand(message, client)

      expect(helpCommand.execute).toHaveBeenCalled()
    })

    it('handles command with arguments', async () => {
      mockGetChannelConfig.mockResolvedValue({
        commandPrefix: '!',
      })

      const message = createMockMessage({
        content: '!buy DW 1000 BEN',
      })
      const buyCommand = createMockCommand('buy')
      const client = createMockClient(new Map([['buy', buyCommand]]))

      await handleMessageCommand(message, client)

      expect(buyCommand.execute).toHaveBeenCalled()
    })

    it('handles different prefix characters', async () => {
      mockGetChannelConfig.mockResolvedValue({
        commandPrefix: '?',
      })

      const message = createMockMessage({
        content: '?query COF',
      })
      const queryCommand = createMockCommand('query')
      const client = createMockClient(new Map([['query', queryCommand]]))

      await handleMessageCommand(message, client)

      expect(queryCommand.execute).toHaveBeenCalled()
    })

    it('handles multi-character prefix', async () => {
      mockGetChannelConfig.mockResolvedValue({
        commandPrefix: '!!',
      })

      const message = createMockMessage({
        content: '!!help',
      })
      const helpCommand = createMockCommand('help')
      const client = createMockClient(new Map([['help', helpCommand]]))

      await handleMessageCommand(message, client)

      expect(helpCommand.execute).toHaveBeenCalled()
    })

    it('handles command name case-insensitively', async () => {
      mockGetChannelConfig.mockResolvedValue({
        commandPrefix: '!',
      })

      const message = createMockMessage({
        content: '!HELP',
      })
      const helpCommand = createMockCommand('help')
      const client = createMockClient(new Map([['help', helpCommand]]))

      await handleMessageCommand(message, client)

      expect(helpCommand.execute).toHaveBeenCalled()
    })

    it('handles DM messages with default prefix', async () => {
      // No prefixes configured in database, so it should use default '!'
      setupDbMock([])

      const message = createMockMessage({
        content: '!help',
        guildId: null,
        channel: {
          isDMBased: () => true,
        } as Message['channel'],
      })
      const helpCommand = createMockCommand('help')
      const client = createMockClient(new Map([['help', helpCommand]]))

      await handleMessageCommand(message, client)

      expect(helpCommand.execute).toHaveBeenCalled()
    })

    it('handles command execution errors gracefully', async () => {
      mockGetChannelConfig.mockResolvedValue({
        commandPrefix: '!',
      })

      const message = createMockMessage({
        content: '!error',
        reply: vi.fn(),
      })
      const errorCommand = createMockCommand('error')
      errorCommand.execute = vi.fn().mockRejectedValue(new Error('Test error'))
      const client = createMockClient(new Map([['error', errorCommand]]))

      // Should not throw
      await expect(handleMessageCommand(message, client)).resolves.not.toThrow()
    })

    it('ignores empty command after prefix', async () => {
      mockGetChannelConfig.mockResolvedValue({
        commandPrefix: '!',
      })

      const message = createMockMessage({
        content: '! ',
      })
      const helpCommand = createMockCommand('help')
      const client = createMockClient(new Map([['help', helpCommand]]))

      await handleMessageCommand(message, client)

      expect(helpCommand.execute).not.toHaveBeenCalled()
    })

    it('ignores commands with prefixEnabled: false', async () => {
      mockGetChannelConfig.mockResolvedValue({
        commandPrefix: '!',
      })

      const message = createMockMessage({
        content: '!password',
      })
      const passwordCommand = createMockCommand('password')
      passwordCommand.prefixEnabled = false
      const client = createMockClient(new Map([['password', passwordCommand]]))

      await handleMessageCommand(message, client)

      // Command should not be executed because prefixEnabled is false
      expect(passwordCommand.execute).not.toHaveBeenCalled()
    })

    it('executes commands without prefixEnabled set (defaults to enabled)', async () => {
      mockGetChannelConfig.mockResolvedValue({
        commandPrefix: '!',
      })

      const message = createMockMessage({
        content: '!query',
      })
      const queryCommand = createMockCommand('query')
      // prefixEnabled not set, defaults to enabled
      const client = createMockClient(new Map([['query', queryCommand]]))

      await handleMessageCommand(message, client)

      expect(queryCommand.execute).toHaveBeenCalled()
    })

    describe('DM multi-prefix matching', () => {
      it('matches any configured prefix in DMs', async () => {
        // Set up database to return multiple prefixes
        setupDbMock(['!', '?', '.'])

        const message = createMockMessage({
          content: '?help',
          guildId: null,
          channel: {
            isDMBased: () => true,
          } as Message['channel'],
        })
        const helpCommand = createMockCommand('help')
        const client = createMockClient(new Map([['help', helpCommand]]))

        await handleMessageCommand(message, client)

        expect(helpCommand.execute).toHaveBeenCalled()
      })

      it('matches different prefixes in DMs', async () => {
        setupDbMock(['!', '?', '.'])

        const message = createMockMessage({
          content: '.query COF',
          guildId: null,
          channel: {
            isDMBased: () => true,
          } as Message['channel'],
        })
        const queryCommand = createMockCommand('query')
        const client = createMockClient(new Map([['query', queryCommand]]))

        await handleMessageCommand(message, client)

        expect(queryCommand.execute).toHaveBeenCalled()
      })

      it('falls back to default prefix when no prefixes configured in DMs', async () => {
        setupDbMock([])

        const message = createMockMessage({
          content: '!help',
          guildId: null,
          channel: {
            isDMBased: () => true,
          } as Message['channel'],
        })
        const helpCommand = createMockCommand('help')
        const client = createMockClient(new Map([['help', helpCommand]]))

        await handleMessageCommand(message, client)

        expect(helpCommand.execute).toHaveBeenCalled()
      })

      it('ignores messages with no matching prefix in DMs', async () => {
        setupDbMock(['!', '?'])

        const message = createMockMessage({
          content: '.help',
          guildId: null,
          channel: {
            isDMBased: () => true,
          } as Message['channel'],
        })
        const helpCommand = createMockCommand('help')
        const client = createMockClient(new Map([['help', helpCommand]]))

        await handleMessageCommand(message, client)

        expect(helpCommand.execute).not.toHaveBeenCalled()
      })
    })
  })

  describe('findMatchingPrefix', () => {
    it('returns matching prefix', () => {
      const result = findMatchingPrefix('!help', ['!', '?', '.'])
      expect(result).toBe('!')
    })

    it('returns null when no prefix matches', () => {
      const result = findMatchingPrefix('hello', ['!', '?', '.'])
      expect(result).toBeNull()
    })

    it('matches longer prefixes first', () => {
      // If content is '!!help', and both '!' and '!!' are valid prefixes,
      // it should match '!!' not '!'
      const result = findMatchingPrefix('!!help', ['!', '!!'])
      expect(result).toBe('!!')
    })

    it('handles empty prefix list', () => {
      const result = findMatchingPrefix('!help', [])
      expect(result).toBeNull()
    })

    it('handles multi-character prefixes', () => {
      const result = findMatchingPrefix('kawa help', ['kawa ', '!'])
      expect(result).toBe('kawa ')
    })
  })

  describe('getAllPrefixes', () => {
    it('returns unique prefixes from database', async () => {
      setupDbMock(['!', '?', '!', '.']) // Duplicates should be removed

      const result = await getAllPrefixes()

      expect(result).toHaveLength(3)
      expect(result).toContain('!')
      expect(result).toContain('?')
      expect(result).toContain('.')
    })

    it('caches results', async () => {
      setupDbMock(['!', '?'])

      // First call
      const result1 = await getAllPrefixes()
      expect(result1).toHaveLength(2)

      // Second call should use cache
      const result2 = await getAllPrefixes()
      expect(result2).toHaveLength(2)

      // Database should only be queried once
      expect(mockDbSelect).toHaveBeenCalledTimes(1)
    })

    it('returns empty array when no prefixes configured', async () => {
      setupDbMock([])

      const result = await getAllPrefixes()

      expect(result).toEqual([])
    })
  })
})
