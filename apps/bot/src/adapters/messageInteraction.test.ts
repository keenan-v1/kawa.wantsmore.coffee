import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  MessageInteractionAdapter,
  isMessageInteractionAdapter,
  getCommandPrefix,
} from './messageInteraction.js'
import type { Message, User, Guild, GuildMember, Client, TextBasedChannel } from 'discord.js'

// Helper to create a mock message
// Using Record<string, unknown> instead of Partial<Message> to avoid valueOf() type conflicts
function createMockMessage(overrides: Record<string, unknown> = {}): Message {
  const mockReply = vi.fn().mockResolvedValue({
    edit: vi.fn().mockResolvedValue({}),
  })

  const mockDmChannel = {
    send: vi.fn().mockResolvedValue({}),
  }

  return {
    author: {
      id: 'user123',
      username: 'testuser',
      bot: false,
      createDM: vi.fn().mockResolvedValue(mockDmChannel),
    } as unknown as User,
    channelId: 'channel123',
    guildId: 'guild123',
    guild: {
      id: 'guild123',
      name: 'Test Guild',
    } as Guild,
    member: {
      id: 'member123',
    } as GuildMember,
    client: {
      user: { id: 'bot123' },
    } as Client,
    channel: {
      send: vi.fn().mockResolvedValue({}),
      sendTyping: vi.fn().mockResolvedValue(undefined),
      isDMBased: () => false,
    } as unknown as TextBasedChannel,
    reply: mockReply,
    ...overrides,
  } as unknown as Message
}

