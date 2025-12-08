import {
  Body,
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Path,
  Route,
  Security,
  Tags,
  Request,
} from 'tsoa'
import type {
  DiscordSettings,
  UpdateDiscordSettingsRequest,
  DiscordRoleMapping,
  DiscordRoleMappingRequest,
  DiscordRole,
  DiscordTestConnectionResponse,
  SettingHistoryEntry,
} from '@kawakawa/types'
import { db, discordRoleMappings, roles } from '../db/index.js'
import { eq, desc } from 'drizzle-orm'
import type { JwtPayload } from '../utils/jwt.js'
import { NotFound, BadRequest } from '../utils/errors.js'
import { settingsService } from '../services/settingsService.js'
import { discordService, DISCORD_SETTINGS_KEYS } from '../services/discordService.js'

@Route('admin/discord')
@Tags('Admin Discord')
@Security('jwt', ['admin.manage_users'])
export class AdminDiscordController extends Controller {
  /**
   * Get current Discord settings
   * Secrets are masked (only returns hasClientSecret, hasBotToken booleans)
   */
  @Get('settings')
  public async getSettings(): Promise<DiscordSettings> {
    const settings = await discordService.getDiscordSettings()

    return {
      clientId: settings.clientId || '',
      hasClientSecret: !!settings.clientSecret,
      hasBotToken: !!settings.botToken,
      redirectUri: settings.redirectUri,
      guildId: settings.guildId,
      guildName: settings.guildName,
      guildIcon: settings.guildIcon,
      autoApprovalEnabled: settings.autoApprovalEnabled,
    }
  }

