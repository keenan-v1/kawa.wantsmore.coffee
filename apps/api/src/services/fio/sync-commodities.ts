// Sync commodities from FIO materials API to database
import { db, commodities } from '../../db/index.js'
import { fioClient } from './client.js'
import { parseCsvTyped } from './csv-parser.js'
import type { FioMaterial } from './types.js'
import type { SyncResult } from './sync-types.js'

/**
 * Sync commodities from FIO materials endpoint
 */
export async function syncCommodities(): Promise<SyncResult> {
  const result: SyncResult = {
    success: false,
    inserted: 0,
    updated: 0,
    errors: [],
  }

  try {
    console.log('📦 Fetching materials from FIO API...')
    const csvData = await fioClient.getMaterials()

    console.log('🔄 Parsing CSV data...')
    const materials = parseCsvTyped<FioMaterial>(csvData)

    console.log(`📊 Found ${materials.length} materials`)

    // Process materials
    for (const material of materials) {
      try {
        // Upsert commodity (insert or update on conflict)
          await db
            .insert(commodities)
            .values({
              ticker: material.Ticker,
              name: material.Name,
              category: material.CategoryName || null,
            })
            .onConflictDoUpdate({
              target: commodities.ticker,
              set: {
                name: material.Name,
                category: material.CategoryName || null,
                updatedAt: new Date(),
              },
            })

          result.inserted++
        } catch (error) {
        const errorMsg = `Failed to sync ${material.Ticker}: ${error instanceof Error ? error.message : 'Unknown error'}`
        result.errors.push(errorMsg)
        console.error(errorMsg)
      }
    }

    result.success = result.errors.length === 0
    console.log(`✅ Synced ${result.inserted} commodities`)

    if (result.errors.length > 0) {
      console.log(`⚠️  ${result.errors.length} errors occurred`)
    }

    return result
  } catch (error) {
    const errorMsg = `Failed to sync commodities: ${error instanceof Error ? error.message : 'Unknown error'}`
    result.errors.push(errorMsg)
    console.error(errorMsg)
    return result
  }
}
