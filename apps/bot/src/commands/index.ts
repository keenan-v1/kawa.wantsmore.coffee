import type { Command } from '../client.js'
// General commands
import { help } from './general/help.js'
// Auth commands
import { whoami } from './auth/whoami.js'
import { register } from './auth/register.js'
import { link } from './auth/link.js'
import { unlink } from './auth/unlink.js'
// Market commands
import { orders } from './market/orders.js'
import { query } from './market/query.js'
import { reserve } from './market/reserve.js'
import { fill } from './market/fill.js'
import { reservations } from './market/reservations.js'
// Inventory commands
import { inventory } from './inventory/inventory.js'
import { sync } from './inventory/sync.js'
import { sell } from './inventory/sell.js'
import { buy } from './inventory/buy.js'
import { bulksell } from './inventory/bulksell.js'
import { bulkbuy } from './inventory/bulkbuy.js'
// Settings commands
import { settings } from './settings/settings.js'

/**
 * All registered slash commands.
 */
export const commands: Command[] = [
  // General
  help,
  // Auth
  whoami,
  register,
  link,
  unlink,
  // Market
  orders,
  query,
  reserve,
  fill,
  reservations,
  // Inventory
  inventory,
  sync,
  sell,
  buy,
  bulksell,
  bulkbuy,
  // Settings
  settings,
]
