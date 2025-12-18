import { describe, it, expect, beforeEach, vi } from 'vitest'

// Create hoisted mock functions
const { mockGetChannelConfig } = vi.hoisted(() => ({
  mockGetChannelConfig: vi.fn(),
}))

// Mock the channelConfig module
vi.mock('./channelConfig.js', () => ({
  getChannelConfig: mockGetChannelConfig,
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
import { getEffectivePrefix, handleMessageCommand } from './messageCommands.js'
import type { Message } from 'discord.js'
import type { BotClient, Command } from '../client.js'
import { Collection } from 'discord.js'

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
      mockGetChannelConfig.mockResolvedValue(null)

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
  })
})
