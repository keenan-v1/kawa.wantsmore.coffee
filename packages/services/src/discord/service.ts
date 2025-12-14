// Discord Service - Handles all Discord API interactions
import { settingsService } from '../settings/index.js'
import type { DiscordRole, DiscordTestConnectionResponse } from '@kawakawa/types'

const DISCORD_API_BASE = 'https://discord.com/api/v10'
const DISCORD_CDN_BASE = 'https://cdn.discordapp.com'

// Settings keys
export const DISCORD_SETTINGS_KEYS = {
  CLIENT_ID: 'discord.clientId',
  CLIENT_SECRET: 'discord.clientSecret',
  BOT_TOKEN: 'discord.botToken',
  GUILD_ID: 'discord.guildId',
  GUILD_NAME: 'discord.guildName',
  GUILD_ICON: 'discord.guildIcon',
  AUTO_APPROVAL_ENABLED: 'discord.autoApprovalEnabled',
  REDIRECT_URI: 'discord.redirectUri',
  WEB_URL: 'app.webUrl', // Web application URL for password reset links, etc.
} as const

// OAuth2 scopes required
const OAUTH2_SCOPES = ['identify', 'guilds.members.read']

// Discord API response types
interface DiscordTokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
  scope: string
}

interface DiscordUserResponse {
  id: string
  username: string
  discriminator: string
  avatar: string | null
  global_name: string | null
}

interface DiscordGuildResponse {
  id: string
  name: string
  icon: string | null
  approximate_member_count?: number
}

interface DiscordGuildMemberResponse {
  user?: DiscordUserResponse
  nick: string | null
  avatar: string | null
  roles: string[] // Array of role IDs
  joined_at: string
}

interface DiscordRoleResponse {
  id: string
  name: string
  color: number
  position: number
  managed: boolean
  mentionable: boolean
}

/**
 * Get Discord settings from database
 */
export async function getDiscordSettings(): Promise<{
  clientId: string | null
  clientSecret: string | null
  botToken: string | null
  guildId: string | null
  guildName: string | null
  guildIcon: string | null
  autoApprovalEnabled: boolean
  redirectUri: string | null
  webUrl: string | null
}> {
  // Get both discord.* and app.* settings
  const discordSettings = await settingsService.getAll('discord.')
  const appSettings = await settingsService.getAll('app.')

  return {
    clientId: discordSettings[DISCORD_SETTINGS_KEYS.CLIENT_ID] || null,
    clientSecret: discordSettings[DISCORD_SETTINGS_KEYS.CLIENT_SECRET] || null,
    botToken: discordSettings[DISCORD_SETTINGS_KEYS.BOT_TOKEN] || null,
    guildId: discordSettings[DISCORD_SETTINGS_KEYS.GUILD_ID] || null,
    guildName: discordSettings[DISCORD_SETTINGS_KEYS.GUILD_NAME] || null,
    guildIcon: discordSettings[DISCORD_SETTINGS_KEYS.GUILD_ICON] || null,
    autoApprovalEnabled: discordSettings[DISCORD_SETTINGS_KEYS.AUTO_APPROVAL_ENABLED] === 'true',
    redirectUri:
      discordSettings[DISCORD_SETTINGS_KEYS.REDIRECT_URI] ||
      process.env.DISCORD_REDIRECT_URI ||
      null,
    webUrl: appSettings[DISCORD_SETTINGS_KEYS.WEB_URL] || null,
  }
}

/**
 * Generate Discord OAuth2 authorization URL
 * @param state - CSRF protection state token
 * @param prompt - OAuth2 prompt parameter: 'none' to skip consent for returning users, 'consent' to always show, undefined to let Discord decide
 * @returns Authorization URL to redirect user to
 */
export async function getAuthorizationUrl(
  state: string,
  prompt?: 'none' | 'consent'
): Promise<string> {
  const settings = await getDiscordSettings()

  if (!settings.clientId) {
    throw new Error('Discord client ID not configured')
  }

  if (!settings.redirectUri) {
    throw new Error('Discord redirect URI not configured')
  }

  const params = new URLSearchParams({
    client_id: settings.clientId,
    redirect_uri: settings.redirectUri,
    response_type: 'code',
    scope: OAUTH2_SCOPES.join(' '),
    state,
  })

  // Add prompt parameter if specified
  // 'none' - skip consent for returning users (fails if user hasn't authorized before)
  // 'consent' - always show consent screen
  if (prompt) {
    params.set('prompt', prompt)
  }

  return `https://discord.com/oauth2/authorize?${params.toString()}`
}

