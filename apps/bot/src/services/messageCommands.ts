/**
 * Message Command Handler
 *
 * Parses and handles text-based commands (prefix commands like !help, !buy, etc.).
 * Works alongside slash commands to provide an alternative input method.
 *
 * Prefix resolution order:
 * 1. Channel-specific commandPrefix
 * 2. Default commandPrefix (channelId = '0')
 * 3. DM default: '!' (if not configured)
 * 4. No prefix configured for guild channels: ignore messages
 */

import type { Message } from 'discord.js'
import type { BotClient, Command } from '../client.js'
import { getChannelConfig } from './channelConfig.js'
import { MessageInteractionAdapter } from '../adapters/messageInteraction.js'
import logger from '../utils/logger.js'

/** Default prefix for DMs when not configured */
const DM_DEFAULT_PREFIX = '!'

/**
 * Get the effective command prefix for a channel.
 *
 * @param channelId - The Discord channel ID
 * @param isDM - Whether this is a DM channel
 * @returns The command prefix, or null if prefix commands are disabled
 */
export async function getEffectivePrefix(channelId: string, isDM: boolean): Promise<string | null> {
  // Get channel config (includes fallback to defaults)
  const config = await getChannelConfig(channelId)

  if (config?.commandPrefix) {
    return config.commandPrefix
  }

  // For DMs, default to '!' if no prefix configured
  if (isDM) {
    return DM_DEFAULT_PREFIX
  }

  // No prefix configured for this guild channel
  return null
}

/**
 * Parse command arguments from message content.
 *
 * For now, we use a simple approach:
 * - First token after prefix is the command name
 * - Remaining content is passed as the 'input' option (for commands that support it)
 *
 * This allows commands like:
 * - !help → command: 'help', input: null
 * - !buy DW 1000 BEN → command: 'buy', input: 'DW 1000 BEN'
 * - !query COF BEN → command: 'query', input: 'COF BEN'
 *
 * @param content - Message content after the prefix
 * @returns Parsed command name and options
 */
function parseCommandArgs(content: string): {
  commandName: string | null
  options: Map<string, string | number | boolean | null>
} {
  const trimmed = content.trim()
  const parts = trimmed.split(/\s+/)

  if (parts.length === 0 || !parts[0]) {
    return { commandName: null, options: new Map() }
  }

  const commandName = parts[0].toLowerCase()
  const options = new Map<string, string | number | boolean | null>()

  // Everything after the command name is the 'input' (for flexible commands)
  if (parts.length > 1) {
    const inputValue = parts.slice(1).join(' ')
    options.set('input', inputValue)

    // Also set 'query' for the /query command
    options.set('query', inputValue)
  }

  return { commandName, options }
}

/**
 * Handle an incoming message, checking for prefix commands.
 *
 * @param message - The Discord message
 * @param client - The bot client with registered commands
 */
export async function handleMessageCommand(message: Message, client: BotClient): Promise<void> {
  // Ignore bot messages
  if (message.author.bot) {
    return
  }

  // Ignore messages without content
  if (!message.content) {
    return
  }

  // Determine if this is a DM
  const isDM = message.channel.isDMBased()

  // Get effective prefix
  const prefix = await getEffectivePrefix(message.channelId, isDM)

  // No prefix configured - ignore message
  if (!prefix) {
    return
  }

  // Check if message starts with prefix
  if (!message.content.startsWith(prefix)) {
    return
  }

  // Extract command content (everything after prefix)
  const commandContent = message.content.slice(prefix.length)

  // Parse command and arguments
  const { commandName, options } = parseCommandArgs(commandContent)

  if (!commandName) {
    return
  }

  // Look up command
  const command = client.commands.get(commandName)

  if (!command) {
    // Unknown command - ignore silently
    // (Could optionally send an error message here)
    return
  }

  // Create adapter to make message look like an interaction
  const adapter = new MessageInteractionAdapter(message, commandName, options)

  // Log command invocation
  const startTime = Date.now()
  const logContext = {
    command: commandName,
    userId: message.author.id,
    username: message.author.username,
    guildId: message.guildId,
    source: 'prefix',
    prefix,
  }

  logger.info(logContext, 'Prefix command invoked')

  try {
    // Execute command with adapter
    // Cast is needed because commands expect ChatInputCommandInteraction
    // but our adapter provides a compatible interface
    await command.execute(adapter as unknown as Parameters<Command['execute']>[0])

    logger.info({ ...logContext, durationMs: Date.now() - startTime }, 'Prefix command completed')
  } catch (error) {
    logger.error(
      { ...logContext, error, durationMs: Date.now() - startTime },
      'Prefix command failed'
    )

    // Send error message
    try {
      if (adapter.replied || adapter.deferred) {
        await adapter.followUp('There was an error executing this command.')
      } else {
        await adapter.reply('There was an error executing this command.')
      }
    } catch {
      // Ignore follow-up errors
    }
  }
}
