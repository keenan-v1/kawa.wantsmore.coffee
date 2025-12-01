import { Request } from 'express'
import { verifyToken } from '../utils/jwt.js'

export function expressAuthentication(
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
      // Attach the decoded user info to the request
      return Promise.resolve(decoded)
    } catch (error) {
      return Promise.reject(new Error('Invalid or expired token'))
    }
  }

  return Promise.reject(new Error('Unknown security type'))
}
