import { settingsService } from '@kawakawa/services/settings'

export interface BotConfig {
  token: string
  clientId: string
  guildId: string | null
}

let cachedConfig: BotConfig | null = null
let cachedWebUrl: string | null = null

// Default web URL for development
const DEFAULT_WEB_URL = 'http://localhost:5173'

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
 * Get the web application URL for generating links.
 * Reads from app.webUrl setting, falls back to default for development.
 */
export async function getWebUrl(): Promise<string> {
  if (cachedWebUrl) {
    return cachedWebUrl
  }

  const settings = await settingsService.getAll('app.')
  cachedWebUrl = settings['app.webUrl'] || DEFAULT_WEB_URL

  return cachedWebUrl
}

/**
 * Invalidate cached configuration.
 * Call this when settings are updated.
 */
export function invalidateConfig(): void {
  cachedConfig = null
  cachedWebUrl = null
}
