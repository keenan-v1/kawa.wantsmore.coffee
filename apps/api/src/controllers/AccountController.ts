import { Body, Controller, Get, Put, Route, Security, Tags, Request } from 'tsoa'
import type { Currency, LocationDisplayMode, CommodityDisplayMode, Role } from '@kawakawa/types'
import { db, users, userSettings, userRoles, roles } from '../db/index.js'
import { eq } from 'drizzle-orm'
import { hashPassword, verifyPassword } from '../utils/password.js'
import type { JwtPayload } from '../utils/jwt.js'
import { BadRequest, NotFound } from '../utils/errors.js'
import { getPermissions } from '../utils/permissionService.js'

interface UserProfile {
  profileName: string
  displayName: string
  fioUsername: string
  hasFioApiKey: boolean // Indicates if FIO API key is configured (never expose actual key)
  preferredCurrency: Currency
  locationDisplayMode: LocationDisplayMode
  commodityDisplayMode: CommodityDisplayMode
  // FIO sync preferences
  fioAutoSync: boolean
  fioExcludedLocations: string[]
  roles: Role[]
  permissions: string[] // Permission IDs granted to this user
}

interface UpdateProfileRequest {
  displayName?: string
  fioUsername?: string
  fioApiKey?: string // FIO API key (write-only, never returned in responses)
  preferredCurrency?: Currency
  locationDisplayMode?: LocationDisplayMode
  commodityDisplayMode?: CommodityDisplayMode
  // FIO sync preferences
  fioAutoSync?: boolean
  fioExcludedLocations?: string[]
}

interface ChangePasswordRequest {
  currentPassword: string
  newPassword: string
}

@Route('account')
@Tags('Account')
@Security('jwt')
export class AccountController extends Controller {
  @Get()
  public async getProfile(@Request() request: { user: JwtPayload }): Promise<UserProfile> {
    const userId = request.user.userId

    // Query user with settings and roles
    const [user] = await db
      .select({
        username: users.username,
        displayName: users.displayName,
        fioUsername: userSettings.fioUsername,
        fioApiKey: userSettings.fioApiKey,
        preferredCurrency: userSettings.preferredCurrency,
        locationDisplayMode: userSettings.locationDisplayMode,
        commodityDisplayMode: userSettings.commodityDisplayMode,
        fioAutoSync: userSettings.fioAutoSync,
        fioExcludedLocations: userSettings.fioExcludedLocations,
      })
      .from(users)
      .leftJoin(userSettings, eq(users.id, userSettings.userId))
      .where(eq(users.id, userId))

    if (!user) {
      this.setStatus(404)
      throw new Error('User not found')
    }

    // Query user roles
    const userRolesData = await db
      .select({
        roleId: roles.id,
        roleName: roles.name,
        roleColor: roles.color,
      })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, userId))

    const roleIds = userRolesData.map(r => r.roleId)
    const rolesArray: Role[] = userRolesData.map(r => ({
      id: r.roleId,
      name: r.roleName,
      color: r.roleColor,
    }))

    // Get permissions for these roles
    const permissionsMap = await getPermissions(roleIds)
    const permissionIds = Array.from(permissionsMap.entries())
      .filter(([, allowed]) => allowed)
      .map(([id]) => id)

    return {
      profileName: user.username,
      displayName: user.displayName,
      fioUsername: user.fioUsername || '',
      hasFioApiKey: !!user.fioApiKey,
      preferredCurrency: user.preferredCurrency || 'CIS',
      locationDisplayMode: user.locationDisplayMode || 'both',
      commodityDisplayMode: user.commodityDisplayMode || 'both',
      fioAutoSync: user.fioAutoSync ?? true,
      fioExcludedLocations: user.fioExcludedLocations || [],
      roles: rolesArray,
      permissions: permissionIds,
    }
  }

  @Put()
  public async updateProfile(
    @Body() body: UpdateProfileRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<UserProfile> {
    const userId = request.user.userId

    // Update user table if displayName provided
    if (body.displayName !== undefined) {
      await db
        .update(users)
        .set({
          displayName: body.displayName,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId))
    }

    // Update user settings if any settings provided
    const settingsUpdate: Partial<typeof userSettings.$inferInsert> = {}
    if (body.fioUsername !== undefined) settingsUpdate.fioUsername = body.fioUsername
    if (body.fioApiKey !== undefined) settingsUpdate.fioApiKey = body.fioApiKey
    if (body.preferredCurrency !== undefined)
      settingsUpdate.preferredCurrency = body.preferredCurrency
    if (body.locationDisplayMode !== undefined)
      settingsUpdate.locationDisplayMode = body.locationDisplayMode
    if (body.commodityDisplayMode !== undefined)
      settingsUpdate.commodityDisplayMode = body.commodityDisplayMode
    if (body.fioAutoSync !== undefined) settingsUpdate.fioAutoSync = body.fioAutoSync
    if (body.fioExcludedLocations !== undefined)
      settingsUpdate.fioExcludedLocations = body.fioExcludedLocations

    if (Object.keys(settingsUpdate).length > 0) {
      settingsUpdate.updatedAt = new Date()
      await db.update(userSettings).set(settingsUpdate).where(eq(userSettings.userId, userId))
    }

    // Return updated profile
    return this.getProfile(request)
  }

  @Put('password')
  public async changePassword(
    @Body() body: ChangePasswordRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<{ success: boolean }> {
    const userId = request.user.userId

    // Get current password hash
    const [user] = await db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, userId))

    if (!user) {
      this.setStatus(404)
      throw NotFound('User not found')
    }

    // Verify current password
    const isValid = await verifyPassword(body.currentPassword, user.passwordHash)
    if (!isValid) {
      this.setStatus(400)
      throw BadRequest('Current password is incorrect')
    }

    // Hash new password and update
    const newPasswordHash = await hashPassword(body.newPassword)
    await db
      .update(users)
      .set({
        passwordHash: newPasswordHash,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))

    return { success: true }
  }
}
