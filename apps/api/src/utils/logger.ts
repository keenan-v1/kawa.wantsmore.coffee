import pino from 'pino'

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
 * Redact PII from log objects
 */
function redactPII(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj
  }

  if (typeof obj === 'string') {
    // Redact email patterns in strings
    return obj.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL_REDACTED]')
  }

  if (Array.isArray(obj)) {
    return obj.map(redactPII)
  }

  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase()
      if (PII_FIELDS.some(field => lowerKey.includes(field.toLowerCase()))) {
        result[key] = '[REDACTED]'
      } else {
        result[key] = redactPII(value)
      }
    }
    return result
  }

  return obj
}

/**
 * Pino configuration with PII redaction
 */
const baseConfig: pino.LoggerOptions = {
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: label => ({ level: label }),
    log: obj => redactPII(obj) as Record<string, unknown>,
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
  return logger.child(redactPII(context) as Record<string, unknown>)
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
