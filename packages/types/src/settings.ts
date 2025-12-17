// User Setting Definitions
// This file defines all available user settings with their metadata.
// Settings are stored as key-value pairs in the database, with defaults defined here.

import type {
  SettingDefinition,
  SettingValueType,
  Currency,
  LocationDisplayMode,
  CommodityDisplayMode,
  CommodityIconStyle,
  MessageVisibility,
} from './index'

// Categories for grouping settings in the UI
export const SETTING_CATEGORIES = {
  GENERAL: 'general',
  DISPLAY: 'display',
  MARKET: 'market',
  NOTIFICATIONS: 'notifications',
  FIO: 'fio',
  DISCORD: 'discord',
} as const

export type SettingCategory = (typeof SETTING_CATEGORIES)[keyof typeof SETTING_CATEGORIES]

// Category metadata for UI display
export const SETTING_CATEGORY_INFO: Record<
  SettingCategory,
  { label: string; description: string }
> = {
  [SETTING_CATEGORIES.GENERAL]: {
    label: 'General',
    description: 'Timezone, formatting, and display preferences',
  },
  [SETTING_CATEGORIES.DISPLAY]: {
    label: 'Display',
    description: 'How names and identifiers are shown',
  },
  [SETTING_CATEGORIES.MARKET]: {
    label: 'Market',
    description: 'Trading preferences and favorites',
  },
  [SETTING_CATEGORIES.NOTIFICATIONS]: {
    label: 'Notifications',
    description: 'Configure notification preferences',
  },
  [SETTING_CATEGORIES.FIO]: {
    label: 'FIO Integration',
    description: 'Settings for FIO data synchronization',
  },
  [SETTING_CATEGORIES.DISCORD]: {
    label: 'Discord',
    description: 'Discord bot preferences',
  },
}

// Helper type for defining settings with proper typing
type SettingDef<T, VT extends SettingValueType> = SettingDefinition<T> & { type: VT }

