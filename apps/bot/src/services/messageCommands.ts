/**
 * Message Command Handler
 *
 * Parses and handles text-based commands (prefix commands like !help, !buy, etc.).
 * Works alongside slash commands to provide an alternative input method.
 *
 * Prefix resolution order:
 * 1. Channel-specific commandPrefix
 * 2. Default commandPrefix (channelId = '0')
 * 3. DM: matches any configured prefix (cached for performance)
 * 4. No prefix configured for guild channels: ignore messages
 */

import type { Message } from 'discord.js'
import type { BotClient, Command } from '../client.js'
import { getChannelConfig } from './channelConfig.js'
import { db, channelConfig } from '@kawakawa/db'
import { eq } from 'drizzle-orm'
import { MessageInteractionAdapter } from '../adapters/messageInteraction.js'
import logger from '../utils/logger.js'

/** Default prefix for DMs when no prefixes are configured anywhere */
const DM_DEFAULT_PREFIX = '!'

/** Cache TTL in milliseconds (5 minutes) */
const PREFIX_CACHE_TTL = 5 * 60 * 1000

/** Cached list of all configured command prefixes */
let cachedPrefixes: string[] | null = null
let cacheTimestamp = 0

/**
 * Get all unique command prefixes from the database.
 * Results are cached for performance.
 */
export async function getAllPrefixes(): Promise<string[]> {
  const now = Date.now()

  // Return cached value if still valid
  if (cachedPrefixes !== null && now - cacheTimestamp < PREFIX_CACHE_TTL) {
    return cachedPrefixes
  }

  // Fetch all commandPrefix values from database
  const rows = await db
    .select({ value: channelConfig.value })
    .from(channelConfig)
    .where(eq(channelConfig.key, 'commandPrefix'))

  // Extract unique non-empty prefixes
  const prefixes = [...new Set(rows.map(r => r.value).filter(Boolean))]

  // Update cache
  cachedPrefixes = prefixes
  cacheTimestamp = now

  logger.debug({ prefixCount: prefixes.length }, 'Refreshed command prefix cache')

  return prefixes
}

/**
 * Clear the prefix cache. Useful for testing or when config changes.
 */
export function clearPrefixCache(): void {
  cachedPrefixes = null
  cacheTimestamp = 0
}

/**
 * Find a matching prefix from a list of prefixes.
 * Returns the matching prefix or null if none match.
 * Checks longer prefixes first to handle overlapping prefixes correctly.
 */
export function findMatchingPrefix(content: string, prefixes: string[]): string | null {
  // Sort by length descending to match longer prefixes first
  // e.g., '!!' should match before '!' for a message starting with '!!'
  const sorted = [...prefixes].sort((a, b) => b.length - a.length)

  for (const prefix of sorted) {
    if (content.startsWith(prefix)) {
      return prefix
    }
  }

  return null
}

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

  let prefix: string | null

  if (isDM) {
    // For DMs, match against any configured prefix
    // This allows users to continue using the same prefix they use in channels
    const allPrefixes = await getAllPrefixes()

    if (allPrefixes.length > 0) {
      prefix = findMatchingPrefix(message.content, allPrefixes)
    } else {
      // No prefixes configured anywhere, use default
      prefix = message.content.startsWith(DM_DEFAULT_PREFIX) ? DM_DEFAULT_PREFIX : null
    }
  } else {
    // For guild channels, use channel-specific prefix
    prefix = await getEffectivePrefix(message.channelId, isDM)
  }

  // No prefix matched - ignore message
  if (!prefix) {
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

  // Check if command allows prefix invocation
  if (command.prefixEnabled === false) {
    // Command explicitly disabled for prefix - ignore silently
    // User must use slash command for this
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
