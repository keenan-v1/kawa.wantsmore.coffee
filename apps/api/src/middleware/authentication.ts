import { Request } from 'express'
import { eq, and, inArray } from 'drizzle-orm'
import { verifyToken, generateToken, JwtPayload } from '../utils/jwt.js'
import { getCachedRoles, setCachedRoles } from '../utils/roleCache.js'
import { db, userRoles, rolePermissions } from '../db/index.js'
import { setContextValue } from '../utils/requestContext.js'
import { Unauthorized, Forbidden } from '../utils/errors.js'

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

/**
 * Check if any of the user's roles have the required permissions
 * Returns true if the user has all required permissions granted (allowed=true)
 */
async function hasPermissions(roles: string[], requiredPermissions: string[]): Promise<boolean> {
  if (requiredPermissions.length === 0) return true
  if (roles.length === 0) return false

  // Query the role_permissions table for the required permissions and user's roles
  const grantedPermissions = await db
    .select({ permissionId: rolePermissions.permissionId })
    .from(rolePermissions)
    .where(
      and(
        inArray(rolePermissions.roleId, roles),
        inArray(rolePermissions.permissionId, requiredPermissions),
        eq(rolePermissions.allowed, true)
      )
    )

  // Create a set of granted permissions
  const grantedSet = new Set(grantedPermissions.map(p => p.permissionId))

  // Check if all required permissions are granted
  return requiredPermissions.every(p => grantedSet.has(p))
}

export async function expressAuthentication(
  request: Request,
  securityName: string,
  scopes?: string[]
): Promise<unknown> {
  if (securityName === 'jwt') {
    const token = request.headers.authorization?.split(' ')[1]

    if (!token) {
      return Promise.reject(Unauthorized('No token provided'))
    }

    try {
      const decoded = verifyToken(token)

      // Get current roles from cache/database
      const currentRoles = await getCurrentRoles(decoded.userId)

      // Determine the payload to use (with current roles if they changed)
      let payload: JwtPayload = decoded

      // Check if roles have changed
      if (!rolesMatch(decoded.roles, currentRoles)) {
        // Generate refreshed token with current roles
        payload = {
          userId: decoded.userId,
          username: decoded.username,
          roles: currentRoles,
        }
        setContextValue('refreshedToken', generateToken(payload))
      }

      // Check scopes (required permissions) if specified
      if (scopes && scopes.length > 0) {
        const hasRequiredPermissions = await hasPermissions(payload.roles, scopes)
        if (!hasRequiredPermissions) {
          return Promise.reject(Forbidden('Insufficient permissions'))
        }
      }

      return Promise.resolve(payload)
    } catch {
      return Promise.reject(Unauthorized('Invalid or expired token'))
    }
  }

  return Promise.reject(Unauthorized('Unknown security type'))
}
