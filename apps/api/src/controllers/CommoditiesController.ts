import { Controller, Get, Path, Query, Route, Tags } from 'tsoa'
import { db, commodities } from '../db/index.js'
import { eq, ilike, sql } from 'drizzle-orm'

interface Commodity {
  ticker: string
  name: string
  category: string | null
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
        sql`${commodities.ticker} ILIKE ${`%${search}%`} OR ${commodities.name} ILIKE ${`%${search}%`}`
      )
    }

    if (category) {
      conditions.push(eq(commodities.category, category))
    }

    const results = conditions.length > 0
      ? await db.select().from(commodities).where(sql`${conditions.join(' AND ')}`)
      : await db.select().from(commodities)

    return results.map(c => ({
      ticker: c.ticker,
      name: c.name,
      category: c.category,
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
      .from(commodities)
      .where(eq(commodities.ticker, ticker.toUpperCase()))
      .limit(1)

    if (result.length === 0) {
      this.setStatus(404)
      return null
    }

    const commodity = result[0]
    return {
      ticker: commodity.ticker,
      name: commodity.name,
      category: commodity.category,
    }
  }

  /**
   * Get all unique categories
   */
  @Get('categories/list')
  public async getCategories(): Promise<string[]> {
    const results = await db
      .selectDistinct({ category: commodities.category })
      .from(commodities)
      .where(sql`${commodities.category} IS NOT NULL`)
      .orderBy(commodities.category)

    return results.map(r => r.category!).filter(Boolean)
  }
}
