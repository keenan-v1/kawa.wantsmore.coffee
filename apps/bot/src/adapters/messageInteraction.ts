/**
 * Message-to-Interaction Adapter
 *
 * Wraps a Discord Message to provide an interaction-like interface.
 * This allows existing slash commands to work with text-based prefix commands
 * without modification.
 */

import type {
  Message,
  MessageReplyOptions,
  User,
  Guild,
  GuildMember,
  Client,
  TextBasedChannel,
} from 'discord.js'

/**
 * Adapter that wraps a Discord Message to provide an interaction-like interface.
 */
export class MessageInteractionAdapter {
  private _replied = false
  private _deferred = false
  private _lastReply: Message | null = null

  constructor(
    private message: Message,
    private _commandName: string,
    private parsedOptions: Map<string, string | number | boolean | null>
  ) {}

  /** The user who sent the message */
  get user(): User {
    return this.message.author
  }

  /** The channel ID where the message was sent */
  get channelId(): string {
    return this.message.channelId
  }

  /** The guild ID (null for DMs) */
  get guildId(): string | null {
    return this.message.guildId
  }

  /** The guild (null for DMs) */
  get guild(): Guild | null {
    return this.message.guild
  }

  /** The guild member (null for DMs or if not cached) */
  get member(): GuildMember | null {
    return this.message.member
  }

  /** The Discord client */
  get client(): Client {
    return this.message.client
  }

  /** The channel */
  get channel(): TextBasedChannel {
    return this.message.channel
  }

  /** Whether a reply has been sent */
  get replied(): boolean {
    return this._replied
  }

  /** Whether the reply has been deferred */
  get deferred(): boolean {
    return this._deferred
  }

  /** The command name */
  get commandName(): string {
    return this._commandName
  }

  /**
   * Options accessor that mimics ChatInputCommandInteraction.options
   */
  options = {
    getString: (name: string, required?: boolean): string | null => {
      const value = this.parsedOptions.get(name)
      if (required && value === null) {
        throw new Error(`Required option "${name}" not provided`)
      }
      return typeof value === 'string' ? value : null
    },

    getInteger: (name: string, required?: boolean): number | null => {
      const value = this.parsedOptions.get(name)
      if (required && value === null) {
        throw new Error(`Required option "${name}" not provided`)
      }
      if (typeof value === 'number' && Number.isInteger(value)) {
        return value
      }
      return null
    },

    getNumber: (name: string, required?: boolean): number | null => {
      const value = this.parsedOptions.get(name)
      if (required && value === null) {
        throw new Error(`Required option "${name}" not provided`)
      }
      return typeof value === 'number' ? value : null
    },

    getBoolean: (name: string, required?: boolean): boolean | null => {
      const value = this.parsedOptions.get(name)
      if (required && value === null) {
        throw new Error(`Required option "${name}" not provided`)
      }
      return typeof value === 'boolean' ? value : null
    },
  }

  /**
   * Reply to the message.
   * Note: Ephemeral flag is ignored for message-based commands since
   * all replies are visible in the channel.
   */
  async reply(
    options: string | (MessageReplyOptions & { flags?: number })
  ): Promise<Message | void> {
    this._replied = true

    // Convert string to options object
    const replyOptions: MessageReplyOptions =
      typeof options === 'string' ? { content: options } : options

    // Remove ephemeral flag if present (not supported for regular messages)
    if ('flags' in replyOptions) {
      delete (replyOptions as { flags?: unknown }).flags
    }

    this._lastReply = await this.message.reply(replyOptions)
    return this._lastReply
  }

  /**
   * Defer the reply (shows typing indicator).
   * Note: Ephemeral option is ignored.
   */
  async deferReply(_options?: { ephemeral?: boolean }): Promise<void> {
    this._deferred = true
    // Send typing indicator if the channel supports it
    if ('sendTyping' in this.message.channel) {
      await this.message.channel.sendTyping()
    }
  }

  /**
   * Send a follow-up message.
   */
  async followUp(options: string | MessageReplyOptions): Promise<Message> {
    const messageOptions: MessageReplyOptions =
      typeof options === 'string' ? { content: options } : options

    // Remove ephemeral flag if present
    if ('flags' in messageOptions) {
      delete (messageOptions as { flags?: unknown }).flags
    }

    // Use send if available, otherwise reply to the original message
    if ('send' in this.message.channel) {
      return this.message.channel.send(messageOptions)
    }
    return this.message.reply(messageOptions)
  }

  /**
   * Edit the original reply.
   */
  async editReply(options: string | MessageReplyOptions): Promise<Message | void> {
    if (!this._lastReply) {
      // No reply to edit, send new message
      return this.followUp(options)
    }

    const content = typeof options === 'string' ? options : options.content

    return this._lastReply.edit({ content: content ?? undefined })
  }

  /**
   * Check if this is a chat input command (always true for this adapter)
   */
  isChatInputCommand(): boolean {
    return true
  }

  /**
   * Check if this is an autocomplete interaction (always false)
   */
  isAutocomplete(): boolean {
    return false
  }
}

/**
 * Type guard to check if an object is a MessageInteractionAdapter
 */
export function isMessageInteractionAdapter(obj: unknown): obj is MessageInteractionAdapter {
  return obj instanceof MessageInteractionAdapter
}
