/**
 * User display name utilities
 */

/**
 * User display information with optional FIO and display names
 */
export interface UserDisplayInfo {
  username: string
  displayName: string | null
  fioUsername?: string | null
}

/**
 * Get the best display name for a user.
 * Prefers FIO username, then display name, then username.
 *
 * @param user - User display info object
 * @returns The best available display name
 *
 * @example
 * ```typescript
 * const name = getDisplayName({
 *   username: 'john',
 *   displayName: 'John Doe',
 *   fioUsername: 'JohnFIO'
 * })
 * // Returns 'JohnFIO'
 * ```
 */
export function getDisplayName(user: UserDisplayInfo): string {
  return user.fioUsername ?? user.displayName ?? user.username
}

/**
 * Reservation/order user info with explicit owner/counterparty naming
 */
export interface ReservationUserInfo {
  ownerUsername: string
  ownerDisplayName: string | null
  ownerFioUsername: string | null
  counterpartyUsername: string
  counterpartyDisplayName: string | null
  counterpartyFioUsername: string | null
}

/**
 * Get the display name for a reservation's owner.
 *
 * @param reservation - Reservation with user info
 * @returns Owner's display name
 */
export function getOwnerDisplayName(reservation: ReservationUserInfo): string {
  return reservation.ownerFioUsername ?? reservation.ownerDisplayName ?? reservation.ownerUsername
}

/**
 * Get the display name for a reservation's counterparty.
 *
 * @param reservation - Reservation with user info
 * @returns Counterparty's display name
 */
export function getCounterpartyDisplayName(reservation: ReservationUserInfo): string {
  return (
    reservation.counterpartyFioUsername ??
    reservation.counterpartyDisplayName ??
    reservation.counterpartyUsername
  )
}