describe('MessageInteractionAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('constructor and getters', () => {
    it('exposes user from message author', () => {
      const message = createMockMessage()
      const adapter = new MessageInteractionAdapter(message, 'help', new Map())

      expect(adapter.user.id).toBe('user123')
      expect(adapter.user.username).toBe('testuser')
    })

    it('exposes channelId', () => {
      const message = createMockMessage({ channelId: 'my-channel' })
      const adapter = new MessageInteractionAdapter(message, 'help', new Map())

      expect(adapter.channelId).toBe('my-channel')
    })

    it('exposes guildId', () => {
      const message = createMockMessage({ guildId: 'my-guild' })
      const adapter = new MessageInteractionAdapter(message, 'help', new Map())

      expect(adapter.guildId).toBe('my-guild')
    })

    it('exposes null guildId for DMs', () => {
      const message = createMockMessage({ guildId: null })
      const adapter = new MessageInteractionAdapter(message, 'help', new Map())

      expect(adapter.guildId).toBeNull()
    })

    it('exposes guild', () => {
      const message = createMockMessage()
      const adapter = new MessageInteractionAdapter(message, 'help', new Map())

      expect(adapter.guild?.name).toBe('Test Guild')
    })

    it('exposes member', () => {
      const message = createMockMessage()
      const adapter = new MessageInteractionAdapter(message, 'help', new Map())

      expect(adapter.member?.id).toBe('member123')
    })

    it('exposes client', () => {
      const message = createMockMessage()
      const adapter = new MessageInteractionAdapter(message, 'help', new Map())

      expect(adapter.client.user?.id).toBe('bot123')
    })

    it('exposes channel', () => {
      const message = createMockMessage()
      const adapter = new MessageInteractionAdapter(message, 'help', new Map())

      expect(adapter.channel).toBeDefined()
    })

    it('exposes commandName', () => {
      const message = createMockMessage()
      const adapter = new MessageInteractionAdapter(message, 'buy', new Map())

      expect(adapter.commandName).toBe('buy')
    })

    it('exposes prefix when provided', () => {
      const message = createMockMessage()
      const adapter = new MessageInteractionAdapter(message, 'help', new Map(), '?')

      expect(adapter.prefix).toBe('?')
    })

    it('defaults prefix to "!" when not provided', () => {
      const message = createMockMessage()
      const adapter = new MessageInteractionAdapter(message, 'help', new Map())

      expect(adapter.prefix).toBe('!')
    })

    it('initially has replied = false', () => {
      const message = createMockMessage()
      const adapter = new MessageInteractionAdapter(message, 'help', new Map())

      expect(adapter.replied).toBe(false)
    })

    it('initially has deferred = false', () => {
      const message = createMockMessage()
      const adapter = new MessageInteractionAdapter(message, 'help', new Map())

      expect(adapter.deferred).toBe(false)
    })
  })

  describe('options', () => {
    it('getString returns string value', () => {
      const options = new Map<string, string | number | boolean | null>([['input', 'DW 1000 BEN']])
      const message = createMockMessage()
      const adapter = new MessageInteractionAdapter(message, 'buy', options)

      expect(adapter.options.getString('input')).toBe('DW 1000 BEN')
    })

    it('getString returns null for non-existent key', () => {
      const message = createMockMessage()
      const adapter = new MessageInteractionAdapter(message, 'buy', new Map())

      expect(adapter.options.getString('input')).toBeNull()
    })

    it('getString throws when required and key not in map', () => {
      const message = createMockMessage()
      const adapter = new MessageInteractionAdapter(message, 'buy', new Map())

      expect(() => adapter.options.getString('input', true)).toThrow(
        'Required option "input" not provided'
      )
    })

    it('getString throws when required and value is null', () => {
      const options = new Map<string, string | number | boolean | null>([['input', null]])
      const message = createMockMessage()
      const adapter = new MessageInteractionAdapter(message, 'buy', options)

      expect(() => adapter.options.getString('input', true)).toThrow(
        'Required option "input" not provided'
      )
    })

    it('getString returns null for non-string value', () => {
      const options = new Map<string, string | number | boolean | null>([['count', 100]])
      const message = createMockMessage()
      const adapter = new MessageInteractionAdapter(message, 'buy', options)

      expect(adapter.options.getString('count')).toBeNull()
    })

    it('getInteger returns integer value', () => {
      const options = new Map<string, string | number | boolean | null>([['count', 100]])
      const message = createMockMessage()
      const adapter = new MessageInteractionAdapter(message, 'buy', options)

      expect(adapter.options.getInteger('count')).toBe(100)
    })

    it('getInteger returns null for non-integer number', () => {
      const options = new Map<string, string | number | boolean | null>([['count', 100.5]])
      const message = createMockMessage()
      const adapter = new MessageInteractionAdapter(message, 'buy', options)

      expect(adapter.options.getInteger('count')).toBeNull()
    })

    it('getInteger returns null for non-existent key', () => {
      const message = createMockMessage()
      const adapter = new MessageInteractionAdapter(message, 'buy', new Map())

      expect(adapter.options.getInteger('count')).toBeNull()
    })

    it('getInteger throws when required and key not in map', () => {
      const message = createMockMessage()
      const adapter = new MessageInteractionAdapter(message, 'buy', new Map())

      expect(() => adapter.options.getInteger('count', true)).toThrow(
        'Required option "count" not provided'
      )
    })

    it('getInteger throws when required and value is null', () => {
      const options = new Map<string, string | number | boolean | null>([['count', null]])
      const message = createMockMessage()
      const adapter = new MessageInteractionAdapter(message, 'buy', options)

      expect(() => adapter.options.getInteger('count', true)).toThrow(
        'Required option "count" not provided'
      )
    })

    it('getNumber returns number value', () => {
      const options = new Map<string, string | number | boolean | null>([['price', 100.5]])
      const message = createMockMessage()
      const adapter = new MessageInteractionAdapter(message, 'buy', options)

      expect(adapter.options.getNumber('price')).toBe(100.5)
    })

    it('getNumber returns null for non-existent key', () => {
      const message = createMockMessage()
      const adapter = new MessageInteractionAdapter(message, 'buy', new Map())

      expect(adapter.options.getNumber('price')).toBeNull()
    })

    it('getNumber throws when required and key not in map', () => {
      const message = createMockMessage()
      const adapter = new MessageInteractionAdapter(message, 'buy', new Map())

      expect(() => adapter.options.getNumber('price', true)).toThrow(
        'Required option "price" not provided'
      )
    })

    it('getNumber throws when required and value is null', () => {
      const options = new Map<string, string | number | boolean | null>([['price', null]])
      const message = createMockMessage()
      const adapter = new MessageInteractionAdapter(message, 'buy', options)

      expect(() => adapter.options.getNumber('price', true)).toThrow(
        'Required option "price" not provided'
      )
    })

    it('getBoolean returns boolean value', () => {
      const options = new Map<string, string | number | boolean | null>([['public', true]])
      const message = createMockMessage()
      const adapter = new MessageInteractionAdapter(message, 'query', options)

      expect(adapter.options.getBoolean('public')).toBe(true)
    })

    it('getBoolean returns null for non-existent key', () => {
      const message = createMockMessage()
      const adapter = new MessageInteractionAdapter(message, 'query', new Map())

      expect(adapter.options.getBoolean('public')).toBeNull()
    })

    it('getBoolean throws when required and key not in map', () => {
      const message = createMockMessage()
      const adapter = new MessageInteractionAdapter(message, 'query', new Map())

      expect(() => adapter.options.getBoolean('public', true)).toThrow(
        'Required option "public" not provided'
      )
    })

    it('getBoolean throws when required and value is null', () => {
      const options = new Map<string, string | number | boolean | null>([['public', null]])
      const message = createMockMessage()
      const adapter = new MessageInteractionAdapter(message, 'query', options)

      expect(() => adapter.options.getBoolean('public', true)).toThrow(
        'Required option "public" not provided'
      )
    })
  })

  describe('reply', () => {
    it('replies with string content', async () => {
      const message = createMockMessage()
      const adapter = new MessageInteractionAdapter(message, 'help', new Map())

      await adapter.reply('Hello!')

      expect(message.reply).toHaveBeenCalledWith({ content: 'Hello!' })
      expect(adapter.replied).toBe(true)
    })

    it('replies with options object', async () => {
      const message = createMockMessage()
      const adapter = new MessageInteractionAdapter(message, 'help', new Map())

      await adapter.reply({ content: 'Hello!', embeds: [] })

      expect(message.reply).toHaveBeenCalledWith({ content: 'Hello!', embeds: [] })
      expect(adapter.replied).toBe(true)
    })

    it('sends ephemeral reply via DM when in guild channel', async () => {
      const mockDmSend = vi.fn().mockResolvedValue({})
      const message = createMockMessage({
        author: {
          id: 'user123',
          username: 'testuser',
          bot: false,
          createDM: vi.fn().mockResolvedValue({ send: mockDmSend }),
        },
      })
      const adapter = new MessageInteractionAdapter(message, 'help', new Map())

      await adapter.reply({ content: 'Hello!', flags: 64 } as never) // 64 is ephemeral flag

      // Should send DM with content
      expect(mockDmSend).toHaveBeenCalledWith({ content: 'Hello!' })
      // Should post notice in channel
      expect(message.reply).toHaveBeenCalledWith('📬 Check your DMs!')
    })

    it('sends directly in channel when already in DM', async () => {
      const message = createMockMessage({
        channel: {
          send: vi.fn().mockResolvedValue({}),
          sendTyping: vi.fn().mockResolvedValue(undefined),
          isDMBased: () => true, // Already in DM
        },
      })
      const adapter = new MessageInteractionAdapter(message, 'help', new Map())

      await adapter.reply({ content: 'Hello!', flags: 64 } as never) // 64 is ephemeral flag

      // Should reply in the DM channel directly (no need to create new DM)
      expect(message.reply).toHaveBeenCalledWith({ content: 'Hello!' })
    })
  })

  describe('deferReply', () => {
    it('sets deferred to true', async () => {
      const message = createMockMessage()
      const adapter = new MessageInteractionAdapter(message, 'help', new Map())

      await adapter.deferReply()

      expect(adapter.deferred).toBe(true)
    })

    it('sends typing indicator when channel supports it', async () => {
      const sendTyping = vi.fn()
      const message = createMockMessage({
        channel: { sendTyping } as unknown as TextBasedChannel,
      })
      const adapter = new MessageInteractionAdapter(message, 'help', new Map())

      await adapter.deferReply()

      expect(sendTyping).toHaveBeenCalled()
    })

    it('handles channels without sendTyping', async () => {
      const message = createMockMessage({
        channel: {} as unknown as TextBasedChannel,
      })
      const adapter = new MessageInteractionAdapter(message, 'help', new Map())

      // Should not throw
      await adapter.deferReply()
      expect(adapter.deferred).toBe(true)
    })
  })

  describe('followUp', () => {
    it('sends message with string content', async () => {
      const send = vi.fn().mockResolvedValue({})
      const message = createMockMessage({
        channel: { send } as unknown as TextBasedChannel,
      })
      const adapter = new MessageInteractionAdapter(message, 'help', new Map())

      await adapter.followUp('Follow up!')

      expect(send).toHaveBeenCalledWith({ content: 'Follow up!' })
    })

    it('sends message with options object', async () => {
      const send = vi.fn().mockResolvedValue({})
      const message = createMockMessage({
        channel: { send } as unknown as TextBasedChannel,
      })
      const adapter = new MessageInteractionAdapter(message, 'help', new Map())

      await adapter.followUp({ content: 'Follow up!', embeds: [] })

      expect(send).toHaveBeenCalledWith({ content: 'Follow up!', embeds: [] })
    })

    it('falls back to reply if channel has no send method', async () => {
      const reply = vi.fn().mockResolvedValue({})
      const message = createMockMessage({
        channel: {} as unknown as TextBasedChannel,
        reply,
      })
      const adapter = new MessageInteractionAdapter(message, 'help', new Map())

      await adapter.followUp('Follow up!')

      expect(reply).toHaveBeenCalledWith({ content: 'Follow up!' })
    })
  })

  describe('editReply', () => {
    it('edits the last reply when one exists', async () => {
      const edit = vi.fn().mockResolvedValue({})
      const mockReply = vi.fn().mockResolvedValue({ edit })
      const message = createMockMessage({ reply: mockReply })
      const adapter = new MessageInteractionAdapter(message, 'help', new Map())

      await adapter.reply('Original')
      await adapter.editReply('Edited')

      expect(edit).toHaveBeenCalledWith({ content: 'Edited' })
    })

    it('extracts content from options object', async () => {
      const edit = vi.fn().mockResolvedValue({})
      const mockReply = vi.fn().mockResolvedValue({ edit })
      const message = createMockMessage({ reply: mockReply })
      const adapter = new MessageInteractionAdapter(message, 'help', new Map())

      await adapter.reply('Original')
      await adapter.editReply({ content: 'Edited content' })

      expect(edit).toHaveBeenCalledWith({ content: 'Edited content' })
    })

    it('falls back to followUp when no reply exists', async () => {
      const send = vi.fn().mockResolvedValue({})
      const message = createMockMessage({
        channel: { send } as unknown as TextBasedChannel,
      })
      const adapter = new MessageInteractionAdapter(message, 'help', new Map())

      await adapter.editReply('No reply to edit')

      expect(send).toHaveBeenCalledWith({ content: 'No reply to edit' })
    })
  })

  describe('isChatInputCommand', () => {
    it('returns true', () => {
      const message = createMockMessage()
      const adapter = new MessageInteractionAdapter(message, 'help', new Map())

      expect(adapter.isChatInputCommand()).toBe(true)
    })
  })

  describe('isAutocomplete', () => {
    it('returns false', () => {
      const message = createMockMessage()
      const adapter = new MessageInteractionAdapter(message, 'help', new Map())

      expect(adapter.isAutocomplete()).toBe(false)
    })
  })
})

