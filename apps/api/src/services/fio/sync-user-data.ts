// Sync FIO user profile data to database
// Used to capture company codes for contract partner matching
import { eq } from 'drizzle-orm'
import { db, fioUserData } from '../../db/index.js'
import { FioClient } from './client.js'
import type { FioApiUserData } from './types.js'
import type { SyncResult } from './sync-types.js'
import { createLogger } from '../../utils/logger.js'

const log = createLogger({ service: 'fio-sync', entity: 'user-data' })

export interface UserDataSyncResult extends SyncResult {
  companyCode: string | null
  corporationCode: string | null
  fioTimestamp: string | null
}

/**
 * Sync a user's profile data from FIO API
 *
 * Captures company code (for contract partner matching), corporation info,
 * and other profile data. This is called as part of the FIO sync flow.
 *
 * @param userId - The internal user ID
 * @param fioApiKey - User's FIO API key
 * @param fioUsername - User's FIO username
 */
export async function syncFioUserData(
  userId: number,
  fioApiKey: string,
  fioUsername: string
): Promise<UserDataSyncResult> {
  const result: UserDataSyncResult = {
    success: false,
    inserted: 0,
    updated: 0,
    errors: [],
    companyCode: null,
    corporationCode: null,
    fioTimestamp: null,
  }

  try {
    const client = new FioClient()

    // Fetch user data from FIO API
    log.info({ userId, fioUsername }, 'Fetching user data from FIO API')
    const userData = await client.getUserData<FioApiUserData>(fioApiKey, fioUsername)

    // Parse timestamp
    const fioTimestamp = new Date(userData.Timestamp)
    result.fioTimestamp = fioTimestamp.toISOString()
    result.companyCode = userData.CompanyCode || null
    result.corporationCode = userData.CorporationCode || null

    // Check if user data already exists
    const existing = await db
      .select({ id: fioUserData.id })
      .from(fioUserData)
      .where(eq(fioUserData.userId, userId))
      .limit(1)

    const now = new Date()

    if (existing.length > 0) {
      // Update existing record
      await db
        .update(fioUserData)
        .set({
          fioUserId: userData.UserId,
          fioUserName: userData.UserName,
          companyId: userData.CompanyId || null,
          companyName: userData.CompanyName || null,
          companyCode: userData.CompanyCode || null,
          corporationId: userData.CorporationId || null,
          corporationName: userData.CorporationName || null,
          corporationCode: userData.CorporationCode || null,
          countryId: userData.CountryId || null,
          countryCode: userData.CountryCode || null,
          countryName: userData.CountryName || null,
          fioTimestamp,
          updatedAt: now,
        })
        .where(eq(fioUserData.userId, userId))

      result.updated = 1
      log.info({ userId, companyCode: userData.CompanyCode }, 'Updated FIO user data')
    } else {
      // Insert new record
      await db.insert(fioUserData).values({
        userId,
        fioUserId: userData.UserId,
        fioUserName: userData.UserName,
        companyId: userData.CompanyId || null,
        companyName: userData.CompanyName || null,
        companyCode: userData.CompanyCode || null,
        corporationId: userData.CorporationId || null,
        corporationName: userData.CorporationName || null,
        corporationCode: userData.CorporationCode || null,
        countryId: userData.CountryId || null,
        countryCode: userData.CountryCode || null,
        countryName: userData.CountryName || null,
        fioTimestamp,
        createdAt: now,
        updatedAt: now,
      })

      result.inserted = 1
      log.info({ userId, companyCode: userData.CompanyCode }, 'Inserted FIO user data')
    }

    result.success = true
    return result
  } catch (error) {
    const errorMsg = `Failed to sync FIO user data for user ${userId}: ${error instanceof Error ? error.message : 'Unknown error'}`
    result.errors.push(errorMsg)
    log.error({ userId, err: error }, 'Failed to sync FIO user data')
    return result
  }
}

/**
 * Get a user's synced FIO profile data
 */
export async function getUserFioData(userId: number) {
  const results = await db.select().from(fioUserData).where(eq(fioUserData.userId, userId)).limit(1)

  return results[0] || null
}

/**
 * Get all users with FIO data synced (for contract partner matching)
 * Returns a map of companyCode -> userId
 */
export async function getCompanyCodeToUserIdMap(): Promise<Map<string, number>> {
  const results = await db
    .select({
      userId: fioUserData.userId,
      companyCode: fioUserData.companyCode,
    })
    .from(fioUserData)

  const map = new Map<string, number>()
  for (const row of results) {
    if (row.companyCode) {
      map.set(row.companyCode, row.userId)
    }
  }
  return map
}
