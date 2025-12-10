import express, { json, urlencoded, Request, Response, NextFunction } from 'express'
import swaggerUi from 'swagger-ui-express'
import pinoHttp from 'pino-http'
import type { Options as PinoHttpOptions } from 'pino-http'
import { RegisterRoutes } from './generated/routes.js'
import swaggerDocument from './generated/swagger.json' with { type: 'json' }
import { requestContext, getContextValue } from './utils/requestContext.js'
import logger from './utils/logger.js'

const app = express()

// Extended request/response types for body capture
interface RequestWithBody extends Request {
  _reqBody?: unknown
}
interface ResponseWithBody extends Response {
  _resBody?: unknown
}

// Parse body BEFORE logging so we can capture it
app.use(json())
app.use(urlencoded({ extended: true }))

// Capture request body immediately after parsing (before any processing)
app.use((req: Request, _res: Response, next: NextFunction) => {
  // Store a copy of the body for logging (will be redacted by logger formatter)
  if (req.body && Object.keys(req.body).length > 0) {
    ;(req as RequestWithBody)._reqBody = req.body
  }
  next()
})

// HTTP request logging with PII redaction
const httpLoggerOptions: PinoHttpOptions = {
  logger,
  // Don't log health checks, static assets, or high-frequency polling endpoints
  autoLogging: {
    ignore: req => {
      const url = req.url || ''
      return (
        url === '/health' ||
        url.startsWith('/docs') ||
        url.startsWith('/notifications/unread-count')
      )
    },
  },
  // Redact sensitive headers
  redact: ['req.headers.authorization', 'req.headers.cookie', 'req.headers["x-auth-token"]'],
  // Custom log messages that include status code
  customSuccessMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
  customErrorMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
  // Add custom properties including request/response bodies
  // Note: redaction happens in logger formatter, not here (to avoid double-redaction)
  customProps: (req, res) => {
    const props: Record<string, unknown> = {}
    const reqBody = (req as RequestWithBody)._reqBody
    const resBody = (res as ResponseWithBody)._resBody
    if (reqBody !== undefined) props.reqBody = reqBody
    if (resBody !== undefined) props.resBody = resBody
    return props
  },
  // Customize serializers - use pino's request serializer, omit redundant res object
  serializers: {
    req: pinoHttp.stdSerializers.req,
    res: () => undefined, // Status code is now in the message
  },
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
app.use((pinoHttp as any)(httpLoggerOptions))

// Wrap all requests in AsyncLocalStorage context + capture response body for logging
app.use((_req: Request, res: Response, next: NextFunction) => {
  requestContext.run(new Map(), () => {
    // Intercept json() to capture body for logging and add refreshed token header
    const originalJson = res.json.bind(res)
    res.json = (body: unknown) => {
      // Store body for logging (will be redacted by logger formatter)
      ;(res as ResponseWithBody)._resBody = body
      // Add refreshed token header if present
      const refreshedToken = getContextValue<string>('refreshedToken')
      if (refreshedToken) {
        res.setHeader('X-Refreshed-Token', refreshedToken)
      }
      return originalJson(body)
    }
    next()
  })
})

// Swagger UI - at /docs since DigitalOcean routes /api/* here (stripping /api prefix)
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument))

// Register TSOA routes directly (DigitalOcean strips /api prefix before forwarding)
RegisterRoutes(app)

// Error handling
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof Error) {
    // Check if error has a statusCode property (custom HttpError)
    const statusCode =
      'statusCode' in err && typeof err.statusCode === 'number' ? err.statusCode : 500

    // Log error with context (pino-http attaches log to req)
    const log = req.log || logger
    if (statusCode >= 500) {
      log.error({ err, statusCode }, 'Server error')
    } else {
      log.warn({ statusCode, message: err.message }, 'Client error')
    }

    res.status(statusCode).json({
      message: err.message,
    })
  }
})

const port = process.env.PORT || 3000

app.listen(port, () => {
  logger.info({ port }, 'API server started')
  logger.info({ url: `http://localhost:${port}/api/docs` }, 'Swagger docs available')
})
