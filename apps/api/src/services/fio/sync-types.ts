// Shared types for FIO sync operations

export interface SyncResult {
  success: boolean
  inserted: number
  updated: number
  errors: string[]
}
