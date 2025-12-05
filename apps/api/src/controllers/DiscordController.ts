import { Body, Controller, Get, Post, Delete, Route, Security, Tags, Request } from 'tsoa'
import type {
  DiscordConnectionStatus,
  DiscordCallbackRequest,
  UserDiscordProfile,
} from '@kawakawa/types'
import { db, userDiscordProfiles, discordRoleMappings, userRoles } from '../db/index.js'
import { eq, desc, inArray } from 'drizzle-orm'
import type { JwtPayload } from '../utils/jwt.js'
import { BadRequest } from '../utils/errors.js'
import { discordService, DISCORD_SETTINGS_KEYS } from '../services/discordService.js'
import { settingsService } from '../services/settingsService.js'
import crypto from 'crypto'

// In-memory store for OAuth state tokens (in production, use Redis or similar)
const stateTokens = new Map<string, { userId: number; expiresAt: Date }>()

// Clean up expired state tokens periodically
setInterval(
  () => {
    const now = new Date()
    for (const [key, value] of stateTokens.entries()) {
      if (value.expiresAt < now) {
        stateTokens.delete(key)
      }
    }
  },
  5 * 60 * 1000
) // Every 5 minutes

@Route('discord')
@Tags('Discord')
@Security('jwt')
export class DiscordController extends Controller {
  /**
   * Get Discord authorization URL
   * Returns a URL to redirect the user to for Discord OAuth
   */
  @Get('auth-url')
  public async getAuthUrl(
    @Request() request: { user: JwtPayload }
  ): Promise<{ url: string; state: string }> {
    const userId = request.user.userId

    // Generate secure state token for CSRF protection
    const state = crypto.randomBytes(32).toString('hex')

    // Store state with user ID and expiration (10 minutes)
    stateTokens.set(state, {
      userId,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    })

    const url = await discordService.getAuthorizationUrl(state)

    return { url, state }
  }