/**
 * Exchange authorization code for tokens
 * @param code - Authorization code from OAuth callback
 * @returns Token response with access_token, refresh_token, etc.
 */
export async function exchangeCodeForTokens(code: string): Promise<{
  accessToken: string
  refreshToken: string
  expiresAt: Date
}> {
  const settings = await getDiscordSettings()

  if (!settings.clientId || !settings.clientSecret || !settings.redirectUri) {
    throw new Error('Discord OAuth not fully configured')
  }

  const response = await fetch(`${DISCORD_API_BASE}/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: settings.clientId,
      client_secret: settings.clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: settings.redirectUri,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Discord token exchange failed: ${error}`)
  }

  const data = (await response.json()) as DiscordTokenResponse
  const expiresAt = new Date(Date.now() + data.expires_in * 1000)

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt,
  }
}

/**
 * Refresh an expired access token
 * @param refreshToken - The refresh token from initial authorization
 * @returns New token response
 */
export async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string
  refreshToken: string
  expiresAt: Date
}> {
  const settings = await getDiscordSettings()

  if (!settings.clientId || !settings.clientSecret) {
    throw new Error('Discord OAuth not fully configured')
  }

  const response = await fetch(`${DISCORD_API_BASE}/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: settings.clientId,
      client_secret: settings.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Discord token refresh failed: ${error}`)
  }

  const data = (await response.json()) as DiscordTokenResponse
  const expiresAt = new Date(Date.now() + data.expires_in * 1000)

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt,
  }
}

/**
 * Get current user info using OAuth2 access token
 * @param accessToken - User's OAuth2 access token
 * @returns Discord user profile
 */
export async function getCurrentUser(accessToken: string): Promise<{
  id: string
  username: string
  avatar: string | null
}> {
  const response = await fetch(`${DISCORD_API_BASE}/users/@me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Discord user fetch failed: ${error}`)
  }

  const data = (await response.json()) as DiscordUserResponse

  return {
    id: data.id,
    username: data.username, // The actual Discord handle (e.g., "fuzzylittledevil"), not global_name (display name)
    avatar: data.avatar,
  }
}

/**
 * Get user's guild membership info using OAuth2 access token
 * Requires guilds.members.read scope
 * @param accessToken - User's OAuth2 access token
 * @param guildId - Guild ID to check membership in
 * @returns Guild member info or null if not a member
 */
export async function getUserGuildMember(
  accessToken: string,
  guildId: string
): Promise<{
  roles: string[]
  joinedAt: string
} | null> {
  const response = await fetch(`${DISCORD_API_BASE}/users/@me/guilds/${guildId}/member`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (response.status === 404) {
    // User is not a member of this guild
    return null
  }

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Discord guild member fetch failed: ${error}`)
  }

  const data = (await response.json()) as DiscordGuildMemberResponse

  return {
    roles: data.roles,
    joinedAt: data.joined_at,
  }
}

// ==================== BOT TOKEN API ====================

/**
 * Get guild info using bot token
 * @param guildId - Guild ID to fetch
 * @returns Guild info or null if bot is not in guild
 */
export async function getGuild(guildId: string): Promise<{
  id: string
  name: string
  icon: string | null
  memberCount?: number
} | null> {
  const settings = await getDiscordSettings()

  if (!settings.botToken) {
    throw new Error('Discord bot token not configured')
  }

  const response = await fetch(`${DISCORD_API_BASE}/guilds/${guildId}?with_counts=true`, {
    headers: {
      Authorization: `Bot ${settings.botToken}`,
    },
  })

  if (response.status === 404 || response.status === 403) {
    // Bot is not in this guild or guild doesn't exist
    return null
  }

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Discord guild fetch failed: ${error}`)
  }

  const data = (await response.json()) as DiscordGuildResponse

  return {
    id: data.id,
    name: data.name,
    icon: data.icon,
    memberCount: data.approximate_member_count,
  }
}

