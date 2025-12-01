/**
 * Custom HTTP error class that includes a status code
 */
export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

/**
 * Convenience functions for common HTTP errors
 */
export const BadRequest = (message: string) => new HttpError(400, message)
export const Unauthorized = (message: string) => new HttpError(401, message)
export const Forbidden = (message: string) => new HttpError(403, message)
export const NotFound = (message: string) => new HttpError(404, message)
export const Conflict = (message: string) => new HttpError(409, message)
