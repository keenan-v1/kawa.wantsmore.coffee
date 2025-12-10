import pino from 'pino'

/**
 * Logging size limits to prevent excessive log output
 */
const MAX_STRING_LENGTH = 500
const MAX_ARRAY_ITEMS = 10
const MAX_OBJECT_DEPTH = 5

/**
 * PII fields that should be redacted from logs
 */
const PII_FIELDS = [
  'email',
  'password',
  'apiKey',
  'api_key',
  'fio_api_key',
  'fioApiKey',
  'token',
  'accessToken',
  'refreshToken',
  'authorization',
  'cookie',
  'x-auth-token',
]

/**
 * Redact PII and truncate large content for logging
 */
export function redactObject(
  obj: unknown,
  seen: WeakSet<object> = new WeakSet(),
  depth: number = 0
): unknown {
  if (obj === null || obj === undefined) {
    return obj
  }

  // Truncate at max depth
  if (depth > MAX_OBJECT_DEPTH) {
    return '[Truncated: max depth]'
  }

  if (typeof obj === 'string') {
    // Redact email patterns in strings
    let result = obj.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL_REDACTED]')
    // Truncate long strings
    if (result.length > MAX_STRING_LENGTH) {
      result =
        result.slice(0, MAX_STRING_LENGTH) +
        `... [truncated ${obj.length - MAX_STRING_LENGTH} chars]`
    }
    return result
  }

  if (typeof obj !== 'object') {
    return obj
  }

  // Handle circular references
  if (seen.has(obj)) {
    return '[Circular]'
  }
  seen.add(obj)

  if (Array.isArray(obj)) {
    const truncated = obj.slice(0, MAX_ARRAY_ITEMS).map(item => redactObject(item, seen, depth + 1))
    if (obj.length > MAX_ARRAY_ITEMS) {
      truncated.push(`[... ${obj.length - MAX_ARRAY_ITEMS} more items]`)
    }
    return truncated
  }

  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase()
    if (PII_FIELDS.some(field => lowerKey.includes(field.toLowerCase()))) {
      result[key] = '[REDACTED]'
    } else {
      result[key] = redactObject(value, seen, depth + 1)
    }
  }
  return result
}

/**
 * Pino configuration with PII redaction
 */
const baseConfig: pino.LoggerOptions = {
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: label => ({ level: label }),
    log: obj => redactObject(obj) as Record<string, unknown>,
  },
  // Remove pino's default keys we don't need for ElasticSearch
  base: {
    pid: process.pid,
    hostname: process.env.HOSTNAME || undefined,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
}

/**
 * Main application logger
 */
export const logger = pino(baseConfig)

/**
 * Create a child logger with additional context
 */
export function createLogger(context: Record<string, unknown>) {
  return logger.child(redactObject(context) as Record<string, unknown>)
}

/**
 * Logger type for use in function signatures
 */
export type Logger = pino.Logger

/**
 * Strip emojis from a string (for clean log output)
 */
export function stripEmoji(str: string): string {
  return str
    .replace(
      /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F000}-\u{1F02F}]|[\u{1F0A0}-\u{1F0FF}]/gu,
      ''
    )
    .replace(/\s+/g, ' ')
    .trim()
}

export default logger