  /**
   * Update Discord settings
   * Can update any combination of settings
   */
  @Put('settings')
  public async updateSettings(
    @Body() body: UpdateDiscordSettingsRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<DiscordSettings> {
    const userId = request.user.userId
    const updates: Record<string, string> = {}

    if (body.clientId !== undefined) {
      updates[DISCORD_SETTINGS_KEYS.CLIENT_ID] = body.clientId
    }
    if (body.clientSecret !== undefined) {
      updates[DISCORD_SETTINGS_KEYS.CLIENT_SECRET] = body.clientSecret
    }
    if (body.botToken !== undefined) {
      updates[DISCORD_SETTINGS_KEYS.BOT_TOKEN] = body.botToken
    }
    if (body.redirectUri !== undefined) {
      updates[DISCORD_SETTINGS_KEYS.REDIRECT_URI] = body.redirectUri
    }
    if (body.guildId !== undefined) {
      updates[DISCORD_SETTINGS_KEYS.GUILD_ID] = body.guildId
    }
    if (body.autoApprovalEnabled !== undefined) {
      updates[DISCORD_SETTINGS_KEYS.AUTO_APPROVAL_ENABLED] = String(body.autoApprovalEnabled)
    }

    if (Object.keys(updates).length > 0) {
      await settingsService.setMany(updates, userId)
    }

    // If guild ID was updated, try to fetch and cache guild info
    if (body.guildId) {
      try {
        const guild = await discordService.getGuild(body.guildId)
        if (guild) {
          await settingsService.setMany(
            {
              [DISCORD_SETTINGS_KEYS.GUILD_NAME]: guild.name,
              [DISCORD_SETTINGS_KEYS.GUILD_ICON]: guild.icon || '',
            },
            userId
          )
        }
      } catch {
        // Ignore errors fetching guild info
      }
    }

    return this.getSettings()
  }

  /**
   * Test Discord connection
   * Validates bot token and guild access
   */
  @Post('settings/test-connection')
  public async testConnection(): Promise<DiscordTestConnectionResponse> {
    const result = await discordService.testConnection()

    // If successful, update cached guild info
    if (result.success && result.guild) {
      await settingsService.setMany({
        [DISCORD_SETTINGS_KEYS.GUILD_NAME]: result.guild.name,
        [DISCORD_SETTINGS_KEYS.GUILD_ICON]: result.guild.icon || '',
      })
    }

    return result
  }

  /**
   * Get roles from the configured Discord guild
   * Requires bot token and guild ID to be configured
   */
  @Get('guild/roles')
  public async getGuildRoles(): Promise<DiscordRole[]> {
    const settings = await discordService.getDiscordSettings()

    if (!settings.guildId) {
      throw BadRequest('Guild ID not configured')
    }

    return discordService.getGuildRoles(settings.guildId)
  }

  /**
   * List all Discord role mappings
   */
  @Get('role-mappings')
  public async listRoleMappings(): Promise<DiscordRoleMapping[]> {
    const mappings = await db
      .select({
        id: discordRoleMappings.id,
        discordRoleId: discordRoleMappings.discordRoleId,
        discordRoleName: discordRoleMappings.discordRoleName,
        appRoleId: discordRoleMappings.appRoleId,
        appRoleName: roles.name,
        priority: discordRoleMappings.priority,
      })
      .from(discordRoleMappings)
      .innerJoin(roles, eq(discordRoleMappings.appRoleId, roles.id))
      .orderBy(desc(discordRoleMappings.priority))

    return mappings
  }

  /**
   * Create a new Discord role mapping
   */
  @Post('role-mappings')
  public async createRoleMapping(
    @Body() body: DiscordRoleMappingRequest
  ): Promise<DiscordRoleMapping> {
    // Verify the app role exists
    const [appRole] = await db.select().from(roles).where(eq(roles.id, body.appRoleId))

    if (!appRole) {
      throw NotFound(`Role with ID "${body.appRoleId}" not found`)
    }

    // Check if mapping for this Discord role already exists
    const [existing] = await db
      .select()
      .from(discordRoleMappings)
      .where(eq(discordRoleMappings.discordRoleId, body.discordRoleId))

    if (existing) {
      throw BadRequest(`Mapping for Discord role "${body.discordRoleName}" already exists`)
    }

    const [created] = await db
      .insert(discordRoleMappings)
      .values({
        discordRoleId: body.discordRoleId,
        discordRoleName: body.discordRoleName,
        appRoleId: body.appRoleId,
        priority: body.priority ?? 0,
      })
      .returning()

    return {
      id: created.id,
      discordRoleId: created.discordRoleId,
      discordRoleName: created.discordRoleName,
      appRoleId: created.appRoleId,
      appRoleName: appRole.name,
      priority: created.priority,
    }
  }

  /**
   * Update a Discord role mapping
   */
  @Put('role-mappings/{id}')
  public async updateRoleMapping(
    @Path() id: number,
    @Body() body: DiscordRoleMappingRequest
  ): Promise<DiscordRoleMapping> {
    // Verify the mapping exists
    const [existing] = await db
      .select()
      .from(discordRoleMappings)
      .where(eq(discordRoleMappings.id, id))

    if (!existing) {
      throw NotFound(`Role mapping with ID ${id} not found`)
    }

    // Verify the app role exists
    const [appRole] = await db.select().from(roles).where(eq(roles.id, body.appRoleId))

    if (!appRole) {
      throw NotFound(`Role with ID "${body.appRoleId}" not found`)
    }

    const [updated] = await db
      .update(discordRoleMappings)
      .set({
        discordRoleId: body.discordRoleId,
        discordRoleName: body.discordRoleName,
        appRoleId: body.appRoleId,
        priority: body.priority ?? existing.priority,
        updatedAt: new Date(),
      })
      .where(eq(discordRoleMappings.id, id))
      .returning()

    return {
      id: updated.id,
      discordRoleId: updated.discordRoleId,
      discordRoleName: updated.discordRoleName,
      appRoleId: updated.appRoleId,
      appRoleName: appRole.name,
      priority: updated.priority,
    }
  }

  /**
   * Delete a Discord role mapping
   */
  @Delete('role-mappings/{id}')
  public async deleteRoleMapping(@Path() id: number): Promise<void> {
    const [existing] = await db
      .select()
      .from(discordRoleMappings)
      .where(eq(discordRoleMappings.id, id))

    if (!existing) {
      throw NotFound(`Role mapping with ID ${id} not found`)
    }

    await db.delete(discordRoleMappings).where(eq(discordRoleMappings.id, id))

    this.setStatus(204)
  }

  /**
   * Get settings change history for a specific key
   */
  @Get('settings/history/{key}')
  public async getSettingsHistory(@Path() key: string): Promise<SettingHistoryEntry[]> {
    // Only allow discord.* keys
    if (!key.startsWith('discord.')) {
      throw BadRequest('Can only view history for discord.* settings')
    }

    // Don't expose history for secrets
    if (key === DISCORD_SETTINGS_KEYS.CLIENT_SECRET || key === DISCORD_SETTINGS_KEYS.BOT_TOKEN) {
      throw BadRequest('Cannot view history for secret settings')
    }

    return settingsService.getHistory(key)
  }
}