  /**
   * Handle Discord OAuth callback
   * Exchanges the authorization code for tokens and links the Discord account
   */
  @Post('callback')
  public async handleCallback(
    @Body() body: DiscordCallbackRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<{ success: boolean; profile: UserDiscordProfile }> {
    const { code, state } = body
    const userId = request.user.userId

    // Validate state token
    const storedState = stateTokens.get(state)
    if (!storedState) {
      throw BadRequest('Invalid or expired state token')
    }

    if (storedState.userId !== userId) {
      throw BadRequest('State token does not match current user')
    }

    if (storedState.expiresAt < new Date()) {
      stateTokens.delete(state)
      throw BadRequest('State token has expired')
    }

    // Remove used state token
    stateTokens.delete(state)

    // Exchange code for tokens
    const tokens = await discordService.exchangeCodeForTokens(code)

    // Get Discord user info
    const discordUser = await discordService.getCurrentUser(tokens.accessToken)

    // Check if this Discord account is already linked to another user
    const [existingLink] = await db
      .select()
      .from(userDiscordProfiles)
      .where(eq(userDiscordProfiles.discordId, discordUser.id))

    if (existingLink && existingLink.userId !== userId) {
      throw BadRequest('This Discord account is already linked to another user')
    }

    // Check if user already has a Discord profile
    const [existingProfile] = await db
      .select()
      .from(userDiscordProfiles)
      .where(eq(userDiscordProfiles.userId, userId))

    const now = new Date()

    if (existingProfile) {
      // Update existing profile
      await db
        .update(userDiscordProfiles)
        .set({
          discordId: discordUser.id,
          discordUsername: discordUser.username,
          discordAvatar: discordUser.avatar,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          tokenExpiresAt: tokens.expiresAt,
          updatedAt: now,
        })
        .where(eq(userDiscordProfiles.userId, userId))
    } else {
      // Create new profile
      await db.insert(userDiscordProfiles).values({
        userId,
        discordId: discordUser.id,
        discordUsername: discordUser.username,
        discordAvatar: discordUser.avatar,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresAt: tokens.expiresAt,
        connectedAt: now,
      })
    }

    // Check for auto-approval
    await this.checkAutoApproval(userId, tokens.accessToken)

    return {
      success: true,
      profile: {
        discordId: discordUser.id,
        discordUsername: discordUser.username,
        discordAvatar: discordUser.avatar,
        connectedAt: (existingProfile?.connectedAt || now).toISOString(),
      },
    }
  }

  /**
   * Get current user's Discord connection status
   */
  @Get('status')
  public async getConnectionStatus(
    @Request() request: { user: JwtPayload }
  ): Promise<DiscordConnectionStatus> {
    const userId = request.user.userId

    const [profile] = await db
      .select()
      .from(userDiscordProfiles)
      .where(eq(userDiscordProfiles.userId, userId))

    if (!profile) {
      return {
        connected: false,
        profile: null,
        isMemberOfGuild: null,
        guildRoles: null,
      }
    }

    // Check guild membership if configured
    const settings = await discordService.getDiscordSettings()
    let isMemberOfGuild: boolean | null = null
    let guildRoles: string[] | null = null

    if (settings.guildId && profile.accessToken) {
      try {
        // Refresh token if expired
        let accessToken = profile.accessToken
        if (profile.tokenExpiresAt && profile.tokenExpiresAt < new Date()) {
          if (profile.refreshToken) {
            const refreshed = await discordService.refreshAccessToken(profile.refreshToken)
            accessToken = refreshed.accessToken

            // Update stored tokens
            await db
              .update(userDiscordProfiles)
              .set({
                accessToken: refreshed.accessToken,
                refreshToken: refreshed.refreshToken,
                tokenExpiresAt: refreshed.expiresAt,
                updatedAt: new Date(),
              })
              .where(eq(userDiscordProfiles.userId, userId))
          }
        }

        const member = await discordService.getUserGuildMember(accessToken, settings.guildId)
        isMemberOfGuild = member !== null
        guildRoles = member?.roles || null
      } catch {
        // If we can't check membership, leave as null
      }
    }

    return {
      connected: true,
      profile: {
        discordId: profile.discordId,
        discordUsername: profile.discordUsername,
        discordAvatar: profile.discordAvatar,
        connectedAt: profile.connectedAt.toISOString(),
      },
      isMemberOfGuild,
      guildRoles,
    }
  }

  /**
   * Disconnect Discord from current user's account
   */
  @Delete('connection')
  public async disconnect(@Request() request: { user: JwtPayload }): Promise<void> {
    const userId = request.user.userId

    const [profile] = await db
      .select()
      .from(userDiscordProfiles)
      .where(eq(userDiscordProfiles.userId, userId))

    if (!profile) {
      throw BadRequest('Discord is not connected to this account')
    }

    await db.delete(userDiscordProfiles).where(eq(userDiscordProfiles.userId, userId))

    this.setStatus(204)
  }

  /**
   * Sync Discord roles for current user
   * Checks Discord guild membership and assigns any matching app roles
   */
  @Post('sync-roles')
  public async syncRoles(
    @Request() request: { user: JwtPayload }
  ): Promise<{ synced: boolean; rolesAdded: string[] }> {
    const userId = request.user.userId

    const [profile] = await db
      .select()
      .from(userDiscordProfiles)
      .where(eq(userDiscordProfiles.userId, userId))

    if (!profile) {
      throw BadRequest('Discord is not connected to this account')
    }

    const settings = await discordService.getDiscordSettings()
    if (!settings.guildId) {
      throw BadRequest('Discord guild is not configured')
    }

    // Refresh token if expired
    let accessToken = profile.accessToken
    if (profile.tokenExpiresAt && profile.tokenExpiresAt < new Date()) {
      if (!profile.refreshToken) {
        throw BadRequest('Discord token expired. Please reconnect your Discord account.')
      }
      const refreshed = await discordService.refreshAccessToken(profile.refreshToken)
      accessToken = refreshed.accessToken

      // Update stored tokens
      await db
        .update(userDiscordProfiles)
        .set({
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken,
          tokenExpiresAt: refreshed.expiresAt,
          updatedAt: new Date(),
        })
        .where(eq(userDiscordProfiles.userId, userId))
    }

    // Get user's Discord guild membership
    const member = await discordService.getUserGuildMember(accessToken, settings.guildId)
    if (!member) {
      throw BadRequest('You are not a member of the Discord server')
    }

    // Get current user roles
    const currentRoles = await db
      .select({ roleId: userRoles.roleId })
      .from(userRoles)
      .where(eq(userRoles.userId, userId))
    const currentRoleIds = new Set(currentRoles.map(r => r.roleId))

    // Get role mappings
    const mappings = await db.select().from(discordRoleMappings)

    // Find all matching roles to add
    const rolesToAdd = new Set<string>()
    for (const mapping of mappings) {
      if (member.roles.includes(mapping.discordRoleId) && !currentRoleIds.has(mapping.appRoleId)) {
        rolesToAdd.add(mapping.appRoleId)
      }
    }

    // Add new roles
    if (rolesToAdd.size > 0) {
      await db.insert(userRoles).values(
        Array.from(rolesToAdd).map(roleId => ({
          userId,
          roleId,
        }))
      )
    }

    return {
      synced: true,
      rolesAdded: Array.from(rolesToAdd),
    }
  }

  /**
   * Check if user qualifies for auto-approval based on Discord roles
   * Assigns ALL matching roles, replacing the 'unverified' role
   */
  private async checkAutoApproval(userId: number, accessToken: string): Promise<void> {
    const settings = await discordService.getDiscordSettings()

    // Check if auto-approval is enabled and guild is configured
    if (!settings.autoApprovalEnabled || !settings.guildId) {
      return
    }

    // Check if user has 'unverified' role (only auto-approve unverified users)
    const currentRoles = await db
      .select({ roleId: userRoles.roleId })
      .from(userRoles)
      .where(eq(userRoles.userId, userId))

    const roleIds = currentRoles.map(r => r.roleId)
    if (!roleIds.includes('unverified')) {
      // User is already verified, don't change their role
      return
    }

    // Get user's Discord guild membership
    const member = await discordService.getUserGuildMember(accessToken, settings.guildId)
    if (!member) {
      // User is not a member of the guild
      return
    }

    // Get role mappings
    const mappings = await db.select().from(discordRoleMappings)

    // Find ALL matching roles to assign
    const rolesToAssign = new Set<string>()
    for (const mapping of mappings) {
      if (member.roles.includes(mapping.discordRoleId)) {
        rolesToAssign.add(mapping.appRoleId)
      }
    }

    // If we found matching roles, replace 'unverified' with them
    if (rolesToAssign.size > 0) {
      // Remove 'unverified' role
      await db.delete(userRoles).where(eq(userRoles.userId, userId))

      // Add all matched roles
      await db.insert(userRoles).values(
        Array.from(rolesToAssign).map(roleId => ({
          userId,
          roleId,
        }))
      )
    }
  }
}
