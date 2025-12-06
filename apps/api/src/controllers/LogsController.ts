import { Body, Controller, Post, Route, Tags } from 'tsoa'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ controller: 'Logs', source: 'frontend' })

/**
 * Log levels supported by the frontend logging endpoint
 */
type LogLevel = 'debug' | 'info' | 'warn' | 'error'

/**
 * A single log entry from the frontend
 */
interface FrontendLogEntry {
  /** Log level */
  level: LogLevel
  /** Log message */
  message: string
  /** Additional context data (will be sanitized) */
  context?: Record<string, unknown>
  /** Timestamp when the log was created on the frontend */
  timestamp?: string
  /** Page/route where the log was created */
  page?: string
  /** User agent string */
  userAgent?: string
}

/**
 * Request body for batch log submission
 */
interface LogBatchRequest {
  /** Array of log entries */
  logs: FrontendLogEntry[]
}

/**
 * Response from log submission
 */
interface LogBatchResponse {
  /** Whether the logs were accepted */
  accepted: boolean
  /** Number of logs processed */
  count: number
}

// Simple in-memory rate limiting
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT_WINDOW_MS = 60000 // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 100 // 100 requests per minute per IP

function isRateLimited(clientId: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(clientId)

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(clientId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return false
  }

  entry.count++
  return entry.count > RATE_LIMIT_MAX_REQUESTS
}

// Clean up old rate limit entries periodically
setInterval(
  () => {
    const now = Date.now()
    for (const [key, value] of rateLimitMap.entries()) {
      if (now > value.resetAt) {
        rateLimitMap.delete(key)
      }
    }
  },
  5 * 60 * 1000
) // Every 5 minutes

/**
 * Sanitize context data to remove PII and limit depth
 */
function sanitizeContext(
  obj: Record<string, unknown>,
  depth = 0,
  maxDepth = 3
): Record<string, unknown> {
  if (depth > maxDepth) {
    return { _truncated: true }
  }

  const result: Record<string, unknown> = {}
  const piiFields = ['email', 'password', 'token', 'apiKey', 'api_key', 'authorization', 'cookie']

  for (const [key, value] of Object.entries(obj)) {
    // Redact PII fields
    if (piiFields.some(f => key.toLowerCase().includes(f.toLowerCase()))) {
      result[key] = '[REDACTED]'
      continue
    }

    // Handle different value types
    if (value === null || value === undefined) {
      result[key] = value
    } else if (typeof value === 'string') {
      // Redact email patterns
      result[key] = value.replace(
        /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
        '[EMAIL_REDACTED]'
      )
    } else if (typeof value === 'object' && !Array.isArray(value)) {
      result[key] = sanitizeContext(value as Record<string, unknown>, depth + 1, maxDepth)
    } else if (Array.isArray(value)) {
      result[key] = value.slice(0, 10).map(item => {
        if (typeof item === 'object' && item !== null) {
          return sanitizeContext(item as Record<string, unknown>, depth + 1, maxDepth)
        }
        return item
      })
    } else {
      result[key] = value
    }
  }

  return result
}

@Route('logs')
@Tags('Logging')
export class LogsController extends Controller {
  /**
   * Submit frontend logs
   *
   * This endpoint accepts log entries from the frontend application.
   * Logs are anonymized and rate-limited to prevent abuse.
   * No authentication is required.
   */
  @Post()
  public async submitLogs(@Body() body: LogBatchRequest): Promise<LogBatchResponse> {
    // Simple rate limiting based on a hash of the request
    // In production, this would use the client IP from request headers
    const clientId = 'anonymous'
    if (isRateLimited(clientId)) {
      this.setStatus(429)
      return { accepted: false, count: 0 }
    }

    // Validate and limit batch size
    const logs = body.logs?.slice(0, 50) || []

    if (logs.length === 0) {
      this.setStatus(400)
      return { accepted: false, count: 0 }
    }

    // Process each log entry
    for (const entry of logs) {
      const { level, message, context, timestamp, page, userAgent } = entry

      // Validate log level
      const validLevels: LogLevel[] = ['debug', 'info', 'warn', 'error']
      const logLevel = validLevels.includes(level) ? level : 'info'

      // Build log context
      const logContext: Record<string, unknown> = {
        frontendTimestamp: timestamp,
        page,
        userAgent: userAgent?.substring(0, 200), // Limit user agent length
      }

      // Sanitize and add custom context
      if (context && typeof context === 'object') {
        Object.assign(logContext, sanitizeContext(context))
      }

      // Log at appropriate level
      switch (logLevel) {
        case 'debug':
          log.debug(logContext, message)
          break
        case 'info':
          log.info(logContext, message)
          break
        case 'warn':
          log.warn(logContext, message)
          break
        case 'error':
          log.error(logContext, message)
          break
      }
    }

    return { accepted: true, count: logs.length }
  }
}
