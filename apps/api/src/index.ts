import express, { json, urlencoded, Request, Response, NextFunction } from 'express'
import swaggerUi from 'swagger-ui-express'
import { RegisterRoutes } from './generated/routes.js'
import swaggerDocument from './generated/swagger.json' with { type: 'json' }

const app = express()

app.use(json())
app.use(urlencoded({ extended: true }))

// Middleware to add refreshed token header when roles have changed
app.use((req: Request, res: Response, next: NextFunction) => {
  const originalJson = res.json.bind(res)
  res.json = (body: unknown) => {
    if (req.refreshedToken) {
      res.setHeader('X-Refreshed-Token', req.refreshedToken)
    }
    return originalJson(body)
  }
  next()
})

// Swagger UI - at /docs since DigitalOcean routes /api/* here (stripping /api prefix)
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument))

// Register TSOA routes directly (DigitalOcean strips /api prefix before forwarding)
RegisterRoutes(app)

// Error handling
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof Error) {
    console.error(err)
    // Check if error has a statusCode property (custom HttpError)
    const statusCode =
      'statusCode' in err && typeof err.statusCode === 'number' ? err.statusCode : 500
    res.status(statusCode).json({
      message: err.message,
    })
  }
})

const port = process.env.PORT || 3000

app.listen(port, () => {
  console.log(`API server running at http://localhost:${port}`)
  console.log(`Swagger docs at http://localhost:${port}/api/docs`)
})
