/**
 * Channel Config Service for Discord Bot
 *
 * Provides per-channel settings using a flexible key-value store.
 * When enforced = true, the channel default cannot be overridden.
 * When enforced = false: command > channel > user > system
 */

import { db, channelConfig } from '@kawakawa/db'
import { inArray } from 'drizzle-orm'

/** Channel ID used for default settings that apply to all channels */
export const DEFAULT_CHANNEL_ID = '0'
import type { Currency, OrderType, ChannelConfigKey, MessageVisibility } from '@kawakawa/types'
import { USE_CHANNEL_DEFAULT } from './userSettings.js'

/**
 * Channel settings aggregated from key-value store
 */
export interface ChannelSettings {
  // Defaults
  visibility: OrderType | null
  priceList: string | null
  currency: Currency | null
  messageVisibility: MessageVisibility | null
  // Enforced flags
  visibilityEnforced: boolean
  priceListEnforced: boolean
  currencyEnforced: boolean
  messageVisibilityEnforced: boolean
  // Announcement channels (where to send query announcements)
  announceInternal: string | null // Channel ID for internal visibility queries
  announcePartner: string | null // Channel ID for partner visibility queries
  // Command prefix for text-based commands (e.g., '!', '?', '.')
  commandPrefix: string | null
}

/**
 * Parse a boolean string value
 */
function parseBool(value: string | undefined): boolean {
  return value === 'true'
}

/**
 * Build ChannelSettings from a config map
 */
function buildSettings(configMap: Map<string, string>): ChannelSettings {
  return {
    visibility: (configMap.get('visibility') as OrderType) || null,
    priceList: configMap.get('priceList') || null,
    currency: (configMap.get('currency') as Currency) || null,
    messageVisibility: (configMap.get('messageVisibility') as MessageVisibility) || null,
    visibilityEnforced: parseBool(configMap.get('visibilityEnforced')),
    priceListEnforced: parseBool(configMap.get('priceListEnforced')),
    currencyEnforced: parseBool(configMap.get('currencyEnforced')),
    messageVisibilityEnforced: parseBool(configMap.get('messageVisibilityEnforced')),
    announceInternal: configMap.get('announceInternal') || null,
    announcePartner: configMap.get('announcePartner') || null,
    commandPrefix: configMap.get('commandPrefix') || null,
  }
}

/**
 * Get channel config for a specific Discord channel.
 * Fetches all key-value pairs and aggregates into ChannelSettings.
 *
 * Resolution order:
 * 1. Channel-specific config (exact channelId match)
 * 2. Default config (channelId = '0') - used as fallback for missing values
 *
 * Returns null only if neither channel-specific nor default config exists.
 */
export async function getChannelConfig(channelId: string): Promise<ChannelSettings | null> {
  // Query both channel-specific and default configs in one query
  const channelIdsToQuery =
    channelId === DEFAULT_CHANNEL_ID ? [DEFAULT_CHANNEL_ID] : [channelId, DEFAULT_CHANNEL_ID]

  const rows = await db
    .select({
      channelId: channelConfig.channelId,
      key: channelConfig.key,
      value: channelConfig.value,
    })
    .from(channelConfig)
    .where(inArray(channelConfig.channelId, channelIdsToQuery))

  if (rows.length === 0) {
    return null
  }

  // Build maps for both default and channel-specific config
  const defaultMap = new Map<string, string>()
  const channelMap = new Map<string, string>()

  for (const row of rows) {
    if (row.channelId === DEFAULT_CHANNEL_ID) {
      defaultMap.set(row.key, row.value)
    } else {
      channelMap.set(row.key, row.value)
    }
  }

  // If no channel-specific config and no defaults, return null
  if (channelMap.size === 0 && defaultMap.size === 0) {
    return null
  }

  // Merge: channel-specific values override defaults
  const mergedMap = new Map<string, string>(defaultMap)
  for (const [key, value] of channelMap) {
    mergedMap.set(key, value)
  }

  return buildSettings(mergedMap)
}

/**
 * Get a specific config value for a channel.
 * Falls back to default config (channelId = '0') if not found for the specific channel.
 */
