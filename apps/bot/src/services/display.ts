/**
 * Display Service for Discord Bot
 * Re-exports commodity and location services for backward compatibility.
 */

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
import { clearCommodityCache } from './commodityService.js'
import { clearLocationCache } from './locationService.js'

export function clearDisplayCache(): void {
  clearCommodityCache()
  clearLocationCache()
}