// All setting definitions
export const SETTING_DEFINITIONS = {
  // ==================== GENERAL SETTINGS ====================
  'general.timezone': {
    key: 'general.timezone',
    type: 'string',
    defaultValue: 'auto',
    category: SETTING_CATEGORIES.GENERAL,
    label: 'Timezone',
    description: 'Your preferred timezone for displaying dates and times',
  } satisfies SettingDef<string, 'string'>,

  'general.datetimeFormat': {
    key: 'general.datetimeFormat',
    type: 'string',
    defaultValue: 'auto',
    category: SETTING_CATEGORIES.GENERAL,
    label: 'Datetime Format',
    description: 'How dates and times are displayed (preset or custom pattern)',
  } satisfies SettingDef<string, 'string'>,

  'general.numberFormat': {
    key: 'general.numberFormat',
    type: 'string',
    defaultValue: 'auto',
    category: SETTING_CATEGORIES.GENERAL,
    label: 'Number Format',
    description: 'How numbers are formatted (preset or custom pattern)',
  } satisfies SettingDef<string, 'string'>,

  'general.closeDialogOnClickOutside': {
    key: 'general.closeDialogOnClickOutside',
    type: 'boolean',
    defaultValue: false,
    category: SETTING_CATEGORIES.GENERAL,
    label: 'Close Dialogs on Click Outside',
    description: 'Close dialogs and modals when clicking outside of them',
  } satisfies SettingDef<boolean, 'boolean'>,

  // ==================== DISPLAY SETTINGS ====================
  'display.locationDisplayMode': {
    key: 'display.locationDisplayMode',
    type: 'enum',
    defaultValue: 'both' as LocationDisplayMode,
    category: SETTING_CATEGORIES.DISPLAY,
    label: 'Location Display Mode',
    description: 'How to display location names in the UI',
    enumOptions: ['names-only', 'natural-ids-only', 'both'] as const,
  } satisfies SettingDef<LocationDisplayMode, 'enum'>,

  'display.commodityDisplayMode': {
    key: 'display.commodityDisplayMode',
    type: 'enum',
    defaultValue: 'both' as CommodityDisplayMode,
    category: SETTING_CATEGORIES.DISPLAY,
    label: 'Commodity Display Mode',
    description: 'How to display commodity names in the UI',
    enumOptions: ['ticker-only', 'name-only', 'both'] as const,
  } satisfies SettingDef<CommodityDisplayMode, 'enum'>,

  'display.commodityIconStyle': {
    key: 'display.commodityIconStyle',
    type: 'enum',
    defaultValue: 'prun' as CommodityIconStyle,
    category: SETTING_CATEGORIES.DISPLAY,
    label: 'Commodity Icons',
    description: 'Icon style for commodity displays',
    enumOptions: ['rprun', 'prun', 'none'] as const,
  } satisfies SettingDef<CommodityIconStyle, 'enum'>,

  // ==================== MARKET SETTINGS ====================
  'market.preferredCurrency': {
    key: 'market.preferredCurrency',
    type: 'enum',
    defaultValue: 'CIS' as Currency,
    category: SETTING_CATEGORIES.MARKET,
    label: 'Preferred Currency',
    description: 'Default currency for displaying and entering prices',
    enumOptions: ['ICA', 'CIS', 'AIC', 'NCC'] as const,
  } satisfies SettingDef<Currency, 'enum'>,

  'market.defaultPriceList': {
    key: 'market.defaultPriceList',
    type: 'string',
    defaultValue: null,
    category: SETTING_CATEGORIES.MARKET,
    label: 'Default Price List',
    description: 'Price list used for price suggestions in order forms',
  } satisfies SettingDef<string | null, 'string'>,

  'market.automaticPricing': {
    key: 'market.automaticPricing',
    type: 'boolean',
    defaultValue: false,
    category: SETTING_CATEGORIES.MARKET,
    label: 'Automatic Pricing',
    description: 'Use your default price list for new orders instead of entering a fixed price',
  } satisfies SettingDef<boolean, 'boolean'>,

  'market.favoritedLocations': {
    key: 'market.favoritedLocations',
    type: 'string[]',
    defaultValue: [] as string[],
    category: SETTING_CATEGORIES.MARKET,
    label: 'Favorite Locations',
    description: 'Locations that appear first in dropdown menus',
  } satisfies SettingDef<string[], 'string[]'>,

  'market.favoritedCommodities': {
    key: 'market.favoritedCommodities',
    type: 'string[]',
    defaultValue: [] as string[],
    category: SETTING_CATEGORIES.MARKET,
    label: 'Favorite Commodities',
    description: 'Commodities that appear first in dropdown menus',
  } satisfies SettingDef<string[], 'string[]'>,

  // ==================== NOTIFICATION SETTINGS ====================
  'notifications.browserEnabled': {
    key: 'notifications.browserEnabled',
    type: 'boolean',
    defaultValue: false,
    category: SETTING_CATEGORIES.NOTIFICATIONS,
    label: 'Browser Notifications',
    description: 'Enable desktop notifications for important events',
  } satisfies SettingDef<boolean, 'boolean'>,

  'notifications.reservationPlaced': {
    key: 'notifications.reservationPlaced',
    type: 'boolean',
    defaultValue: true,
    category: SETTING_CATEGORIES.NOTIFICATIONS,
    label: 'Reservation Placed',
    description: 'Notify when someone places a reservation on your order',
  } satisfies SettingDef<boolean, 'boolean'>,

  'notifications.reservationStatusChange': {
    key: 'notifications.reservationStatusChange',
    type: 'boolean',
    defaultValue: true,
    category: SETTING_CATEGORIES.NOTIFICATIONS,
    label: 'Reservation Status Changes',
    description: 'Notify when a reservation status changes (confirmed, rejected, etc.)',
  } satisfies SettingDef<boolean, 'boolean'>,

  // ==================== FIO SETTINGS ====================
  'fio.username': {
    key: 'fio.username',
    type: 'string',
    defaultValue: '',
    category: SETTING_CATEGORIES.FIO,
    label: 'FIO Username',
    description: 'Your FIO username for API access',
  } satisfies SettingDef<string, 'string'>,

  'fio.apiKey': {
    key: 'fio.apiKey',
    type: 'string',
    defaultValue: '',
    category: SETTING_CATEGORIES.FIO,
    label: 'FIO API Key',
    description: 'Your FIO API key (never displayed after saving)',
    sensitive: true, // Write-only, never returned in responses
  } satisfies SettingDef<string, 'string'>,

  'fio.autoSync': {
    key: 'fio.autoSync',
    type: 'boolean',
    defaultValue: true,
    category: SETTING_CATEGORIES.FIO,
    label: 'Auto-Sync Inventory',
    description: 'Automatically sync inventory from FIO on a schedule',
  } satisfies SettingDef<boolean, 'boolean'>,

  'fio.excludedLocations': {
    key: 'fio.excludedLocations',
    type: 'string[]',
    defaultValue: [] as string[],
    category: SETTING_CATEGORIES.FIO,
    label: 'Excluded Locations',
    description: 'Locations to exclude from FIO inventory sync (by ID or name)',
  } satisfies SettingDef<string[], 'string[]'>,

  // ==================== DISCORD SETTINGS ====================
  'discord.messageVisibility': {
    key: 'discord.messageVisibility',
    type: 'enum',
    defaultValue: 'ephemeral' as MessageVisibility,
    category: SETTING_CATEGORIES.DISCORD,
    label: 'Message Visibility',
    description: 'Whether bot responses are private (ephemeral) or public by default',
    enumOptions: ['ephemeral', 'public'] as const,
  } satisfies SettingDef<MessageVisibility, 'enum'>,

  'discord.locationDisplayMode': {
    key: 'discord.locationDisplayMode',
    type: 'enum',
    defaultValue: 'natural-ids-only' as LocationDisplayMode,
    category: SETTING_CATEGORIES.DISCORD,
    label: 'Location Display Mode',
    description: 'How to display location names in Discord (compact for mobile)',
    enumOptions: ['names-only', 'natural-ids-only', 'both'] as const,
  } satisfies SettingDef<LocationDisplayMode, 'enum'>,

  'discord.commodityDisplayMode': {
    key: 'discord.commodityDisplayMode',
    type: 'enum',
    defaultValue: 'ticker-only' as CommodityDisplayMode,
    category: SETTING_CATEGORIES.DISCORD,
    label: 'Commodity Display Mode',
    description: 'How to display commodity names in Discord (compact for mobile)',
    enumOptions: ['ticker-only', 'name-only', 'both'] as const,
  } satisfies SettingDef<CommodityDisplayMode, 'enum'>,
} as const

