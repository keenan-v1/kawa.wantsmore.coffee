import { Request } from 'express'
import { eq } from 'drizzle-orm'
import { verifyToken, generateToken, JwtPayload } from '../utils/jwt.js'
import { getCachedRoles, setCachedRoles } from '../utils/roleCache.js'
import { db, userRoles } from '../db/index.js'

// Extend Express Request to include refreshed token
declare global {
  namespace Express {
    interface Request {
      refreshedToken?: string
    }
  }
}

/**
 * Check if two role arrays have the same elements (order independent)
 */
function rolesMatch(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const sortedA = [...a].sort()
  const sortedB = [...b].sort()
  return sortedA.every((role, i) => role === sortedB[i])
}

/**
 * Get current roles for a user, using cache when available
 */
async function getCurrentRoles(userId: number): Promise<string[]> {
  // Check cache first
  const cached = getCachedRoles(userId)
  if (cached) return cached

  // Fetch from database
  const roles = await db
    .select({ roleId: userRoles.roleId })
    .from(userRoles)
    .where(eq(userRoles.userId, userId))

  const roleIds = roles.map(r => r.roleId)

  // Cache for future requests
  setCachedRoles(userId, roleIds)

  return roleIds
}

export async function expressAuthentication(
  request: Request,
  securityName: string,
  _scopes?: string[]
): Promise<unknown> {
  if (securityName === 'jwt') {
    const token = request.headers.authorization?.split(' ')[1]

    if (!token) {
      return Promise.reject(new Error('No token provided'))
    }

    try {
      const decoded = verifyToken(token)

      // Get current roles from cache/database
      const currentRoles = await getCurrentRoles(decoded.userId)

      // Check if roles have changed
      if (!rolesMatch(decoded.roles, currentRoles)) {
        // Generate refreshed token with current roles
        const refreshedPayload: JwtPayload = {
          userId: decoded.userId,
          username: decoded.username,
          roles: currentRoles,
        }
        request.refreshedToken = generateToken(refreshedPayload)

        // Return payload with current roles for this request
        return Promise.resolve(refreshedPayload)
      }

      // Roles match, use original token's payload
      return Promise.resolve(decoded)
    } catch (error) {
      return Promise.reject(new Error('Invalid or expired token'))
    }
  }

  return Promise.reject(new Error('Unknown security type'))
}
