import { settingsService } from '@kawakawa/services/settings'

export interface BotConfig {
  token: string
  clientId: string
  guildId: string | null
}

let cachedConfig: BotConfig | null = null

/**
 * Get bot configuration from database settings.
 * Caches the result until invalidateConfig() is called.
 */
export async function getConfig(): Promise<BotConfig> {
  if (cachedConfig) {
    return cachedConfig
  }

  const settings = await settingsService.getAll('discord.')

  const token = settings['discord.botToken']
  const clientId = settings['discord.clientId']
  const guildId = settings['discord.guildId'] || null

  if (!token) {
    throw new Error('Discord bot token not configured. Set discord.botToken in Admin Panel.')
  }

  if (!clientId) {
    throw new Error('Discord client ID not configured. Set discord.clientId in Admin Panel.')
  }

  cachedConfig = { token, clientId, guildId }
  return cachedConfig
}

/**
 * Invalidate cached configuration.
 * Call this when settings are updated.
 */
export function invalidateConfig(): void {
  cachedConfig = null
}
