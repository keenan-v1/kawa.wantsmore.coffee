import { Body, Controller, Get, Post, Route, Tags, Query } from 'tsoa'
import type {
  DiscordAuthUrlResponse,
  DiscordAuthResult,
  DiscordRegisterRequest,
  DiscordRegisterResponse,
  Role,
} from '@kawakawa/types'
import {
  db,
  users,
  userDiscordProfiles,
  userRoles,
  roles,
  userSettings,
  discordRoleMappings,
} from '../db/index.js'
import { eq, desc } from 'drizzle-orm'
import { BadRequest } from '../utils/errors.js'
import { discordService } from '../services/discordService.js'
import { generateToken } from '../utils/jwt.js'
import { getPermissions } from '../utils/permissionService.js'
import { createLogger } from '../utils/logger.js'
import crypto from 'crypto'

const log = createLogger({ controller: 'DiscordAuth' })

// Store for pending Discord auth flows (state -> Discord profile data)
// In production, use Redis or similar
interface PendingDiscordAuth {
  discordId: string
  discordUsername: string
  discordAvatar: string | null
  accessToken: string
  refreshToken: string
  tokenExpiresAt: Date
  expiresAt: Date
}

const pendingDiscordAuth = new Map<string, PendingDiscordAuth>()

// Clean up expired pending auth entries periodically
setInterval(
  () => {
    const now = new Date()
    for (const [key, value] of pendingDiscordAuth.entries()) {
      if (value.expiresAt < now) {
        pendingDiscordAuth.delete(key)
      }
    }
  },
  5 * 60 * 1000
) // Every 5 minutes

@Route('auth/discord')
@Tags('Discord Authentication')
export class DiscordAuthController extends Controller {
  /**
   * Get Discord OAuth authorization URL for login/registration
   * This endpoint does NOT require authentication
   * @param prompt - Optional prompt parameter: 'none' to skip consent for returning users (login), 'consent' to always show
   */
  @Get('auth-url')
  public async getAuthUrl(@Query() prompt?: 'none' | 'consent'): Promise<DiscordAuthUrlResponse> {
    // Generate secure state token
    const state = crypto.randomBytes(32).toString('hex')

    const url = await discordService.getAuthorizationUrl(state, prompt)

    return { url, state }
  }

  /**
   * Handle Discord OAuth callback for login/registration
   * Returns different result types based on the situation:
   * - login: User has linked Discord, returns JWT token
   * - register_required: New Discord user, needs to complete registration
   * - account_exists_no_discord: User exists but hasn't linked Discord
   * - consent_required: prompt=none was used but user hasn't authorized before
   * - error: Something went wrong
   */
  @Get('callback')
  public async handleCallback(
    @Query() code?: string,
    @Query() state?: string,
    @Query() error?: string,
    @Query() error_description?: string
  ): Promise<DiscordAuthResult> {
    // Handle OAuth errors (e.g., from prompt=none when user hasn't authorized)
    if (error) {
      if (error === 'consent_required' || error === 'interaction_required') {
        // User hasn't authorized before, need to show consent screen
        return { type: 'consent_required', message: 'Authorization required' }
      }
      if (error === 'access_denied') {
        return { type: 'error', message: 'Discord authorization was denied' }
      }
      return {
        type: 'error',
        message: error_description || `Discord OAuth error: ${error}`,
      }
    }

    if (!code || !state) {
      return { type: 'error', message: 'Missing code or state parameter' }
    }

    try {
      // Exchange code for tokens
      const tokens = await discordService.exchangeCodeForTokens(code)

      // Get Discord user info
      const discordUser = await discordService.getCurrentUser(tokens.accessToken)

      // Check if this Discord account is already linked to a user
      const [existingProfile] = await db
        .select()
        .from(userDiscordProfiles)
        .where(eq(userDiscordProfiles.discordId, discordUser.id))

      if (existingProfile) {
        // Discord is linked - log them in
        const user = await this.getUserById(existingProfile.userId)
        if (!user) {
          return { type: 'error', message: 'User account not found' }
        }

        // Check if user is active
        if (!user.isActive) {
          return { type: 'error', message: 'Account is inactive. Please contact an administrator.' }
        }

        // Update stored tokens
        await db
          .update(userDiscordProfiles)
          .set({
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            tokenExpiresAt: tokens.expiresAt,
            updatedAt: new Date(),
          })
          .where(eq(userDiscordProfiles.id, existingProfile.id))

        // Generate JWT and return login response
        const authResponse = await this.createAuthResponse(user)
        return { type: 'login', ...authResponse }
      }

      // Discord not linked - check if there's a user with matching username
      // This helps detect users who should use password login instead
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.username, discordUser.username))
        .limit(1)

