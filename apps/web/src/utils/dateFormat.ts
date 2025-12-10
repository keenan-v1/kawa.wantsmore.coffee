/**
 * Date formatting utilities with user settings support.
 */

export interface DateFormatSettings {
  timezone: string // 'auto' or a timezone like 'America/New_York'
  datetimeFormat: string // 'auto', 'iso', 'us', 'eu', 'long', or a custom pattern
}

const DEFAULT_SETTINGS: DateFormatSettings = {
  timezone: 'auto',
  datetimeFormat: 'auto',
}

/**
 * Get the effective timezone to use.
 */
function getEffectiveTimezone(settings: DateFormatSettings): string | undefined {
  if (settings.timezone === 'auto') {
    return undefined // Use browser default
  }
  return settings.timezone
}

/**
 * Apply a custom datetime pattern to a date.
 * Supported tokens: YYYY, YY, MMMM, MMM, MM, DD, D, dddd, ddd, HH, hh, mm, ss, A, a
 */
function applyPattern(date: Date, pattern: string, timezone?: string): string {
  // Create a formatter for the specified timezone
  const options: Intl.DateTimeFormatOptions = timezone ? { timeZone: timezone } : {}

  // Helper to get parts
  const getPart = (type: Intl.DateTimeFormatPartTypes): string => {
    const formatter = new Intl.DateTimeFormat('en-US', { ...options, [type]: 'numeric' })
    const parts = formatter.formatToParts(date)
    return parts.find(p => p.type === type)?.value || ''
  }

  const getNamePart = (type: 'weekday' | 'month', style: 'long' | 'short'): string => {
    const formatter = new Intl.DateTimeFormat('en-US', { ...options, [type]: style })
    const parts = formatter.formatToParts(date)
    return parts.find(p => p.type === type)?.value || ''
  }

  const year = getPart('year')
  const month = getPart('month')
  const day = getPart('day')
  const hour = getPart('hour')
  const minute = getPart('minute')
  const second = getPart('second')

  // Get 12-hour format hour and AM/PM
  const hour12Formatter = new Intl.DateTimeFormat('en-US', {
    ...options,
    hour: 'numeric',
    hour12: true,
  })
  const hour12Parts = hour12Formatter.formatToParts(date)
  const hour12 = hour12Parts.find(p => p.type === 'hour')?.value || ''
  const dayPeriod = hour12Parts.find(p => p.type === 'dayPeriod')?.value || ''

  const replacements: Record<string, string> = {
    YYYY: year.padStart(4, '0'),
    YY: year.slice(-2),
    MMMM: getNamePart('month', 'long'),
    MMM: getNamePart('month', 'short'),
    MM: month.padStart(2, '0'),
    DD: day.padStart(2, '0'),
    D: day,
    dddd: getNamePart('weekday', 'long'),
    ddd: getNamePart('weekday', 'short'),
    HH: hour.padStart(2, '0'),
    hh: hour12.padStart(2, '0'),
    mm: minute.padStart(2, '0'),
    ss: second.padStart(2, '0'),
    A: dayPeriod.toUpperCase(),
    a: dayPeriod.toLowerCase(),
  }

  // Replace tokens (longer first to avoid partial matches)
  let result = pattern
  const sortedTokens = Object.keys(replacements).sort((a, b) => b.length - a.length)
  for (const token of sortedTokens) {
    result = result.replace(new RegExp(token, 'g'), replacements[token])
  }

  return result
}

/**
 * Format a date string using settings-aware formatting.
 */
export function formatDateTimeWithSettings(
  dateString: string,
  settings: DateFormatSettings = DEFAULT_SETTINGS
): string {
  const date = new Date(dateString)
  const timezone = getEffectiveTimezone(settings)

  switch (settings.datetimeFormat) {
    case 'auto':
      return date.toLocaleString(undefined, timezone ? { timeZone: timezone } : undefined)

    case 'iso':
      return applyPattern(date, 'YYYY-MM-DD HH:mm', timezone)

    case 'us':
      return applyPattern(date, 'MM/DD/YYYY hh:mm A', timezone)

    case 'eu':
      return applyPattern(date, 'DD/MM/YYYY HH:mm', timezone)

    case 'long':
      return applyPattern(date, 'MMMM D, YYYY at hh:mm A', timezone)

    default:
      // Custom pattern
      return applyPattern(date, settings.datetimeFormat, timezone)
  }
}

