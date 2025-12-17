// Shared types for FIO sync operations

export interface SyncResult {
  success: boolean
  inserted: number
  updated: number
  errors: string[]
}

// Re-export specialized sync result types
export type { UserDataSyncResult } from './sync-user-data.js'
export type { ContractSyncResult } from './sync-contracts.js'
export type { UserInventorySyncResult } from './sync-user-inventory.js'