describe('isMessageInteractionAdapter', () => {
  it('returns true for MessageInteractionAdapter instance', () => {
    const message = createMockMessage()
    const adapter = new MessageInteractionAdapter(message, 'help', new Map())

    expect(isMessageInteractionAdapter(adapter)).toBe(true)
  })

  it('returns false for plain object', () => {
    expect(isMessageInteractionAdapter({ replied: false })).toBe(false)
  })

  it('returns false for null', () => {
    expect(isMessageInteractionAdapter(null)).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isMessageInteractionAdapter(undefined)).toBe(false)
  })

  it('returns false for string', () => {
    expect(isMessageInteractionAdapter('not an adapter')).toBe(false)
  })
})

describe('getCommandPrefix', () => {
  it('returns prefix from MessageInteractionAdapter', () => {
    const message = createMockMessage()
    const adapter = new MessageInteractionAdapter(message, 'help', new Map(), '?')

    expect(getCommandPrefix(adapter)).toBe('?')
  })

  it('returns "/" for non-MessageInteractionAdapter objects', () => {
    // Mock a regular ChatInputCommandInteraction-like object
    const mockInteraction = { commandName: 'help', user: { id: 'user123' } }

    expect(getCommandPrefix(mockInteraction)).toBe('/')
  })

  it('returns "/" for null', () => {
    expect(getCommandPrefix(null)).toBe('/')
  })

  it('returns "/" for undefined', () => {
    expect(getCommandPrefix(undefined)).toBe('/')
  })
})
