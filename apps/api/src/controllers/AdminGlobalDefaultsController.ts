import { Body, Controller, Delete, Get, Path, Put, Route, Security, Tags, Request } from 'tsoa'
import type {
  GlobalDefaultsResponse,
  GlobalDefaultSetting,
  UpdateGlobalDefaultsRequest,
  SettingHistoryEntry,
  SettingDefinition,
} from '@kawakawa/types'
import { SETTING_DEFINITIONS, type SettingKey } from '@kawakawa/types/settings'
import { db } from '../db/index.js'
import { sql } from 'drizzle-orm'
import type { JwtPayload } from '../utils/jwt.js'
import { BadRequest, NotFound } from '../utils/errors.js'
import { settingsService } from '../services/settingsService.js'
import { clearCache as clearUserSettingsCache } from '../services/userSettingsService.js'
import { syncService } from '../services/syncService.js'

// Prefix for admin defaults in the settings table
const DEFAULTS_PREFIX = 'defaults.'

// Settings that are user-specific and should NOT be admin-configurable
const EXCLUDED_SETTINGS: SettingKey[] = [
  'fio.apiKey', // Sensitive credential
  'fio.username', // User-specific credential
  'fio.excludedLocations', // User-specific preference
  'market.favoritedLocations', // User-specific preference
  'market.favoritedCommodities', // User-specific preference
]

// Get the list of admin-configurable setting keys
function getConfigurableKeys(): SettingKey[] {
  return (Object.keys(SETTING_DEFINITIONS) as SettingKey[]).filter(
    key => !EXCLUDED_SETTINGS.includes(key)
  )
}

// Validate a setting value against its definition
function validateSettingValue(def: SettingDefinition, value: unknown): void {
  switch (def.type) {
    case 'boolean':
      if (typeof value !== 'boolean') {
        throw BadRequest(`${def.key} must be a boolean`)
      }
      break

    case 'number':
      if (typeof value !== 'number' || isNaN(value)) {
        throw BadRequest(`${def.key} must be a number`)
      }
      break

    case 'string':
      if (typeof value !== 'string') {
        throw BadRequest(`${def.key} must be a string`)
      }
      break

    case 'enum':
      if (typeof value !== 'string' || !def.enumOptions?.includes(value)) {
        throw BadRequest(
          `${def.key} must be one of: ${def.enumOptions?.join(', ') ?? 'no options defined'}`
        )
      }
      break

    case 'string[]':
      if (!Array.isArray(value) || !value.every(v => typeof v === 'string')) {
        throw BadRequest(`${def.key} must be an array of strings`)
      }
      break

    default:
      // Unknown type, allow anything
      break
  }
}

@Route('admin/global-defaults')
@Tags('Admin Global Defaults')
@Security('jwt', ['admin.manage_users'])
export class AdminGlobalDefaultsController extends Controller {
  /**
   * Get all configurable settings with their code defaults, admin defaults, and effective values
   */
  @Get('')
  public async getGlobalDefaults(): Promise<GlobalDefaultsResponse> {
    // Get all admin defaults from settings table
    const adminDefaults = await settingsService.getAll(DEFAULTS_PREFIX)

    const configurableKeys = getConfigurableKeys()
    const settingsList: GlobalDefaultSetting[] = []

    for (const key of configurableKeys) {
      const def = SETTING_DEFINITIONS[key]
      const adminDefaultKey = `${DEFAULTS_PREFIX}${key}`
      const rawAdminDefault = adminDefaults[adminDefaultKey]

      let adminDefault: unknown = null
      if (rawAdminDefault !== undefined) {
        try {
          adminDefault = JSON.parse(rawAdminDefault)
        } catch {
          // Invalid JSON, treat as no admin default
        }
      }

      // Cast to SettingDefinition to access optional enumOptions
      const definition = def as SettingDefinition
      settingsList.push({
        key,
        codeDefault: def.defaultValue,
        adminDefault,
        effectiveDefault: adminDefault ?? def.defaultValue,
        definition: {
          key: definition.key,
          type: definition.type,
          defaultValue: definition.defaultValue,
          category: definition.category,
          label: definition.label,
          description: definition.description,
          enumOptions: definition.enumOptions,
        },
      })
    }

    return { settings: settingsList }
  }

  /**
   * Update admin defaults for one or more settings
   */
  @Put('')
  public async updateGlobalDefaults(
    @Body() body: UpdateGlobalDefaultsRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<GlobalDefaultsResponse> {
    const userId = request.user.userId
    const configurableKeys = getConfigurableKeys()
    const updates: Record<string, string> = {}

    for (const [key, value] of Object.entries(body.settings)) {
      // Validate key is configurable
      if (!configurableKeys.includes(key as SettingKey)) {
        if (EXCLUDED_SETTINGS.includes(key as SettingKey)) {
          throw BadRequest(`Setting "${key}" is user-specific and cannot be configured globally`)
        }
        throw BadRequest(`Unknown setting: ${key}`)
      }

      // Validate value type
      const def = SETTING_DEFINITIONS[key as SettingKey]
      validateSettingValue(def, value)

      // Queue for update
      updates[`${DEFAULTS_PREFIX}${key}`] = JSON.stringify(value)
    }

    if (Object.keys(updates).length > 0) {
      await settingsService.setMany(updates, userId)
      // Invalidate user settings cache since defaults changed
      clearUserSettingsCache()
      // Bump data version so frontends know to refresh
      await syncService.bumpDataVersion('globalDefaults', userId)
    }

    return this.getGlobalDefaults()
  }

  /**
   * Reset a setting to its code-defined default (remove admin override)
   */
  @Delete('{key}')
  public async resetGlobalDefault(@Path() key: string): Promise<GlobalDefaultsResponse> {
    const configurableKeys = getConfigurableKeys()

    // Validate key is configurable
    if (!configurableKeys.includes(key as SettingKey)) {
      if (EXCLUDED_SETTINGS.includes(key as SettingKey)) {
        throw BadRequest(`Setting "${key}" is user-specific and cannot be configured globally`)
      }
      throw NotFound(`Unknown setting: ${key}`)
    }

    const settingKey = `${DEFAULTS_PREFIX}${key}`

    // Delete all entries for this key from the settings table
    await db.execute(sql`DELETE FROM settings WHERE key = ${settingKey}`)

    // Invalidate caches
    settingsService.invalidateCache()
    clearUserSettingsCache()
    // Bump data version so frontends know to refresh
    await syncService.bumpDataVersion('globalDefaults')

    return this.getGlobalDefaults()
  }

  /**
   * Get change history for a specific setting's admin default
   */
  @Get('history/{key}')
  public async getSettingHistory(@Path() key: string): Promise<SettingHistoryEntry[]> {
    const configurableKeys = getConfigurableKeys()

    // Validate key is configurable
    if (!configurableKeys.includes(key as SettingKey)) {
      if (EXCLUDED_SETTINGS.includes(key as SettingKey)) {
        throw BadRequest(`Setting "${key}" is user-specific and cannot be configured globally`)
      }
      throw NotFound(`Unknown setting: ${key}`)
    }

    const settingKey = `${DEFAULTS_PREFIX}${key}`
    return settingsService.getHistory(settingKey)
  }
}
