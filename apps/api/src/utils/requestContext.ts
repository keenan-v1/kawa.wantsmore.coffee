import { AsyncLocalStorage } from 'async_hooks'

/**
 * Request-scoped storage using AsyncLocalStorage.
 * This is Node's equivalent to Go's context.Context pattern.
 *
 * Usage:
 *   // In middleware - wrap request handling
 *   requestContext.run(new Map(), () => next())
 *
 *   // Set values during request lifecycle
 *   setContextValue('refreshedToken', token)
 *
 *   // Read values later in the same request
 *   const token = getContextValue<string>('refreshedToken')
 */
export const requestContext = new AsyncLocalStorage<Map<string, unknown>>()

/**
 * Set a value in the current request context
 */
export function setContextValue(key: string, value: unknown): void {
  const store = requestContext.getStore()
  if (store) {
    store.set(key, value)
  }
}

/**
 * Get a value from the current request context
 */
export function getContextValue<T>(key: string): T | undefined {
  const store = requestContext.getStore()
  return store?.get(key) as T | undefined
}
