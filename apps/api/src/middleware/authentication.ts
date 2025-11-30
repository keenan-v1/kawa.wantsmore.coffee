import { Request } from 'express'

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

    // TODO: Implement actual JWT verification
    // For now, just return a mock user
    return Promise.resolve({
      id: 1,
      username: 'testuser',
    })
  }

  return Promise.reject(new Error('Unknown security type'))
}
