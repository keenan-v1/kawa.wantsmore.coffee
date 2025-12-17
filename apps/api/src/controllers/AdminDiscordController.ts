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
  ChannelConfigMap,
  UpdateChannelConfigRequest,
  ChannelConfigKey,
} from '@kawakawa/types'
import { db, discordRoleMappings, roles, channelConfig } from '../db/index.js'
import { eq, desc, asc, and } from 'drizzle-orm'
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
      webUrl: settings.webUrl,
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
    if (body.webUrl !== undefined) {
      updates[DISCORD_SETTINGS_KEYS.WEB_URL] = body.webUrl
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
   * Get text channels from the configured Discord server
   */
  @Get('guild/channels')
  public async getGuildChannels(): Promise<Array<{ id: string; name: string }>> {
    const settings = await discordService.getDiscordSettings()

    if (!settings.guildId) {
      throw BadRequest('Guild ID not configured')
    }

    return discordService.getGuildChannels(settings.guildId)
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

  // ==================== CHANNEL CONFIG ====================

  /**
   * List all configured channels with their full config
   */
  @Get('channel-config')
  public async listChannelConfigs(): Promise<ChannelConfigMap[]> {
    // Get all config rows, ordered by channel ID
    const allRows = await db
      .select({
        channelId: channelConfig.channelId,
        key: channelConfig.key,
        value: channelConfig.value,
      })
      .from(channelConfig)
      .orderBy(asc(channelConfig.channelId))

    // Group by channel ID and build config maps
    const channelMap = new Map<string, ChannelConfigMap>()

    for (const row of allRows) {
      let config = channelMap.get(row.channelId)
      if (!config) {
        config = { channelId: row.channelId }
        channelMap.set(row.channelId, config)
      }

      const key = row.key as ChannelConfigKey
      const value = row.value

      switch (key) {
        case 'visibility':
          config.visibility = value as 'internal' | 'partner'
          break
        case 'priceList':
          config.priceList = value
          break
        case 'currency':
          config.currency = value as 'CIS' | 'ICA' | 'AIC' | 'NCC'
          break
        case 'messageVisibility':
          config.messageVisibility = value as 'ephemeral' | 'public'
          break
        case 'visibilityEnforced':
          config.visibilityEnforced = value === 'true'
          break
        case 'priceListEnforced':
          config.priceListEnforced = value === 'true'
          break
        case 'currencyEnforced':
          config.currencyEnforced = value === 'true'
          break
        case 'messageVisibilityEnforced':
          config.messageVisibilityEnforced = value === 'true'
          break
        case 'announceInternal':
          config.announceInternal = value
          break
        case 'announcePartner':
          config.announcePartner = value
          break
      }
    }

    return Array.from(channelMap.values())
  }

  /**
   * Get all config for a specific channel as a map
   */
  @Get('channel-config/{channelId}')
  public async getChannelConfig(@Path() channelId: string): Promise<ChannelConfigMap> {
    const rows = await db
      .select({
        key: channelConfig.key,
        value: channelConfig.value,
      })
      .from(channelConfig)
      .where(eq(channelConfig.channelId, channelId))

    // Build the config map
    const config: ChannelConfigMap = { channelId }

    for (const row of rows) {
      const key = row.key as ChannelConfigKey
      const value = row.value

      switch (key) {
        case 'visibility':
          config.visibility = value as 'internal' | 'partner'
          break
        case 'priceList':
          config.priceList = value
          break
        case 'currency':
          config.currency = value as 'CIS' | 'ICA' | 'AIC' | 'NCC'
          break
        case 'messageVisibility':
          config.messageVisibility = value as 'ephemeral' | 'public'
          break
        case 'visibilityEnforced':
          config.visibilityEnforced = value === 'true'
          break
        case 'priceListEnforced':
          config.priceListEnforced = value === 'true'
          break
        case 'currencyEnforced':
          config.currencyEnforced = value === 'true'
          break
        case 'messageVisibilityEnforced':
          config.messageVisibilityEnforced = value === 'true'
          break
        case 'announceInternal':
          config.announceInternal = value
          break
        case 'announcePartner':
          config.announcePartner = value
          break
      }
    }

    return config
  }

  /**
   * Update channel config (partial update - upserts each key)
   */
  @Put('channel-config/{channelId}')
  public async updateChannelConfig(
    @Path() channelId: string,
    @Body() body: UpdateChannelConfigRequest
  ): Promise<ChannelConfigMap> {
    const now = new Date()

    // Process each field in the request
    const updates: { key: ChannelConfigKey; value: string | null }[] = []

    if (body.visibility !== undefined) {
      updates.push({ key: 'visibility', value: body.visibility })
    }
    if (body.priceList !== undefined) {
      updates.push({ key: 'priceList', value: body.priceList })
    }
    if (body.currency !== undefined) {
      updates.push({ key: 'currency', value: body.currency })
    }
    if (body.messageVisibility !== undefined) {
      updates.push({ key: 'messageVisibility', value: body.messageVisibility })
    }
    if (body.visibilityEnforced !== undefined) {
      updates.push({
        key: 'visibilityEnforced',
        value: body.visibilityEnforced === null ? null : String(body.visibilityEnforced),
      })
    }
    if (body.priceListEnforced !== undefined) {
      updates.push({
        key: 'priceListEnforced',
        value: body.priceListEnforced === null ? null : String(body.priceListEnforced),
      })
    }
    if (body.currencyEnforced !== undefined) {
      updates.push({
        key: 'currencyEnforced',
        value: body.currencyEnforced === null ? null : String(body.currencyEnforced),
      })
    }
    if (body.messageVisibilityEnforced !== undefined) {
      updates.push({
        key: 'messageVisibilityEnforced',
        value: body.messageVisibilityEnforced === null ? null : String(body.messageVisibilityEnforced),
      })
    }
    if (body.announceInternal !== undefined) {
      updates.push({ key: 'announceInternal', value: body.announceInternal })
    }
    if (body.announcePartner !== undefined) {
      updates.push({ key: 'announcePartner', value: body.announcePartner })
    }

    // Process each update
    for (const { key, value } of updates) {
      if (value === null) {
        // Delete the key
        await db
          .delete(channelConfig)
          .where(and(eq(channelConfig.channelId, channelId), eq(channelConfig.key, key)))
      } else {
        // Upsert the key
        await db
          .insert(channelConfig)
          .values({
            channelId,
            key,
            value,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [channelConfig.channelId, channelConfig.key],
            set: {
              value,
              updatedAt: now,
            },
          })
      }
    }

    // Return the updated config
    return this.getChannelConfig(channelId)
  }

  /**
   * Delete all config for a specific channel
   */
  @Delete('channel-config/{channelId}')
  public async deleteChannelConfig(@Path() channelId: string): Promise<void> {
    const result = await db
      .delete(channelConfig)
      .where(eq(channelConfig.channelId, channelId))
      .returning()

    if (result.length === 0) {
      throw NotFound(`No config found for channel "${channelId}"`)
    }

    this.setStatus(204)
  }
}
