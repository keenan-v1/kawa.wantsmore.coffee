/**
 * Shared mock utilities for Discord.js in tests
 */
import { vi, type Mock } from 'vitest'

// Type for mock interaction returned by createMockInteraction
export interface MockInteraction {
  user: {
    id: string
    username: string
    avatar: string | null
    displayName: string
    displayAvatarURL: Mock
  }
  guild: { id: string; members?: { fetch: (id: string) => Promise<unknown> } } | null
  member: { roles: { cache: Map<string, unknown> } } | null
  client: { guilds: { cache: Map<string, unknown> } }
  options: {
    getString: Mock
    getFocused: Mock
  }
  reply: Mock
  editReply: Mock
}

// Mock EmbedBuilder class
export class MockEmbedBuilder {
  private data: {
    title?: string
    color?: number
    description?: string
    fields: { name: string; value: string; inline: boolean }[]
    footer?: { text: string }
    thumbnail?: { url: string }
  } = { fields: [] }

  setTitle(title: string) {
    this.data.title = title
    return this
  }
  setColor(color: number) {
    this.data.color = color
    return this
  }
  setDescription(desc: string) {
    this.data.description = desc
    return this
  }
  addFields(...fields: { name: string; value: string; inline?: boolean }[]) {
    for (const f of fields) {
      this.data.fields.push({ ...f, inline: f.inline ?? false })
    }
    return this
  }
  setFields(...fields: { name: string; value: string; inline?: boolean }[]) {
    this.data.fields = fields.map(f => ({ ...f, inline: f.inline ?? false }))
    return this
  }
  setFooter(footer: { text: string }) {
    this.data.footer = footer
    return this
  }
  setThumbnail(url: string) {
    this.data.thumbnail = { url }
    return this
  }
  setTimestamp() {
    return this
  }

  static from(embed: MockEmbedBuilder) {
    const newEmbed = new MockEmbedBuilder()
    newEmbed.data = { ...embed.data, fields: [...embed.data.fields] }
    return newEmbed
  }
}

// Mock ActionRowBuilder class
export class MockActionRowBuilder {
  private components: MockButtonBuilder[] = []

  addComponents(...components: MockButtonBuilder[]) {
    this.components.push(...components)
    return this
  }
}

// Mock ButtonBuilder class
export class MockButtonBuilder {
  private data: { customId?: string; label?: string; style?: number; disabled?: boolean } = {}

  setCustomId(id: string) {
    this.data.customId = id
    return this
  }
  setLabel(label: string) {
    this.data.label = label
    return this
  }
  setStyle(style: number) {
    this.data.style = style
    return this
  }
  setDisabled(disabled: boolean) {
    this.data.disabled = disabled
    return this
  }
}

// Mock SlashCommandBuilder class
export class MockSlashCommandBuilder {
  private data: { name?: string; description?: string } = {}

  setName(name: string) {
    this.data.name = name
    return this
  }
  setDescription(desc: string) {
    this.data.description = desc
    return this
  }
  addStringOption(fn: (option: MockStringOption) => MockStringOption) {
    fn(new MockStringOption())
    return this
  }
  addBooleanOption(fn: (option: MockBooleanOption) => MockBooleanOption) {
    fn(new MockBooleanOption())
    return this
  }
}

class MockStringOption {
  setName(_name: string) {
    return this
  }
  setDescription(_desc: string) {
    return this
  }
  setRequired(_req: boolean) {
    return this
  }
  setMinLength(_len: number) {
    return this
  }
  setMaxLength(_len: number) {
    return this
  }
  setAutocomplete(_auto: boolean) {
    return this
  }
  addChoices(..._choices: { name: string; value: string }[]) {
    return this
  }
}

class MockBooleanOption {
  setName(_name: string) {
    return this
  }
  setDescription(_desc: string) {
    return this
  }
  setRequired(_req: boolean) {
    return this
  }
}

/**
 * Get the standard discord.js mock object for vi.mock()
 */
// Mock StringSelectMenuBuilder class
export class MockStringSelectMenuBuilder {
  private data: { customId?: string; placeholder?: string; options: unknown[] } = { options: [] }

  setCustomId(id: string) {
    this.data.customId = id
    return this
  }
  setPlaceholder(placeholder: string) {
    this.data.placeholder = placeholder
    return this
  }
  addOptions(options: unknown[]) {
    this.data.options = options
    return this
  }
}

// Mock ModalBuilder class
export class MockModalBuilder {
  private data: { customId?: string; title?: string } = {}
  private components: MockActionRowBuilder[] = []

