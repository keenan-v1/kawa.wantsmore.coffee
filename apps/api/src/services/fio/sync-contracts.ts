// Sync FIO contracts and auto-match to existing orders
// Creates reservations when contracts match order details
import { eq, and } from 'drizzle-orm'
import {
  db,
  fioContracts,
  fioContractConditions,
  sellOrders,
  buyOrders,
  orderReservations,
  fioLocations,
} from '../../db/index.js'
import { FioClient } from './client.js'
import type { FioApiContract, FioApiContractCondition } from './types.js'
import type { SyncResult } from './sync-types.js'
import { getCompanyCodeToUserIdMap } from './sync-user-data.js'
import { createLogger } from '../../utils/logger.js'
import type { FioContractStatus } from '@kawakawa/types'

const log = createLogger({ service: 'fio-sync', entity: 'contracts' })

export interface ContractSyncResult extends SyncResult {
  contractsProcessed: number
  conditionsProcessed: number
  reservationsCreated: number
  reservationsUpdated: number
  skippedNoMatch: number
  skippedExternalPartner: number
  skippedAlreadyLinked: number
}

/**
 * Parse location natural ID from FIO address format
 * "Benten Station (BEN)" → "BEN"
 * "YI-705c" → "YI-705c"
 */
function parseLocationFromAddress(address: string | null): string | null {
  if (!address) return null

  // Try to extract ID from parentheses: "Location Name (ID)"
  const match = address.match(/\(([^)]+)\)$/)
  if (match) {
    return match[1]
  }

  // If no parentheses, assume it's already a natural ID
  return address
}

/**
 * Map FIO contract status to our database enum
 */
function mapContractStatus(fioStatus: string): FioContractStatus {
  const statusMap: Record<string, FioContractStatus> = {
    PENDING: 'pending',
    PARTIALLY_FULFILLED: 'partially_fulfilled',
    FULFILLED: 'fulfilled',
    CLOSED: 'closed',
    BREACHED: 'breached',
    TERMINATED: 'terminated',
  }
  return statusMap[fioStatus] || 'pending'
}

/**
 * Sync a user's contracts from FIO API
 *
 * Phase 1: Store all contracts in database
 * Phase 2: Auto-match material conditions to existing orders
 *
 * @param userId - The internal user ID (syncing user)
 * @param fioApiKey - User's FIO API key
 */
export async function syncUserContracts(
  userId: number,
  fioApiKey: string
): Promise<ContractSyncResult> {
  const result: ContractSyncResult = {
    success: false,
    inserted: 0,
    updated: 0,
    errors: [],
    contractsProcessed: 0,
    conditionsProcessed: 0,
    reservationsCreated: 0,
    reservationsUpdated: 0,
    skippedNoMatch: 0,
    skippedExternalPartner: 0,
    skippedAlreadyLinked: 0,
  }

  try {
    const client = new FioClient()

    // Fetch contracts from FIO API
    log.info({ userId }, 'Fetching contracts from FIO API')
    const contracts = await client.getUserContracts<FioApiContract[]>(fioApiKey)

    // Build company code → userId map for partner matching
    const companyCodeMap = await getCompanyCodeToUserIdMap()
    log.debug({ mapSize: companyCodeMap.size }, 'Built company code map')

    // Build location lookup for validation
    const locationRows = await db.select({ naturalId: fioLocations.naturalId }).from(fioLocations)
    const validLocations = new Set(locationRows.map(l => l.naturalId))

    const now = new Date()

    // Process each contract
    for (const contract of contracts) {
      try {
        await processContract(contract, userId, companyCodeMap, validLocations, now, result)
        result.contractsProcessed++
      } catch (error) {
        const errorMsg = `Failed to process contract ${contract.ContractLocalId}: ${error instanceof Error ? error.message : 'Unknown error'}`
        result.errors.push(errorMsg)
        log.error({ contractId: contract.ContractId, err: error }, 'Failed to process contract')
      }
    }

    result.success = result.errors.length === 0
    log.info(
      {
        userId,
        contractsProcessed: result.contractsProcessed,
        reservationsCreated: result.reservationsCreated,
        skippedNoMatch: result.skippedNoMatch,
        skippedExternal: result.skippedExternalPartner,
      },
      'Contract sync complete'
    )

    return result
  } catch (error) {
    const errorMsg = `Failed to sync contracts for user ${userId}: ${error instanceof Error ? error.message : 'Unknown error'}`
    result.errors.push(errorMsg)
    log.error({ userId, err: error }, 'Failed to sync contracts')
    return result
  }
}

/**
 * Process a single contract: upsert contract and conditions, attempt auto-matching
 */
