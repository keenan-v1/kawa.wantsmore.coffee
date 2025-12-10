import { useSettingsStore } from '../stores/settings'
import {
  formatDateTime as formatDateTimeUtil,
  formatDate as formatDateUtil,
  formatRelativeDate as formatRelativeDateUtil,
  formatRelativeTimeShort,
  getSyncStatusColor,
  getFioAgeColor,
  type DateFormatSettings,
} from '../utils/dateFormat'
import {
  formatPrice as formatPriceUtil,
  formatQuantity as formatQuantityUtil,
  formatNumberWithSettings,
  type NumberFormatSettings,
} from '../utils/formatters'

/**
 * Composable providing formatting functions that respect user settings.
 */
export function useFormatters() {
  const settingsStore = useSettingsStore()

  /**
   * Get current date format settings from the store.
   */
  const getDateSettings = (): DateFormatSettings => ({
    timezone: settingsStore.timezone.value,
    datetimeFormat: settingsStore.datetimeFormat.value,
  })

  /**
   * Get current number format settings from the store.
   */
  const getNumberSettings = (): NumberFormatSettings => ({
    numberFormat: settingsStore.numberFormat.value,
  })

  /**
   * Format a date/time string respecting user settings.
   */
  const formatDateTime = (dateString: string | null | undefined): string => {
    if (!dateString) return 'Never'
    return formatDateTimeUtil(dateString, getDateSettings())
  }

  /**
   * Format a date string (no time) respecting user settings.
   */
  const formatDate = (dateString: string | null | undefined): string => {
    if (!dateString) return 'Never'
    return formatDateUtil(dateString, getDateSettings())
  }

  /**
   * Format as a relative date (e.g., "2 hours ago").
   */
  const formatRelativeDate = (dateString: string | null | undefined): string => {
    if (!dateString) return 'Never'
    return formatRelativeDateUtil(dateString, getDateSettings())
  }

  /**
   * Format as a short relative time (e.g., "2h", "3d").
   */
  const formatRelativeTime = (dateString: string | null | undefined): string => {
    if (!dateString) return '-'
    return formatRelativeTimeShort(dateString)
  }

  /**
   * Format a price value with 2 decimal places.
   */
  const formatPrice = (value: number | null | undefined): string => {
    if (value === null || value === undefined) return '-'
    return formatPriceUtil(value, getNumberSettings())
  }

  /**
   * Format an integer quantity with thousands separators.
   */
  const formatQuantity = (value: number | null | undefined): string => {
    if (value === null || value === undefined) return '-'
    return formatQuantityUtil(value, getNumberSettings())
  }

  /**
   * Format any number with optional decimal places.
   */
  const formatNumber = (
    value: number | null | undefined,
    options?: { minimumFractionDigits?: number; maximumFractionDigits?: number }
  ): string => {
    if (value === null || value === undefined) return '-'
    return formatNumberWithSettings(value, getNumberSettings(), options)
  }

  return {
    // Date/time formatters
    formatDateTime,
    formatDate,
    formatRelativeDate,
    formatRelativeTime,
    // Number formatters
    formatPrice,
    formatQuantity,
    formatNumber,
    // Status colors (don't need settings)
    getSyncStatusColor,
    getFioAgeColor,
  }
}