// Type-safe setting keys
export type SettingKey = keyof typeof SETTING_DEFINITIONS

// Array of all setting keys (useful for iteration)
export const SETTING_KEYS = Object.keys(SETTING_DEFINITIONS) as SettingKey[]

// Get a setting definition by key
export function getSettingDefinition<K extends SettingKey>(
  key: K
): (typeof SETTING_DEFINITIONS)[K] {
  return SETTING_DEFINITIONS[key]
}

// Get all settings for a category
export function getSettingsByCategory(category: SettingCategory): SettingDefinition[] {
  return Object.values(SETTING_DEFINITIONS).filter(def => def.category === category)
}

// Get default value for a setting
export function getSettingDefault<K extends SettingKey>(
  key: K
): (typeof SETTING_DEFINITIONS)[K]['defaultValue'] {
  return SETTING_DEFINITIONS[key].defaultValue
}

// Type helper to get the value type for a setting key
export type SettingValue<K extends SettingKey> = (typeof SETTING_DEFINITIONS)[K]['defaultValue']

// Check if a setting is sensitive (should not be returned in API responses)
export function isSettingSensitive(key: SettingKey): boolean {
  const def = SETTING_DEFINITIONS[key] as SettingDefinition
  return def.sensitive === true
}

// Get all sensitive setting keys
export const SENSITIVE_SETTING_KEYS = SETTING_KEYS.filter(isSettingSensitive)
