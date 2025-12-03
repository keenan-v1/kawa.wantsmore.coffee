import { Controller, Get, Route, Tags } from 'tsoa'
import { db, roles } from '../db/index.js'

interface RoleResponse {
  id: string
  name: string
  color: string
}

@Route('roles')
@Tags('Reference Data')
export class RolesController extends Controller {
  /**
   * Get all roles
   * Returns the list of roles that can be used for order targeting
   */
  @Get()
  public async getRoles(): Promise<RoleResponse[]> {
    const results = await db
      .select({
        id: roles.id,
        name: roles.name,
        color: roles.color,
      })
      .from(roles)
      .orderBy(roles.name)

    return results
  }
}
