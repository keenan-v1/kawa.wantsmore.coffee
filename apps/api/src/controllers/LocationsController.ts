import { Controller, Get, Path, Query, Route, Tags } from 'tsoa'
import { db, locations } from '../db/index.js'
import { eq, or, ilike, sql } from 'drizzle-orm'

type LocationType = 'Station' | 'Planet'

interface Location {
  id: string
  name: string
  type: LocationType
  systemCode: string
  systemName: string
}

@Route('locations')
@Tags('Reference Data')
export class LocationsController extends Controller {
  /**
   * Get all locations
   * @param search Optional search term to filter by name, id, or system
   * @param type Optional filter by location type ('Station' or 'Planet')
   * @param system Optional filter by system code
   */
  @Get()
  public async getLocations(
    @Query() search?: string,
    @Query() type?: LocationType,
    @Query() system?: string
  ): Promise<Location[]> {
    const conditions = []

    if (search) {
      conditions.push(
        sql`${locations.name} ILIKE ${`%${search}%`} OR ${locations.id} ILIKE ${`%${search}%`} OR ${locations.systemName} ILIKE ${`%${search}%`}`
      )
    }

    if (type) {
      conditions.push(eq(locations.type, type))
    }

    if (system) {
      conditions.push(eq(locations.systemCode, system))
    }

    const results = conditions.length > 0
      ? await db.select().from(locations).where(sql`${conditions.join(' AND ')}`).orderBy(locations.name)
      : await db.select().from(locations).orderBy(locations.name)

    return results.map(l => ({
      id: l.id,
      name: l.name,
      type: l.type as LocationType,
      systemCode: l.systemCode,
      systemName: l.systemName,
    }))
  }

  /**
   * Get stations only
   */
  @Get('stations')
  public async getStations(): Promise<Location[]> {
    const results = await db
      .select()
      .from(locations)
      .where(eq(locations.type, 'Station'))
      .orderBy(locations.name)

    return results.map(l => ({
      id: l.id,
      name: l.name,
      type: l.type as LocationType,
      systemCode: l.systemCode,
      systemName: l.systemName,
    }))
  }

  /**
   * Get planets only
   */
  @Get('planets')
  public async getPlanets(
    @Query() system?: string
  ): Promise<Location[]> {
    const results = system
      ? await db
          .select()
          .from(locations)
          .where(sql`${locations.type} = 'Planet' AND ${locations.systemCode} = ${system}`)
          .orderBy(locations.name)
      : await db
          .select()
          .from(locations)
          .where(eq(locations.type, 'Planet'))
          .orderBy(locations.name)

    return results.map(l => ({
      id: l.id,
      name: l.name,
      type: l.type as LocationType,
      systemCode: l.systemCode,
      systemName: l.systemName,
    }))
  }

  /**
   * Get a specific location by ID
   * @param id The location ID (e.g., 'BEN', 'UV-351a')
   */
  @Get('{id}')
  public async getLocation(@Path() id: string): Promise<Location | null> {
    const result = await db
      .select()
      .from(locations)
      .where(eq(locations.id, id.toUpperCase()))
      .limit(1)

    if (result.length === 0) {
      this.setStatus(404)
      return null
    }

    const location = result[0]
    return {
      id: location.id,
      name: location.name,
      type: location.type as LocationType,
      systemCode: location.systemCode,
      systemName: location.systemName,
    }
  }

  /**
   * Get all unique systems
   */
  @Get('systems/list')
  public async getSystems(): Promise<Array<{ code: string; name: string }>> {
    const results = await db
      .selectDistinct({
        code: locations.systemCode,
        name: locations.systemName,
      })
      .from(locations)
      .orderBy(locations.systemName)

    return results
  }
}