/**
 * Format a date string as a relative time (e.g., "2 hours ago", "3 days ago")
 * Falls back to formatted date for older dates.
 */
export function formatRelativeDate(
  dateString: string,
  settings: DateFormatSettings = DEFAULT_SETTINGS
): string {
  const date = new Date(dateString)
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  // Less than 1 minute
  if (diff < 60 * 1000) {
    return 'Just now'
  }

  // Less than 1 hour
  if (diff < 60 * 60 * 1000) {
    const minutes = Math.floor(diff / (60 * 1000))
    return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`
  }

  // Less than 24 hours
  if (diff < 24 * 60 * 60 * 1000) {
    const hours = Math.floor(diff / (60 * 60 * 1000))
    return `${hours} hour${hours !== 1 ? 's' : ''} ago`
  }

  // Less than 7 days
  if (diff < 7 * 24 * 60 * 60 * 1000) {
    const days = Math.floor(diff / (24 * 60 * 60 * 1000))
    return `${days} day${days !== 1 ? 's' : ''} ago`
  }

  // Otherwise, show the date
  const timezone = getEffectiveTimezone(settings)
  return date.toLocaleDateString(undefined, timezone ? { timeZone: timezone } : undefined)
}

/**
 * Format a date string as an absolute date/time.
 * Uses settings if provided, otherwise uses browser defaults.
 */
export function formatDateTime(dateString: string, settings?: DateFormatSettings): string {
  if (settings) {
    return formatDateTimeWithSettings(dateString, settings)
  }
  const date = new Date(dateString)
  return date.toLocaleString()
}

/**
 * Format a date string as just the date.
 */
export function formatDate(
  dateString: string,
  settings: DateFormatSettings = DEFAULT_SETTINGS
): string {
  const date = new Date(dateString)
  const timezone = getEffectiveTimezone(settings)
  return date.toLocaleDateString(undefined, timezone ? { timeZone: timezone } : undefined)
}

/**
 * Format a date as a short relative time for compact display.
 * e.g., "2h", "3d", "Just now"
 */
export function formatRelativeTimeShort(dateString: string): string {
  const date = new Date(dateString)
  const now = Date.now()
  const diffMs = now - date.getTime()

  if (diffMs < 0) return 'Future?'

  const minutes = Math.floor(diffMs / (1000 * 60))
  const hours = Math.floor(diffMs / (1000 * 60 * 60))
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (days > 0) return `${days}d`
  if (hours > 0) return `${hours}h`
  if (minutes > 0) return `${minutes}m`
  return '<1m'
}

/**
 * Get the age of a date in hours.
 */
export function getAgeInHours(dateString: string): number {
  const date = new Date(dateString)
  const now = Date.now()
  return (now - date.getTime()) / (1000 * 60 * 60)
}

/**
 * Get a color based on sync/data age.
 * Useful for FIO sync status indicators.
 *
 * @param dateString - The date to check
 * @param thresholds - Optional custom thresholds in hours [fresh, stale, veryStale]
 * @returns Vuetify color name
 */
export function getSyncStatusColor(
  dateString: string | null,
  thresholds: [number, number, number] = [24, 48, 72]
): string {
  if (!dateString) return 'grey'

  const hoursAgo = getAgeInHours(dateString)
  const [fresh, stale, veryStale] = thresholds

  if (hoursAgo < fresh) return 'success'
  if (hoursAgo < stale) return 'default'
  if (hoursAgo < veryStale) return 'warning'
  return 'error'
}

/**
 * Get FIO age color with standard thresholds.
 * Less than 1 hour: success (very fresh)
 * Less than 24 hours: default (fine)
 * Less than 72 hours: warning (getting stale)
 * More than 72 hours: error (very stale)
 */
export function getFioAgeColor(dateString: string): string {
  const hoursAgo = getAgeInHours(dateString)

  if (hoursAgo < 1) return 'success' // Less than 1 hour - very fresh
  if (hoursAgo < 24) return 'default' // Less than 24 hours - fine
  if (hoursAgo < 72) return 'warning' // 1-3 days - getting stale
  return 'error' // More than 3 days - very stale
}
