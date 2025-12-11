import { Body, Controller, Delete, Get, Put, Route, Security, Tags, Request } from 'tsoa'
import type { Role } from '@kawakawa/types'
import { db, users, userRoles, roles } from '../db/index.js'
import { eq } from 'drizzle-orm'
import { hashPassword, verifyPassword } from '../utils/password.js'
import type { JwtPayload } from '../utils/jwt.js'
import { BadRequest, NotFound } from '../utils/errors.js'
import { getPermissions } from '../utils/permissionService.js'

// User profile returned by the account endpoint
// Note: Display preferences (currency, display modes) and FIO credentials are in /user-settings
interface UserProfile {
  profileName: string
  displayName: string
  email: string | null
  roles: Role[]
  permissions: string[] // Permission IDs granted to this user
}

// Update profile request
// Note: FIO credentials and display preferences are now updated via /user-settings
interface UpdateProfileRequest {
  displayName?: string
  email?: string | null
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

    // Query user basic info
    const [user] = await db
      .select({
        username: users.username,
        displayName: users.displayName,
        email: users.email,
      })
      .from(users)
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
      email: user.email,
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

    // Build update object
    const updateData: { displayName?: string; email?: string | null; updatedAt: Date } = {
      updatedAt: new Date(),
    }

    if (body.displayName !== undefined) {
      updateData.displayName = body.displayName
    }

    if (body.email !== undefined) {
      updateData.email = body.email
    }

    // Update user table if there's anything to update
    if (body.displayName !== undefined || body.email !== undefined) {
      await db.update(users).set(updateData).where(eq(users.id, userId))
    }

    // Note: FIO credentials are now updated via /user-settings endpoint

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

  /**
   * Delete the current user's account and all associated data
   * This is a permanent action that cannot be undone
   */
  @Delete()
  public async deleteAccount(
    @Request() request: { user: JwtPayload }
  ): Promise<{ success: boolean }> {
    const userId = request.user.userId

    // Verify user exists
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId))

    if (!user) {
      this.setStatus(404)
      throw NotFound('User not found')
    }

    // Delete the user - cascade will handle all related data:
    // - userSettings (key-value settings including FIO credentials)
    // - userRoles
    // - passwordResetTokens
    // - fioUserStorage (and fioInventory through it)
    // - sellOrders
    // - buyOrders
    // - userDiscordProfiles
    // - settings.changedByUserId will be set to null
    await db.delete(users).where(eq(users.id, userId))

    return { success: true }
  }
}
