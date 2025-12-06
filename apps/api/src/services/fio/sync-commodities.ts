// Sync commodities from FIO materials API to database
import { db, fioCommodities } from '../../db/index.js'
import { fioClient } from './client.js'
import type { SyncResult } from './sync-types.js'
import { createLogger } from '../../utils/logger.js'

const log = createLogger({ service: 'fio-sync', entity: 'commodities' })

interface FioMaterialJson {
  MaterialId: string
  CategoryName: string
  CategoryId: string
  Name: string
  Ticker: string
  Weight: number
  Volume: number
  UserNameSubmitted: string
  Timestamp: string
}

/**
 * Sync commodities from FIO /material/allmaterials endpoint (JSON)
 * Populates materialId, weight, volume for shipping calculations
 */
export async function syncCommodities(): Promise<SyncResult> {
  const result: SyncResult = {
    success: false,
    inserted: 0,
    updated: 0,
    errors: [],
  }

  try {
    log.info('Fetching materials from FIO API')
    const materials = await fioClient.fetchJson<FioMaterialJson[]>('/material/allmaterials')

    log.info({ count: materials.length }, 'Found materials')

    // Process materials
    for (const material of materials) {
      try {
        // Upsert commodity (insert or update on conflict)
        await db
          .insert(fioCommodities)
          .values({
            ticker: material.Ticker,
            materialId: material.MaterialId,
            name: material.Name,
            categoryName: material.CategoryName || null,
            categoryId: material.CategoryId || null,
            weight: material.Weight?.toString() || null,
            volume: material.Volume?.toString() || null,
          })
          .onConflictDoUpdate({
            target: fioCommodities.ticker,
            set: {
              materialId: material.MaterialId,
              name: material.Name,
              categoryName: material.CategoryName || null,
              categoryId: material.CategoryId || null,
              weight: material.Weight?.toString() || null,
              volume: material.Volume?.toString() || null,
              updatedAt: new Date(),
            },
          })

        result.inserted++
      } catch (error) {
        const errorMsg = `Failed to sync ${material.Ticker}: ${error instanceof Error ? error.message : 'Unknown error'}`
        result.errors.push(errorMsg)
        log.error({ ticker: material.Ticker, err: error }, 'Failed to sync commodity')
      }
    }

    result.success = result.errors.length === 0
    log.info({ inserted: result.inserted }, 'Synced commodities')

    if (result.errors.length > 0) {
      log.warn({ errorCount: result.errors.length }, 'Errors occurred during sync')
    }

    return result
  } catch (error) {
    const errorMsg = `Failed to sync commodities: ${error instanceof Error ? error.message : 'Unknown error'}`
    result.errors.push(errorMsg)
    log.error({ err: error }, 'Failed to sync commodities')
    return result
  }
}
