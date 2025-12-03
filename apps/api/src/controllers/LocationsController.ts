import { Controller, Get, Path, Query, Route, Tags } from 'tsoa'
import { db, fioLocations } from '../db/index.js'
import { eq, sql } from 'drizzle-orm'

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
        sql`${fioLocations.name} ILIKE ${`%${search}%`} OR ${fioLocations.naturalId} ILIKE ${`%${search}%`} OR ${fioLocations.systemName} ILIKE ${`%${search}%`}`
      )
    }

    if (type) {
      conditions.push(eq(fioLocations.type, type))
    }

    if (system) {
      conditions.push(eq(fioLocations.systemNaturalId, system))
    }

    const results =
      conditions.length > 0
        ? await db
            .select()
            .from(fioLocations)
            .where(sql`${conditions.join(' AND ')}`)
            .orderBy(fioLocations.name)
        : await db.select().from(fioLocations).orderBy(fioLocations.name)

    return results.map(l => ({
      id: l.naturalId,
      name: l.name,
      type: l.type as LocationType,
      systemCode: l.systemNaturalId,
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
      .from(fioLocations)
      .where(eq(fioLocations.type, 'Station'))
      .orderBy(fioLocations.name)

    return results.map(l => ({
      id: l.naturalId,
      name: l.name,
      type: l.type as LocationType,
      systemCode: l.systemNaturalId,
      systemName: l.systemName,
    }))
  }

  /**
   * Get planets only
   */
  @Get('planets')
  public async getPlanets(@Query() system?: string): Promise<Location[]> {
    const results = system
      ? await db
          .select()
          .from(fioLocations)
          .where(
            sql`${fioLocations.type} = 'Planet' AND ${fioLocations.systemNaturalId} = ${system}`
          )
          .orderBy(fioLocations.name)
      : await db
          .select()
          .from(fioLocations)
          .where(eq(fioLocations.type, 'Planet'))
          .orderBy(fioLocations.name)

    return results.map(l => ({
      id: l.naturalId,
      name: l.name,
      type: l.type as LocationType,
      systemCode: l.systemNaturalId,
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
      .from(fioLocations)
      .where(eq(fioLocations.naturalId, id.toUpperCase()))
      .limit(1)

    if (result.length === 0) {
      this.setStatus(404)
      return null
    }

    const location = result[0]
    return {
      id: location.naturalId,
      name: location.name,
      type: location.type as LocationType,
      systemCode: location.systemNaturalId,
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
        code: fioLocations.systemNaturalId,
        name: fioLocations.systemName,
      })
      .from(fioLocations)
      .orderBy(fioLocations.systemName)

    return results
  }
}