/**
 * Get all roles in a guild using bot token
 * @param guildId - Guild ID to fetch roles from
 * @returns Array of Discord roles
 */
export async function getGuildRoles(guildId: string): Promise<DiscordRole[]> {
  const settings = await getDiscordSettings()

  if (!settings.botToken) {
    throw new Error('Discord bot token not configured')
  }

  const response = await fetch(`${DISCORD_API_BASE}/guilds/${guildId}/roles`, {
    headers: {
      Authorization: `Bot ${settings.botToken}`,
    },
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Discord roles fetch failed: ${error}`)
  }

  const data = (await response.json()) as DiscordRoleResponse[]

  return data.map(role => ({
    id: role.id,
    name: role.name,
    color: role.color,
    position: role.position,
    managed: role.managed,
  }))
}

// Discord channel types
const CHANNEL_TYPE_TEXT = 0

interface DiscordChannelResponse {
  id: string
  name: string
  type: number
  position: number
  parent_id: string | null
}

/**
 * Get all text channels in a guild using bot token
 * @param guildId - Guild ID to fetch channels from
 * @returns Array of text channels with id and name
 */
export async function getGuildChannels(
  guildId: string
): Promise<Array<{ id: string; name: string }>> {
  const settings = await getDiscordSettings()

  if (!settings.botToken) {
    throw new Error('Discord bot token not configured')
  }

  const response = await fetch(`${DISCORD_API_BASE}/guilds/${guildId}/channels`, {
    headers: {
      Authorization: `Bot ${settings.botToken}`,
    },
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Discord channels fetch failed: ${error}`)
  }

  const data = (await response.json()) as DiscordChannelResponse[]

  // Filter to only text channels and sort by position
  return data
    .filter(channel => channel.type === CHANNEL_TYPE_TEXT)
    .sort((a, b) => a.position - b.position)
    .map(channel => ({
      id: channel.id,
      name: channel.name,
    }))
}

/**
 * Test Discord connection with current settings
 * @returns Test result with guild info if successful
 */
export async function testConnection(): Promise<DiscordTestConnectionResponse> {
  const settings = await getDiscordSettings()

  if (!settings.botToken) {
    return {
      success: false,
      error: 'Bot token not configured',
    }
  }

  if (!settings.guildId) {
    return {
      success: false,
      error: 'Guild ID not configured',
    }
  }

  try {
    const guild = await getGuild(settings.guildId)

    if (!guild) {
      return {
        success: false,
        error: 'Bot is not a member of the specified guild',
      }
    }

    return {
      success: true,
      guild: {
        id: guild.id,
        name: guild.name,
        icon: guild.icon,
        memberCount: guild.memberCount,
      },
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Get Discord CDN URL for guild icon
 * @param guildId - Guild ID
 * @param iconHash - Icon hash from guild info
 * @param size - Image size (default 128)
 * @returns CDN URL or null if no icon
 */
export function getGuildIconUrl(
  guildId: string,
  iconHash: string | null,
  size: number = 128
): string | null {
  if (!iconHash) return null
  const extension = iconHash.startsWith('a_') ? 'gif' : 'png'
  return `${DISCORD_CDN_BASE}/icons/${guildId}/${iconHash}.${extension}?size=${size}`
}

/**
 * Get Discord CDN URL for user avatar
 * @param userId - Discord user ID
 * @param avatarHash - Avatar hash from user info
 * @param size - Image size (default 128)
 * @returns CDN URL or null if no avatar
 */
export function getUserAvatarUrl(
  userId: string,
  avatarHash: string | null,
  size: number = 128
): string | null {
  if (!avatarHash) return null
  const extension = avatarHash.startsWith('a_') ? 'gif' : 'png'
  return `${DISCORD_CDN_BASE}/avatars/${userId}/${avatarHash}.${extension}?size=${size}`
}

// Export as namespace
export const discordService = {
  getDiscordSettings,
  getAuthorizationUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  getCurrentUser,
  getUserGuildMember,
  getGuild,
  getGuildRoles,
  getGuildChannels,
  testConnection,
  getGuildIconUrl,
  getUserAvatarUrl,
  SETTINGS_KEYS: DISCORD_SETTINGS_KEYS,
}

export default discordService