      if (existingUser) {
        // User exists but hasn't connected Discord
        return {
          type: 'account_exists_no_discord',
          username: existingUser.username,
        }
      }

      // New user - store Discord data and return register_required
      const registrationState = crypto.randomBytes(32).toString('hex')
      pendingDiscordAuth.set(registrationState, {
        discordId: discordUser.id,
        discordUsername: discordUser.username,
        discordAvatar: discordUser.avatar,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresAt: tokens.expiresAt,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
      })

      return {
        type: 'register_required',
        discordProfile: {
          discordId: discordUser.id,
          discordUsername: discordUser.username,
          discordAvatar: discordUser.avatar,
        },
        state: registrationState,
      }
    } catch (error) {
      log.error({ err: error }, 'Discord auth callback error')
      return {
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to authenticate with Discord',
      }
    }
  }

  /**
   * Complete Discord registration
   * Creates a new user account linked to Discord
   */
  @Post('register')
  public async completeRegistration(
    @Body() body: DiscordRegisterRequest
  ): Promise<DiscordRegisterResponse> {
    const { state, username: customUsername, displayName, email } = body

    // Retrieve pending Discord auth data
    const pendingAuth = pendingDiscordAuth.get(state)
    if (!pendingAuth) {
      throw BadRequest('Invalid or expired registration state. Please start over.')
    }

    if (pendingAuth.expiresAt < new Date()) {
      pendingDiscordAuth.delete(state)
      throw BadRequest('Registration session has expired. Please start over.')
    }

    // Validate displayName
    if (!displayName || displayName.trim().length === 0) {
      throw BadRequest('Display name is required')
    }

    // Check if Discord is still not linked (race condition protection)
    const [existingDiscordProfile] = await db
      .select()
      .from(userDiscordProfiles)
      .where(eq(userDiscordProfiles.discordId, pendingAuth.discordId))

    if (existingDiscordProfile) {
      pendingDiscordAuth.delete(state)
      throw BadRequest('This Discord account is already linked to another user')
    }

    // Use custom username if provided, otherwise fall back to Discord username
    const username = customUsername?.trim() || pendingAuth.discordUsername

    // Validate username
    if (username.length < 3) {
      throw BadRequest('Username must be at least 3 characters')
    }
    if (username.length > 50) {
      throw BadRequest('Username must be 50 characters or less')
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      throw BadRequest('Username can only contain letters, numbers, underscores, and hyphens')
    }

    // Check if username already exists
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1)

    if (existingUser) {
      pendingDiscordAuth.delete(state)
      throw BadRequest(
        `Username "${username}" is already taken. Please log in with your password and connect Discord from your profile settings.`
      )
    }

    // Create user (no password since they're using Discord)
    const [newUser] = await db
      .insert(users)
      .values({
        username,
        email: email || null,
        displayName: displayName.trim(),
        passwordHash: '', // Empty password - can only auth via Discord until they set one
        isActive: true,
      })
      .returning()

    // Create default user settings
    await db.insert(userSettings).values({
      userId: newUser.id,
    })

    // Link Discord account
    await db.insert(userDiscordProfiles).values({
      userId: newUser.id,
      discordId: pendingAuth.discordId,
      discordUsername: pendingAuth.discordUsername,
      discordAvatar: pendingAuth.discordAvatar,
      accessToken: pendingAuth.accessToken,
      refreshToken: pendingAuth.refreshToken,
      tokenExpiresAt: pendingAuth.tokenExpiresAt,
      connectedAt: new Date(),
    })

    // Check for auto-approval based on Discord roles
    const assignedRoleId = await this.checkAutoApprovalAndAssignRole(
      newUser.id,
      pendingAuth.accessToken
    )

    // If no auto-approval, assign default 'unverified' role
    if (!assignedRoleId) {
      await db.insert(userRoles).values({
        userId: newUser.id,
        roleId: 'unverified',
      })
    }

    // Clean up pending auth
    pendingDiscordAuth.delete(state)

    // Generate auth response
    const user = await this.getUserById(newUser.id)
    if (!user) {
      throw BadRequest('Failed to create user account')
    }

    const authResponse = await this.createAuthResponse(user)

    this.setStatus(201)
    return {
      ...authResponse,
      needsProfileCompletion: false, // They just completed it
    }
  }

  /**
   * Check if user qualifies for auto-approval based on Discord roles
   * Assigns ALL matching roles, returns the highest priority one if any were assigned
   */
  private async checkAutoApprovalAndAssignRole(
    userId: number,
    accessToken: string
  ): Promise<string | null> {
    try {
      const settings = await discordService.getDiscordSettings()

      // Check if auto-approval is enabled and guild is configured
      if (!settings.autoApprovalEnabled || !settings.guildId) {
        return null
      }

      // Get user's Discord guild membership
      const member = await discordService.getUserGuildMember(accessToken, settings.guildId)
      if (!member) {
        return null
      }

      // Get role mappings ordered by priority (highest first)
      const mappings = await db
        .select()
        .from(discordRoleMappings)
        .orderBy(desc(discordRoleMappings.priority))

      // Find ALL matching mappings and collect unique app roles to assign
      const rolesToAssign = new Set<string>()
      let highestPriorityRole: string | null = null

      for (const mapping of mappings) {
        if (member.roles.includes(mapping.discordRoleId)) {
          // Track the highest priority role (first match since ordered by priority desc)
          if (!highestPriorityRole) {
            highestPriorityRole = mapping.appRoleId
          }
          rolesToAssign.add(mapping.appRoleId)
        }
      }

      // Assign all matched roles
      if (rolesToAssign.size > 0) {
        await db.insert(userRoles).values(
          Array.from(rolesToAssign).map(roleId => ({
            userId,
            roleId,
          }))
        )
      }

      return highestPriorityRole
    } catch (error) {
      log.error({ err: error }, 'Auto-approval check failed')
      return null
    }
  }

  private async getUserById(userId: number) {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
    return user
  }

  private async createAuthResponse(user: {
    id: number
    username: string
    displayName: string
    email: string | null
  }): Promise<{
    token: string
    user: {
      id: number
      username: string
      displayName: string
      email?: string
      roles: Role[]
      permissions: string[]
    }
  }> {
    // Get user roles with names and colors
    const userRolesData = await db
      .select({
        roleId: roles.id,
        roleName: roles.name,
        roleColor: roles.color,
      })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, user.id))

    const roleIds = userRolesData.map(r => r.roleId)
    const roleObjects: Role[] = userRolesData.map(r => ({
      id: r.roleId,
      name: r.roleName,
      color: r.roleColor,
    }))

    // Get permissions for these roles
    const permissionsMap = await getPermissions(roleIds)
    const permissionIds = Array.from(permissionsMap.entries())
      .filter(([, allowed]) => allowed)
      .map(([id]) => id)

    // Generate JWT token
    const token = generateToken({
      userId: user.id,
      username: user.username,
      roles: roleIds,
    })

    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        email: user.email || undefined,
        roles: roleObjects,
        permissions: permissionIds,
      },
    }
  }
}
