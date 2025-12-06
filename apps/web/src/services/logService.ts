/**
 * Frontend logging service
 *
 * Sends logs to the backend for aggregation and analysis.
 * Logs are batched and sent periodically to reduce network overhead.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  level: LogLevel
  message: string
  context?: Record<string, unknown>
  timestamp: string
  page: string
  userAgent: string
}

// Configuration
const BATCH_SIZE = 10
const FLUSH_INTERVAL_MS = 30000 // 30 seconds
const MAX_QUEUE_SIZE = 100

// Log queue
let logQueue: LogEntry[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Sanitize context data to remove potential PII before sending
 */
function sanitizeContext(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  const piiFields = ['email', 'password', 'token', 'apiKey', 'authorization']

  for (const [key, value] of Object.entries(obj)) {
    // Skip PII fields
    if (piiFields.some(f => key.toLowerCase().includes(f.toLowerCase()))) {
      continue
    }

    // Handle different value types
    if (value === null || value === undefined) {
      result[key] = value
    } else if (typeof value === 'string') {
      // Redact email patterns
      result[key] = value.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]')
    } else if (typeof value === 'object' && !Array.isArray(value)) {
      result[key] = sanitizeContext(value as Record<string, unknown>)
    } else if (Array.isArray(value)) {
      result[key] = value.slice(0, 5) // Limit array size
    } else {
      result[key] = value
    }
  }

  return result
}

/**
 * Send queued logs to the backend
 */
async function flushLogs(): Promise<void> {
  if (logQueue.length === 0) {
    return
  }

  const logsToSend = logQueue.splice(0, BATCH_SIZE)

  try {
    const response = await fetch('/api/logs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ logs: logsToSend }),
    })

    if (!response.ok) {
      // If rate limited or error, put logs back in queue (at front)
      if (response.status === 429) {
        logQueue.unshift(...logsToSend)
        // Trim queue if too large
        if (logQueue.length > MAX_QUEUE_SIZE) {
          logQueue = logQueue.slice(0, MAX_QUEUE_SIZE)
        }
      }
    }
  } catch {
    // Network error - silently drop logs to avoid cascading errors
    // In production, you might want to store these in localStorage for retry
  }

  // Continue flushing if more logs in queue
  if (logQueue.length > 0) {
    scheduleFlush()
  }
}

/**
 * Schedule a flush of logs
 */
function scheduleFlush(): void {
  if (flushTimer) {
    return
  }

  flushTimer = setTimeout(() => {
    flushTimer = null
    flushLogs()
  }, FLUSH_INTERVAL_MS)
}

/**
 * Add a log entry to the queue
 */
function queueLog(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  const entry: LogEntry = {
    level,
    message,
    context: context ? sanitizeContext(context) : undefined,
    timestamp: new Date().toISOString(),
    page: window.location.pathname,
    userAgent: navigator.userAgent,
  }

  logQueue.push(entry)

  // Trim queue if too large
  if (logQueue.length > MAX_QUEUE_SIZE) {
    logQueue = logQueue.slice(-MAX_QUEUE_SIZE)
  }

  // Flush immediately for errors or if batch is full
  if (level === 'error' || logQueue.length >= BATCH_SIZE) {
    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = null
    }
    flushLogs()
  } else {
    scheduleFlush()
  }
}

/**
 * Logger interface
 */
export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => {
    queueLog('debug', message, context)
  },

  info: (message: string, context?: Record<string, unknown>) => {
    queueLog('info', message, context)
  },

  warn: (message: string, context?: Record<string, unknown>) => {
    queueLog('warn', message, context)
  },

  error: (message: string, context?: Record<string, unknown>) => {
    queueLog('error', message, context)
  },

  /**
   * Log an error object with stack trace
   */
  logError: (error: Error, context?: Record<string, unknown>) => {
    queueLog('error', error.message, {
      ...context,
      errorName: error.name,
      stack: error.stack?.split('\n').slice(0, 5).join('\n'), // Limit stack trace
    })
  },

  /**
   * Flush any pending logs immediately
   */
  flush: () => flushLogs(),
}

/**
 * Install global error handlers
 */
export function installErrorHandlers(): void {
  // Capture unhandled errors
  window.addEventListener('error', event => {
    logger.error('Unhandled error', {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    })
  })

  // Capture unhandled promise rejections
  window.addEventListener('unhandledrejection', event => {
    const reason = event.reason
    if (reason instanceof Error) {
      logger.logError(reason, { type: 'unhandledrejection' })
    } else {
      logger.error('Unhandled promise rejection', {
        reason: String(reason),
        type: 'unhandledrejection',
      })
    }
  })

  // Flush logs before page unload
  window.addEventListener('beforeunload', () => {
    logger.flush()
  })

  // Also flush on visibility change (user switches tabs)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      logger.flush()
    }
  })
}

export default logger