  setCustomId(id: string) {
    this.data.customId = id
    return this
  }
  setTitle(title: string) {
    this.data.title = title
    return this
  }
  addComponents(...rows: MockActionRowBuilder[]) {
    this.components.push(...rows)
    return this
  }
}

// Mock TextInputBuilder class
export class MockTextInputBuilder {
  private data: {
    customId?: string
    label?: string
    placeholder?: string
    style?: number
    required?: boolean
    value?: string
    minLength?: number
    maxLength?: number
  } = {}

  setCustomId(id: string) {
    this.data.customId = id
    return this
  }
  setLabel(label: string) {
    this.data.label = label
    return this
  }
  setPlaceholder(placeholder: string) {
    this.data.placeholder = placeholder
    return this
  }
  setStyle(style: number) {
    this.data.style = style
    return this
  }
  setRequired(required: boolean) {
    this.data.required = required
    return this
  }
  setValue(value: string) {
    this.data.value = value
    return this
  }
  setMinLength(len: number) {
    this.data.minLength = len
    return this
  }
  setMaxLength(len: number) {
    this.data.maxLength = len
    return this
  }
}

/**
 * Get the standard discord.js mock object for vi.mock()
 */
export function getDiscordMock() {
  return {
    EmbedBuilder: MockEmbedBuilder,
    ActionRowBuilder: MockActionRowBuilder,
    ButtonBuilder: MockButtonBuilder,
    SlashCommandBuilder: MockSlashCommandBuilder,
    StringSelectMenuBuilder: MockStringSelectMenuBuilder,
    ModalBuilder: MockModalBuilder,
    TextInputBuilder: MockTextInputBuilder,
    ButtonStyle: {
      Primary: 1,
      Secondary: 2,
      Success: 3,
      Danger: 4,
      Link: 5,
    },
    TextInputStyle: {
      Short: 1,
      Paragraph: 2,
    },
    MessageFlags: {
      Ephemeral: 64,
    },
    ComponentType: {
      Button: 2,
      StringSelect: 3,
    },
  }
}

interface MockCollector {
  on: Mock
  _emit: (event: string, ...args: unknown[]) => void
}

/**
 * Create a mock message component collector
 */
function createMockCollector(): MockCollector {
  const handlers: Record<string, ((...args: unknown[]) => void)[]> = {}
  const collector: MockCollector = {
    on: vi.fn().mockImplementation(function (
      this: unknown,
      event: string,
      handler: (...args: unknown[]) => void
    ) {
      if (!handlers[event]) handlers[event] = []
      handlers[event].push(handler)
      return collector
    }),
    // Helper to trigger events in tests if needed
    _emit: (event: string, ...args: unknown[]) => {
      handlers[event]?.forEach(h => h(...args))
    },
  }
  return collector
}

/**
 * Create a mock InteractionResponse for testing
 */
function createMockResponse() {
  return {
    createMessageComponentCollector: vi.fn().mockReturnValue(createMockCollector()),
  }
}

/**
 * Create a mock ChatInputCommandInteraction for testing commands
 */
export function createMockInteraction(
  options: {
    userId?: string
    username?: string
    avatar?: string | null
    guild?: { id: string; members?: { fetch: (id: string) => Promise<unknown> } } | null
    member?: { roles: { cache: Map<string, unknown> } } | null
    stringOptions?: Record<string, string | null>
  } = {}
): { interaction: MockInteraction; replyFn: Mock; editReplyFn: Mock } {
  const {
    userId = '123456789',
    username = 'TestUser',
    avatar = 'avatar123',
    guild = null,
    member = null,
    stringOptions = {},
  } = options

  const mockResponse = createMockResponse()
  const replyFn = vi.fn().mockResolvedValue(mockResponse)
  const editReplyFn = vi.fn()

  const interaction = {
    user: {
      id: userId,
      username,
      avatar,
      displayName: username,
      displayAvatarURL: vi
        .fn()
        .mockReturnValue(`https://cdn.discordapp.com/avatars/${userId}/${avatar}.png`),
    },
    guild,
    member,
    client: {
      guilds: {
        cache: new Map(),
      },
      awaitModalSubmit: vi.fn().mockResolvedValue(null),
    },
    options: {
      getString: vi.fn().mockImplementation((name: string, _required?: boolean) => {
        return stringOptions[name] ?? null
      }),
      getFocused: vi.fn().mockReturnValue(''),
    },
    reply: replyFn,
    editReply: editReplyFn,
  }

  return {
    interaction,
    replyFn,
    editReplyFn,
  }
}
