/**
 * Display Service for Discord Bot
 * Re-exports commodity and location services for backward compatibility.
 */
import { MessageFlags } from 'discord.js'
import type { ChatInputCommandInteraction, ModalSubmitInteraction } from 'discord.js'

// Re-export commodity functions
export {
  formatCommodity,
  formatCommodityWithMode,
  resolveCommodity,
  getCommodity,
  clearCommodityCache,
} from './commodityService.js'

// Re-export location functions
export {
  formatLocation,
  resolveLocation,
  getLocation,
  clearLocationCache,
} from './locationService.js'

// Combined cache clear for convenience
import { clearCommodityCache, resolveCommodity } from './commodityService.js'
import { clearLocationCache, resolveLocation } from './locationService.js'

export function clearDisplayCache(): void {
  clearCommodityCache()
  clearLocationCache()
}

/**
 * Resolved commodity type
 */
export interface ResolvedCommodity {
  ticker: string
  name: string
}

/**
 * Resolved location type
 */
export interface ResolvedLocation {
  naturalId: string
  name: string
  type: string
}

/**
 * Require a valid commodity, sending an error reply if not found.
 *
 * @param interaction - The Discord interaction
 * @param commodityInput - The commodity ticker or name to resolve
 * @returns The resolved commodity or null if not found
 *
 * @example
 * ```typescript
 * const commodity = await requireCommodity(interaction, commodityInput)
 * if (!commodity) return
 * ```
 */
export async function requireCommodity(
  interaction: ChatInputCommandInteraction | ModalSubmitInteraction,
  commodityInput: string
): Promise<ResolvedCommodity | null> {
  const resolved = await resolveCommodity(commodityInput)
  if (!resolved) {
    await interaction.reply({
      content:
        `❌ Commodity ticker "${commodityInput.toUpperCase()}" not found.\n\n` +
        'Use the autocomplete suggestions to find valid tickers.',
      flags: MessageFlags.Ephemeral,
    })
    return null
  }
  return resolved
}

/**
 * Require a valid location, sending an error reply if not found.
 *
 * @param interaction - The Discord interaction
 * @param locationInput - The location ID or name to resolve
 * @returns The resolved location or null if not found
 *
 * @example
 * ```typescript
 * const location = await requireLocation(interaction, locationInput)
 * if (!location) return
 * ```
 */
export async function requireLocation(
  interaction: ChatInputCommandInteraction | ModalSubmitInteraction,
  locationInput: string
): Promise<ResolvedLocation | null> {
  const resolved = await resolveLocation(locationInput)
  if (!resolved) {
    await interaction.reply({
      content:
        `❌ Location "${locationInput}" not found.\n\n` +
        'Use the autocomplete suggestions to find valid locations.',
      flags: MessageFlags.Ephemeral,
    })
    return null
  }
  return resolved
}