async function processContract(
  contract: FioApiContract,
  syncedByUserId: number,
  companyCodeMap: Map<string, number>,
  validLocations: Set<string>,
  now: Date,
  result: ContractSyncResult
): Promise<void> {
  // Try to match partner to an app user
  const partnerUserId = contract.PartnerCompanyCode
    ? (companyCodeMap.get(contract.PartnerCompanyCode) ?? null)
    : null

  const fioTimestamp = new Date(contract.Timestamp)
  const contractStatus = mapContractStatus(contract.Status)

  // Upsert contract
  const existing = await db
    .select({ id: fioContracts.id })
    .from(fioContracts)
    .where(eq(fioContracts.fioContractId, contract.ContractId))
    .limit(1)

  let contractDbId: number

  if (existing.length > 0) {
    // Update existing contract
    contractDbId = existing[0].id
    await db
      .update(fioContracts)
      .set({
        localId: contract.ContractLocalId,
        userParty: contract.Party,
        partnerCompanyCode: contract.PartnerCompanyCode || null,
        partnerName: contract.PartnerName,
        partnerUserId,
        status: contractStatus,
        name: contract.Name || null,
        preamble: contract.Preamble || null,
        contractDateMs: contract.DateEpochMs,
        dueDateMs: contract.DueDateEpochMs || null,
        fioTimestamp,
        updatedAt: now,
      })
      .where(eq(fioContracts.id, contractDbId))
    result.updated++
  } else {
    // Insert new contract
    const [inserted] = await db
      .insert(fioContracts)
      .values({
        fioContractId: contract.ContractId,
        localId: contract.ContractLocalId,
        syncedByUserId,
        userParty: contract.Party,
        partnerCompanyCode: contract.PartnerCompanyCode || null,
        partnerName: contract.PartnerName,
        partnerUserId,
        status: contractStatus,
        name: contract.Name || null,
        preamble: contract.Preamble || null,
        contractDateMs: contract.DateEpochMs,
        dueDateMs: contract.DueDateEpochMs || null,
        fioTimestamp,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: fioContracts.id })
    contractDbId = inserted.id
    result.inserted++
  }

  // Process each condition
  for (const condition of contract.Conditions) {
    await processCondition(
      condition,
      contractDbId,
      syncedByUserId,
      contract.Party,
      partnerUserId,
      validLocations,
      now,
      result
    )
    result.conditionsProcessed++
  }
}

/**
 * Process a single contract condition: upsert and attempt auto-matching
 */
async function processCondition(
  condition: FioApiContractCondition,
  contractDbId: number,
  syncedByUserId: number,
  userParty: 'CUSTOMER' | 'PROVIDER',
  partnerUserId: number | null,
  validLocations: Set<string>,
  now: Date,
  result: ContractSyncResult
): Promise<void> {
  // Parse location
  const locationRaw = condition.Address
  const parsedLocationId = parseLocationFromAddress(locationRaw)
  const locationId =
    parsedLocationId && validLocations.has(parsedLocationId) ? parsedLocationId : null

  // Check if condition already exists
  const existingCondition = await db
    .select({ id: fioContractConditions.id, reservationId: fioContractConditions.reservationId })
    .from(fioContractConditions)
    .where(eq(fioContractConditions.fioConditionId, condition.ConditionId))
    .limit(1)

  let conditionDbId: number
  let existingReservationId: number | null = null

  if (existingCondition.length > 0) {
    // Update existing condition (preserve reservation link)
    conditionDbId = existingCondition[0].id
    existingReservationId = existingCondition[0].reservationId
    await db
      .update(fioContractConditions)
      .set({
        conditionIndex: condition.ConditionIndex,
        type: condition.Type,
        party: condition.Party,
        status: condition.Status,
        materialTicker: condition.MaterialTicker || null,
        materialAmount: condition.MaterialAmount || null,
        locationRaw: locationRaw || null,
        locationId,
        paymentAmount: condition.Amount?.toString() || null,
        paymentCurrency: condition.Currency || null,
        updatedAt: now,
      })
      .where(eq(fioContractConditions.id, conditionDbId))
  } else {
    // Insert new condition
    const [inserted] = await db
      .insert(fioContractConditions)
      .values({
        contractId: contractDbId,
        fioConditionId: condition.ConditionId,
        conditionIndex: condition.ConditionIndex,
        type: condition.Type,
        party: condition.Party,
        status: condition.Status,
        materialTicker: condition.MaterialTicker || null,
        materialAmount: condition.MaterialAmount || null,
        locationRaw: locationRaw || null,
        locationId,
        paymentAmount: condition.Amount?.toString() || null,
        paymentCurrency: condition.Currency || null,
        reservationId: null,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: fioContractConditions.id })
    conditionDbId = inserted.id
  }

  // Skip auto-matching if:
  // - Already linked to a reservation
  // - Partner is external (no partnerUserId)
  // - Not a material condition (PAYMENT type)
  // - No material ticker or amount
  // - No valid location
  if (existingReservationId) {
    result.skippedAlreadyLinked++
    return
  }

  if (!partnerUserId) {
    result.skippedExternalPartner++
    return
  }

  if (condition.Type === 'PAYMENT') {
    // Payment conditions don't match to orders
    return
  }

  if (!condition.MaterialTicker || !condition.MaterialAmount || !locationId) {
    result.skippedNoMatch++
    return
  }

  // Attempt auto-matching
  const reservationId = await tryAutoMatch(
    condition,
    conditionDbId,
    syncedByUserId,
    userParty,
    partnerUserId,
    locationId,
    now,
    result
  )

  if (reservationId) {
    // Update condition with reservation link
    await db
      .update(fioContractConditions)
      .set({ reservationId, updatedAt: now })
      .where(eq(fioContractConditions.id, conditionDbId))
  }
}

