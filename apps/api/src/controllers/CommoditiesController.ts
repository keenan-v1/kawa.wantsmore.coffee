import { Controller, Get, Path, Query, Route, Tags } from 'tsoa'
import { db, fioCommodities } from '../db/index.js'
import { eq, sql } from 'drizzle-orm'

interface Commodity {
  ticker: string
  name: string
  category: string | null
  weight: number | null
  volume: number | null
}

@Route('commodities')
@Tags('Reference Data')
export class CommoditiesController extends Controller {
  /**
   * Get all commodities
   * @param search Optional search term to filter by ticker or name
   * @param category Optional category filter
   */
  @Get()
  public async getCommodities(
    @Query() search?: string,
    @Query() category?: string
  ): Promise<Commodity[]> {
    const conditions = []

    if (search) {
      conditions.push(
        sql`${fioCommodities.ticker} ILIKE ${`%${search}%`} OR ${fioCommodities.name} ILIKE ${`%${search}%`}`
      )
    }

    if (category) {
      conditions.push(eq(fioCommodities.categoryName, category))
    }

    const results = conditions.length > 0
      ? await db.select().from(fioCommodities).where(sql`${conditions.join(' AND ')}`)
      : await db.select().from(fioCommodities)

    return results.map(c => ({
      ticker: c.ticker,
      name: c.name,
      category: c.categoryName,
      weight: c.weight ? parseFloat(c.weight) : null,
      volume: c.volume ? parseFloat(c.volume) : null,
    }))
  }

  /**
   * Get a specific commodity by ticker
   * @param ticker The commodity ticker (e.g., 'H2O', 'FE', 'RAT')
   */
  @Get('{ticker}')
  public async getCommodity(@Path() ticker: string): Promise<Commodity | null> {
    const result = await db
      .select()
      .from(fioCommodities)
      .where(eq(fioCommodities.ticker, ticker.toUpperCase()))
      .limit(1)

    if (result.length === 0) {
      this.setStatus(404)
      return null
    }

    const commodity = result[0]
    return {
      ticker: commodity.ticker,
      name: commodity.name,
      category: commodity.categoryName,
      weight: commodity.weight ? parseFloat(commodity.weight) : null,
      volume: commodity.volume ? parseFloat(commodity.volume) : null,
    }
  }

  /**
   * Get all unique categories
   */
  @Get('categories/list')
  public async getCategories(): Promise<string[]> {
    const results = await db
      .selectDistinct({ category: fioCommodities.categoryName })
      .from(fioCommodities)
      .where(sql`${fioCommodities.categoryName} IS NOT NULL`)
      .orderBy(fioCommodities.categoryName)

    return results.map(r => r.category!).filter(Boolean)
  }
}
