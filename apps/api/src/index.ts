import express, { json, urlencoded, Request, Response, NextFunction } from 'express'
import swaggerUi from 'swagger-ui-express'
import pinoHttp from 'pino-http'
import type { Options as PinoHttpOptions } from 'pino-http'
import { RegisterRoutes } from './generated/routes.js'
import swaggerDocument from './generated/swagger.json' with { type: 'json' }
import { requestContext, getContextValue } from './utils/requestContext.js'
import logger from './utils/logger.js'

const app = express()

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
  // Customize serializers
  serializers: {
    req: req => ({
      method: req.method,
      url: req.url,
      query: req.query,
    }),
    res: res => ({
      statusCode: res.statusCode,
    }),
  },
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
app.use((pinoHttp as any)(httpLoggerOptions))

app.use(json())
app.use(urlencoded({ extended: true }))

// Wrap all requests in AsyncLocalStorage context (similar to Go's context.Context)
app.use((_req: Request, res: Response, next: NextFunction) => {
  requestContext.run(new Map(), () => {
    // Intercept json() to add refreshed token header before response is sent
    const originalJson = res.json.bind(res)
    res.json = (body: unknown) => {
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
