import express, { json, urlencoded, Request, Response, NextFunction } from 'express'
import swaggerUi from 'swagger-ui-express'
import { RegisterRoutes } from './generated/routes.js'
import swaggerDocument from './generated/swagger.json' with { type: 'json' }

const app = express()

app.use(json())
app.use(urlencoded({ extended: true }))

// Swagger UI
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument))

// Register tsoa routes
RegisterRoutes(app)

// Error handling
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof Error) {
    console.error(err)
    res.status(500).json({
      message: err.message,
    })
  }
})

const port = process.env.PORT || 3000

app.listen(port, () => {
  console.log(`API server running at http://localhost:${port}`)
  console.log(`Swagger docs at http://localhost:${port}/api/docs`)
})