export async function getChannelConfigValue(
  channelId: string,
  key: ChannelConfigKey
): Promise<string | null> {
  const channelIdsToQuery =
    channelId === DEFAULT_CHANNEL_ID ? [DEFAULT_CHANNEL_ID] : [channelId, DEFAULT_CHANNEL_ID]

  const rows = await db
    .select({
      channelId: channelConfig.channelId,
      key: channelConfig.key,
      value: channelConfig.value,
    })
    .from(channelConfig)
    .where(inArray(channelConfig.channelId, channelIdsToQuery))

  // First try channel-specific value
  const channelRow = rows.find(r => r.channelId === channelId && r.key === key)
  if (channelRow) {
    return channelRow.value
  }

  // Fall back to default
  const defaultRow = rows.find(r => r.channelId === DEFAULT_CHANNEL_ID && r.key === key)
  return defaultRow?.value ?? null
}

/**
 * Resolve effective value for a setting.
 *
 * Resolution order when enforced = false:
 *   1. Command option (user typed it explicitly)
 *   2. Channel default
 *   3. User default
 *   4. System default
 *
 * When enforced = true:
 *   Channel default wins (no override possible)
 *
 * @param commandOption - Value from command option (null/undefined if not provided)
 * @param channelDefault - Channel default value (null if not set)
 * @param channelEnforced - Whether channel default is enforced
 * @param userDefault - User's default value
 * @param systemDefault - System fallback value
 * @returns The effective value to use
 */
export function resolveEffectiveValue<T>(
  commandOption: T | null | undefined,
  channelDefault: T | null | undefined,
  channelEnforced: boolean,
  userDefault: T | null | undefined,
  systemDefault: T
): T {
  // If channel enforced and has a default, it wins unconditionally
  if (channelEnforced && channelDefault !== null && channelDefault !== undefined) {
    return channelDefault
  }

  // Otherwise, use resolution order: command > channel > user > system
  if (commandOption !== null && commandOption !== undefined) {
    return commandOption
  }

  if (channelDefault !== null && channelDefault !== undefined) {
    return channelDefault
  }

  if (userDefault !== null && userDefault !== undefined) {
    return userDefault
  }

  return systemDefault
}

/**
 * Check if a value was explicitly overridden by an enforced channel default.
 * Useful for warning users that their choice was ignored.
 *
 * @param commandOption - Value from command option
 * @param channelDefault - Channel default value
 * @param channelEnforced - Whether channel default is enforced
 * @returns true if the command option was provided but overridden by enforced channel default
 */
export function wasOverriddenByChannel<T>(
  commandOption: T | null | undefined,
  channelDefault: T | null | undefined,
  channelEnforced: boolean
): boolean {
  // Only counts as overridden if:
  // 1. Channel is enforced
  // 2. Channel has a default
  // 3. User provided a command option
  // 4. They differ
  if (!channelEnforced || channelDefault === null || channelDefault === undefined) {
    return false
  }

  if (commandOption === null || commandOption === undefined) {
    return false
  }

  return commandOption !== channelDefault
}

/**
 * Resolve message visibility for a command.
 *
 * Resolution order when enforced = false:
 *   1. Command option (user typed it explicitly)
 *   2. Channel default
 *   3. User default (unless 'use-channel', which skips to channel default)
 *   4. System default (ephemeral)
 *
 * When enforced = true:
 *   Channel default wins (no override possible)
 *
 * @param commandOption - Value from command option (null/undefined if not provided)
 * @param channelSettings - Channel settings (or null if not configured)
 * @param userDefault - User's default message visibility (or 'use-channel' to defer to channel)
 * @returns Object with effective visibility and whether it's ephemeral
 */
export function resolveMessageVisibility(
  commandOption: MessageVisibility | null | undefined,
  channelSettings: ChannelSettings | null,
  userDefault: MessageVisibility | typeof USE_CHANNEL_DEFAULT | null | undefined
): { visibility: MessageVisibility; isEphemeral: boolean } {
  // If user's preference is 'use-channel', treat as no preference (null)
  // This allows channel default to be used in the resolution chain
  const effectiveUserDefault = userDefault === USE_CHANNEL_DEFAULT ? null : userDefault

  const effectiveVisibility = resolveEffectiveValue(
    commandOption,
    channelSettings?.messageVisibility,
    channelSettings?.messageVisibilityEnforced ?? false,
    effectiveUserDefault,
    'ephemeral' as MessageVisibility
  )

  return {
    visibility: effectiveVisibility,
    isEphemeral: effectiveVisibility === 'ephemeral',
  }
}
