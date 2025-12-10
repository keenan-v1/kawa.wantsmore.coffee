// User Settings Controller
// Manages user preferences via REST API

import { Body, Controller, Delete, Get, Put, Route, Security, Tags, Request, Path } from 'tsoa'
import type { JwtPayload } from '../utils/jwt.js'
import { SETTING_DEFINITIONS } from '@kawakawa/types/settings'
import * as userSettingsService from '../services/userSettingsService.js'
import { BadRequest } from '../utils/errors.js'

// ==================== REQUEST/RESPONSE TYPES ====================

// Inline definition type for TSOA compatibility
interface SettingDefinitionDto {
  key: string
  type: 'string' | 'boolean' | 'number' | 'enum' | 'string[]'
  defaultValue: unknown
  category: string
  label: string
  description: string
  enumOptions?: string[]
}

interface UserSettingsResponse {
  /** Current values for all settings (user overrides + defaults) */
  values: Record<string, unknown>
  /** Setting definitions with metadata for building settings UI */
  definitions: Record<string, SettingDefinitionDto>
}

interface UpdateSettingsRequest {
  /** Object of setting key-value pairs to update */
  settings: Record<string, unknown>
}

// ==================== CONTROLLER ====================

@Route('user-settings')
@Tags('User Settings')
@Security('jwt')
export class UserSettingsController extends Controller {
  /**
   * Get all user settings with their current values and definitions
   * Returns both the user's current values (with defaults applied) and
   * the setting definitions for use in building settings UI
   */
  @Get()
  public async getSettings(
    @Request() request: { user: JwtPayload }
  ): Promise<UserSettingsResponse> {
    const userId = request.user.userId
    const values = await userSettingsService.getAllSettings(userId)

    return {
      values,
      definitions: SETTING_DEFINITIONS as unknown as Record<string, SettingDefinitionDto>,
    }
  }

  /**
   * Update one or more user settings
   * Only the settings specified in the request body will be updated;
   * other settings will remain unchanged
   */
  @Put()
  public async updateSettings(
    @Body() body: UpdateSettingsRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<UserSettingsResponse> {
    const userId = request.user.userId

    if (!body.settings || typeof body.settings !== 'object') {
      this.setStatus(400)
      throw BadRequest('settings must be an object')
    }

    try {
      await userSettingsService.setSettings(userId, body.settings)
    } catch (error) {
      this.setStatus(400)
      throw BadRequest(error instanceof Error ? error.message : 'Invalid settings')
    }

    return this.getSettings(request)
  }

  /**
   * Reset a single setting to its default value
   * The setting key should be URL-encoded (e.g., display.preferredCurrency)
   */
  @Delete('{key}')
  public async resetSetting(
    @Path() key: string,
    @Request() request: { user: JwtPayload }
  ): Promise<UserSettingsResponse> {
    const userId = request.user.userId

    try {
      await userSettingsService.resetSetting(userId, key)
    } catch (error) {
      this.setStatus(400)
      throw BadRequest(error instanceof Error ? error.message : 'Invalid setting key')
    }

    return this.getSettings(request)
  }

  /**
   * Reset all settings to their default values
   */
  @Delete()
  public async resetAllSettings(
    @Request() request: { user: JwtPayload }
  ): Promise<UserSettingsResponse> {
    const userId = request.user.userId
    await userSettingsService.resetAllSettings(userId)
    return this.getSettings(request)
  }
}
