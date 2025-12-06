import { Request, Response, NextFunction } from 'express'
import { verifyToken, type JwtPayload } from '../utils/jwt.js'
import { logger } from '../utils/logger.js'

// Extend Express Request to include user information
export interface AuthenticatedRequest extends Request {
  user?: JwtPayload
}

/**
 * Authentication middleware - Verifies JWT token and adds user to request
 * Looks for token in Authorization header as "Bearer <token>"
 */
export const authenticate = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  try {
    const authHeader = req.headers.authorization

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'No token provided' })
      return
    }

    const token = authHeader.substring(7) // Remove 'Bearer ' prefix
    const payload = verifyToken(token)

    req.user = payload
    next()
  } catch (_error) {
    res.status(401).json({ error: 'Invalid or expired token' })
    logger.error({ error: _error }, 'Authentication error')
  }
}

/**
 * Authorization middleware - Checks if user has required role(s)
 * @param roles - Array of role IDs that are allowed
 */
export const authorize = (...roles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' })
      return
    }

    const hasRole = roles.some(role => req.user!.roles.includes(role))

    if (!hasRole) {
      res.status(403).json({ error: 'Insufficient permissions' })
      return
    }

    next()
  }
}

/**
 * Optional authentication middleware - Adds user to request if token is valid
 * Does not return error if no token is provided (for public endpoints that can be enhanced with auth)
 */
export const optionalAuth = (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void => {
  try {
    const authHeader = req.headers.authorization

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7)
      req.user = verifyToken(token)
    }
  } catch (error) {
    logger.error({ error }, 'Optional authentication error')
  }

  next()
}