/**
 * Try to auto-match a material condition to an existing order
 * Returns the reservation ID if matched, null otherwise
 */
async function tryAutoMatch(
  condition: FioApiContractCondition,
  conditionDbId: number,
  syncedByUserId: number,
  userParty: 'CUSTOMER' | 'PROVIDER',
  partnerUserId: number,
  locationId: string,
  now: Date,
  result: ContractSyncResult
): Promise<number | null> {
  const materialTicker = condition.MaterialTicker!
  const quantity = condition.MaterialAmount!

  // Determine which type of order to match based on user's role and condition type
  // User is PROVIDER with PROVISION condition → User has a sell order (user sells to partner)
  // User is CUSTOMER with DELIVERY/COMEX_PURCHASE_PICKUP → User has a buy order (user buys from partner)

  if (userParty === 'PROVIDER' && condition.Type === 'PROVISION') {
    // User is seller, partner is buyer
    // Find user's sell order that matches
    const [sellOrder] = await db
      .select({ id: sellOrders.id })
      .from(sellOrders)
      .where(
        and(
          eq(sellOrders.userId, syncedByUserId),
          eq(sellOrders.commodityTicker, materialTicker),
          eq(sellOrders.locationId, locationId)
        )
      )
      .limit(1)

    if (!sellOrder) {
      result.skippedNoMatch++
      return null
    }

    // Create reservation: partner (buyer) is counterparty to user's sell order
    const [reservation] = await db
      .insert(orderReservations)
      .values({
        sellOrderId: sellOrder.id,
        buyOrderId: null,
        counterpartyUserId: partnerUserId,
        quantity,
        status: mapConditionStatusToReservation(condition.Status, condition.Type),
        notes: `Auto-matched from FIO contract condition`,
        fioConditionId: conditionDbId,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: orderReservations.id })

    result.reservationsCreated++
    log.info(
      {
        reservationId: reservation.id,
        sellOrderId: sellOrder.id,
        quantity,
        ticker: materialTicker,
      },
      'Created reservation from sell order match'
    )
    return reservation.id
  }

  if (
    userParty === 'CUSTOMER' &&
    (condition.Type === 'DELIVERY' || condition.Type === 'COMEX_PURCHASE_PICKUP')
  ) {
    // User is buyer, partner is seller
    // Find user's buy order that matches
    const [buyOrder] = await db
      .select({ id: buyOrders.id })
      .from(buyOrders)
      .where(
        and(
          eq(buyOrders.userId, syncedByUserId),
          eq(buyOrders.commodityTicker, materialTicker),
          eq(buyOrders.locationId, locationId)
        )
      )
      .limit(1)

    if (!buyOrder) {
      result.skippedNoMatch++
      return null
    }

    // Create reservation: partner (seller) is counterparty to user's buy order
    const [reservation] = await db
      .insert(orderReservations)
      .values({
        sellOrderId: null,
        buyOrderId: buyOrder.id,
        counterpartyUserId: partnerUserId,
        quantity,
        status: mapConditionStatusToReservation(condition.Status, condition.Type),
        notes: `Auto-matched from FIO contract condition`,
        fioConditionId: conditionDbId,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: orderReservations.id })

    result.reservationsCreated++
    log.info(
      { reservationId: reservation.id, buyOrderId: buyOrder.id, quantity, ticker: materialTicker },
      'Created reservation from buy order match'
    )
    return reservation.id
  }

  // Condition type doesn't map to order matching
  result.skippedNoMatch++
  return null
}

/**
 * Map condition status + type to reservation status
 * - PROVISION/PAYMENT fulfilled → confirmed (payment made, goods promised)
 * - DELIVERY/COMEX_PURCHASE_PICKUP fulfilled → fulfilled (goods delivered)
 */
function mapConditionStatusToReservation(
  conditionStatus: 'PENDING' | 'FULFILLED',
  conditionType: string
): 'pending' | 'confirmed' | 'fulfilled' {
  if (conditionStatus === 'PENDING') {
    return 'pending'
  }

  // FULFILLED status
  if (conditionType === 'DELIVERY' || conditionType === 'COMEX_PURCHASE_PICKUP') {
    return 'fulfilled'
  }

  // PROVISION or PAYMENT fulfilled means confirmed
  return 'confirmed'
}
