import { db, users, userSettings } from '@kawakawa/db'
import { ilike, or, eq, and, sql } from 'drizzle-orm'

/**
 * Search for users by username, display name, or FIO username.
 */
export async function searchUsers(
  query: string,
  limit = 25
): Promise<{ id: number; username: string; displayName: string }[]> {
  if (!query.trim()) {
    return db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
      })
      .from(users)
      .limit(limit)
  }

  const searchPattern = `%${query}%`

  // Search by username, displayName, or FIO username (stored in userSettings)
  // Use a subquery to find users with matching FIO username
  const fioUsernameSubquery = db
    .select({ userId: userSettings.userId })
    .from(userSettings)
    .where(
      and(
        eq(userSettings.settingKey, 'fio.username'),
        sql`${userSettings.value}::text ILIKE ${searchPattern}`
      )
    )

  return db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
    })
    .from(users)
    .where(
      or(
        ilike(users.username, searchPattern),
        ilike(users.displayName, searchPattern),
        sql`${users.id} IN (${fioUsernameSubquery})`
      )
    )
    .limit(limit)
}
