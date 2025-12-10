/**
 * Number formatting utilities with user settings support.
 */

export interface NumberFormatSettings {
  numberFormat: string // 'auto', 'us', 'eu', 'si', or custom pattern like ',.' or '.,'
}

const DEFAULT_SETTINGS: NumberFormatSettings = {
  numberFormat: 'auto',
}

/**
 * Parse a custom number format pattern.
 * Format: [thousandsSeparator][decimalSeparator]
 * Examples: ",." (US), ".," (EU), "_." (SI with space as underscore)
 */
function parseCustomFormat(pattern: string): {
  thousandsSeparator: string
  decimalSeparator: string
} {
  if (pattern.length !== 2) {
    return { thousandsSeparator: ',', decimalSeparator: '.' }
  }
  return {
    thousandsSeparator: pattern[0] === '_' ? ' ' : pattern[0],
    decimalSeparator: pattern[1],
  }
}

/**
 * Format a number using custom separators.
 */
function formatWithCustomSeparators(
  value: number,
  thousandsSeparator: string,
  decimalSeparator: string,
  fractionDigits?: number
): string {
  const hasDecimalSpec = fractionDigits !== undefined

  // Handle special cases
  if (!Number.isFinite(value)) {
    return String(value)
  }

  // Split into integer and decimal parts
  const fixed = hasDecimalSpec ? value.toFixed(fractionDigits) : String(value)
  const [intPart, decPart] = fixed.split('.')

  // Add thousands separators to integer part
  const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, thousandsSeparator)

  // Combine parts
  if (decPart !== undefined) {
    return `${formattedInt}${decimalSeparator}${decPart}`
  }
  return formattedInt
}

/**
 * Format a number with settings-aware formatting.
 */
export function formatNumberWithSettings(
  value: number,
  settings: NumberFormatSettings = DEFAULT_SETTINGS,
  options?: {
    minimumFractionDigits?: number
    maximumFractionDigits?: number
  }
): string {
  const { minimumFractionDigits, maximumFractionDigits } = options || {}

  switch (settings.numberFormat) {
    case 'auto':
      return value.toLocaleString(undefined, {
        minimumFractionDigits,
        maximumFractionDigits,
      })

    case 'us':
      return formatWithCustomSeparators(
        value,
        ',',
        '.',
        maximumFractionDigits ?? minimumFractionDigits
      )

    case 'eu':
      return formatWithCustomSeparators(
        value,
        '.',
        ',',
        maximumFractionDigits ?? minimumFractionDigits
      )

    case 'si':
      return formatWithCustomSeparators(
        value,
        ' ',
        '.',
        maximumFractionDigits ?? minimumFractionDigits
      )

    default: {
      // Custom pattern
      const { thousandsSeparator, decimalSeparator } = parseCustomFormat(settings.numberFormat)
      return formatWithCustomSeparators(
        value,
        thousandsSeparator,
        decimalSeparator,
        maximumFractionDigits ?? minimumFractionDigits
      )
    }
  }
}

/**
 * Format a price value (always 2 decimal places).
 */
export function formatPrice(
  value: number,
  settings: NumberFormatSettings = DEFAULT_SETTINGS
): string {
  return formatNumberWithSettings(value, settings, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/**
 * Format a quantity (integer, with thousands separators).
 */
export function formatQuantity(
  value: number,
  settings: NumberFormatSettings = DEFAULT_SETTINGS
): string {
  return formatNumberWithSettings(Math.round(value), settings)
}

/**
 * Format a number without settings (simple wrapper).
 * Uses browser locale by default.
 */
export function formatNumber(value: number): string {
  return value.toLocaleString()
}
