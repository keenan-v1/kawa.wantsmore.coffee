/**
 * Validation utilities for Discord bot commands
 */

/**
 * Valid currency codes
 */
export const VALID_CURRENCIES = ['CIS', 'ICA', 'AIC', 'NCC'] as const
export type ValidCurrency = (typeof VALID_CURRENCIES)[number]

/**
 * Check if a string is a valid currency code
 */
export function isValidCurrency(currency: string): currency is ValidCurrency {
  return VALID_CURRENCIES.includes(currency as ValidCurrency)
}
