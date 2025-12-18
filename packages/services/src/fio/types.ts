/**
 * FIO API Types for user inventory sync
 */

/** Item in storage from GroupHub endpoint */
export interface FioGroupHubItem {
  MaterialTicker: string | null
  MaterialName: string | null
  MaterialCategoryName: string | null
  Units: number
}

/** Storage from GroupHub endpoint (BaseStorage or WarehouseStorage) */
export interface FioGroupHubStorage {
  PlayerName: string
  StorageType: string // "STORE", "WAREHOUSE_STORE"
  Items: FioGroupHubItem[]
  LastUpdated: string // ISO timestamp
}

/** Location (planet base) from GroupHub endpoint */
export interface FioGroupHubLocation {
  LocationIdentifier: string // NaturalId (e.g., "CH-771b", "KW-688c")
  LocationName: string
  Buildings: unknown[]
  ProductionLines: unknown[]
  BaseStorage: FioGroupHubStorage | null
  WarehouseStorage: FioGroupHubStorage | null
  StationaryPlayerShips: unknown[]
}

/** Player model from GroupHub endpoint */
export interface FioGroupHubPlayerModel {
  UserName: string
  Currencies: unknown[]
  Locations: FioGroupHubLocation[]
}

/** Player warehouse at a CX station */
export interface FioGroupHubPlayerWarehouse {
  PlayerName: string
  StorageType: string // "WAREHOUSE_STORE"
  Items: FioGroupHubItem[]
}

/** CX warehouse location from GroupHub endpoint */
export interface FioGroupHubCXWarehouse {
  WarehouseLocationName: string // e.g., "Benten Station"
  WarehouseLocationNaturalId: string // e.g., "BEN"
  PlayerCXWarehouses: FioGroupHubPlayerWarehouse[]
}

/** Full GroupHub response */
export interface FioGroupHubResponse {
  GroupName: string | null
  CXWarehouses: FioGroupHubCXWarehouse[]
  PlayerModels: FioGroupHubPlayerModel[]
  PlayerShipsInFlight: unknown[]
  PlayerStationaryShips: unknown[]
  Failures: unknown[]
}

/** Result of a sync operation */
export interface FioSyncResult {
  success: boolean
  inserted: number
  storageLocations: number
  errors: string[]
  skippedUnknownLocations: number
  skippedUnknownCommodities: number
  skippedExcludedLocations: number
  fioLastSync: string | null
}

/** Options for sync operation */
export interface FioSyncOptions {
  excludedLocations?: string[]
}
