import {
  Body,
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Path,
  Route,
  Security,
  Tags,
  Request,
  Query,
} from 'tsoa'
import type { Role } from '@kawakawa/types'
import {
  db,
  users,
  userRoles,
  roles,
  passwordResetTokens,
  userSettings,
  permissions,
  rolePermissions,
  fioUserStorage,
  userDiscordProfiles,
} from '../db/index.js'
import { eq, ilike, or, sql, desc, max, and } from 'drizzle-orm'
import type { JwtPayload } from '../utils/jwt.js'
import { NotFound, BadRequest, Conflict } from '../utils/errors.js'
import { invalidateCachedRoles } from '../utils/roleCache.js'
import { invalidatePermissionCache } from '../utils/permissionService.js'
import crypto from 'crypto'
import { syncUserInventory } from '../services/fio/sync-user-inventory.js'

interface FioSyncInfo {
  fioUsername: string | null
  lastSyncedAt: Date | null
}

interface DiscordInfo {
  connected: boolean
  discordUsername: string | null
  discordId: string | null
  connectedAt: Date | null
}

interface AdminUser {
  id: number
  username: string
  email: string | null
  displayName: string
  isActive: boolean
  roles: Role[]
  fioSync: FioSyncInfo
  discord: DiscordInfo
  createdAt: Date
}

interface AdminUserListResponse {
  users: AdminUser[]
  total: number
  page: number
  pageSize: number
}

interface UpdateUserRequest {
  isActive?: boolean
  roles?: string[] // Array of role IDs to assign
}

interface PasswordResetLinkResponse {
  token: string
  expiresAt: Date
  username: string
}

interface UpdateRoleRequest {
  name?: string
  color?: string // Vuetify color for UI chips
}

interface CreateRoleRequest {
  id: string
  name: string
  color: string
}

interface Permission {
  id: string
  name: string
  description: string | null
}

interface RolePermission {
  id: number
  roleId: string
  permissionId: string
  allowed: boolean
}

interface RolePermissionWithDetails {
  id: number
  roleId: string
  roleName: string
  roleColor: string
  permissionId: string
  permissionName: string
  allowed: boolean
}

interface SetRolePermissionRequest {
  roleId: string
  permissionId: string
  allowed: boolean
}

@Route('admin')
@Tags('Admin')
@Security('jwt', ['administrator'])
export class AdminController extends Controller {
  /**
   * List all users with pagination and optional search
   */
  @Get('users')
  public async listUsers(
    @Query() page: number = 1,
    @Query() pageSize: number = 20,
    @Query() search?: string
  ): Promise<AdminUserListResponse> {
    const offset = (page - 1) * pageSize

    // Build search condition if search term provided
    const searchCondition = search
      ? or(
          ilike(users.username, `%${search}%`),
          ilike(users.displayName, `%${search}%`),
          ilike(users.email, `%${search}%`)
        )
      : undefined

    // Get total count
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(searchCondition)

    const total = countResult?.count ?? 0

    // Get paginated users
    const userList = await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        displayName: users.displayName,
        isActive: users.isActive,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(searchCondition)
      .orderBy(desc(users.createdAt))
      .limit(pageSize)
      .offset(offset)

    // Get roles, FIO sync info, and Discord info for each user
    const usersWithDetails: AdminUser[] = await Promise.all(
      userList.map(async user => {
        // Get user roles
        const userRolesData = await db
          .select({
            roleId: roles.id,
            roleName: roles.name,
            roleColor: roles.color,
          })
          .from(userRoles)
          .innerJoin(roles, eq(userRoles.roleId, roles.id))
          .where(eq(userRoles.userId, user.id))

        // Get FIO sync info
        const [settings] = await db
          .select({ fioUsername: userSettings.fioUsername })
          .from(userSettings)
          .where(eq(userSettings.userId, user.id))

        const [lastSync] = await db
          .select({ lastSyncedAt: max(fioUserStorage.lastSyncedAt) })
          .from(fioUserStorage)
          .where(eq(fioUserStorage.userId, user.id))

        // Get Discord info
        const [discordProfile] = await db
          .select({
            discordId: userDiscordProfiles.discordId,
            discordUsername: userDiscordProfiles.discordUsername,
            connectedAt: userDiscordProfiles.connectedAt,
          })
          .from(userDiscordProfiles)
          .where(eq(userDiscordProfiles.userId, user.id))

        return {
          ...user,
          roles: userRolesData.map(r => ({
            id: r.roleId,
            name: r.roleName,
            color: r.roleColor,
          })),
          fioSync: {
            fioUsername: settings?.fioUsername || null,
            lastSyncedAt: lastSync?.lastSyncedAt || null,
          },
          discord: {
            connected: !!discordProfile,
            discordUsername: discordProfile?.discordUsername || null,
            discordId: discordProfile?.discordId || null,
            connectedAt: discordProfile?.connectedAt || null,
          },
        }
      })
    )

    return {
      users: usersWithDetails,
      total,
      page,
      pageSize,
    }
  }

  /**
   * Get count of users pending approval (unverified users)
   */
  @Get('pending-approvals/count')
  public async getPendingApprovalsCount(): Promise<{ count: number }> {
    // Find users who have ONLY the 'unverified' role
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .innerJoin(userRoles, eq(users.id, userRoles.userId))
      .where(eq(userRoles.roleId, 'unverified'))

    return { count: result?.count ?? 0 }
  }

  /**
   * List users pending approval (unverified users)
   */
  @Get('pending-approvals')
  public async listPendingApprovals(): Promise<AdminUser[]> {
    // Get users who have the 'unverified' role
    const unverifiedUsers = await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        displayName: users.displayName,
        isActive: users.isActive,
        createdAt: users.createdAt,
      })
      .from(users)
      .innerJoin(userRoles, eq(users.id, userRoles.userId))
      .where(eq(userRoles.roleId, 'unverified'))
      .orderBy(desc(users.createdAt))

    // Get roles, FIO sync info, and Discord info for each user
    const usersWithDetails: AdminUser[] = await Promise.all(
      unverifiedUsers.map(async user => {
        const userRolesData = await db
          .select({
            roleId: roles.id,
            roleName: roles.name,
            roleColor: roles.color,
          })
          .from(userRoles)
          .innerJoin(roles, eq(userRoles.roleId, roles.id))
          .where(eq(userRoles.userId, user.id))

        const [settings] = await db
          .select({ fioUsername: userSettings.fioUsername })
          .from(userSettings)
          .where(eq(userSettings.userId, user.id))

        const [lastSync] = await db
          .select({ lastSyncedAt: max(fioUserStorage.lastSyncedAt) })
          .from(fioUserStorage)
          .where(eq(fioUserStorage.userId, user.id))

        // Get Discord info
        const [discordProfile] = await db
          .select({
            discordId: userDiscordProfiles.discordId,
            discordUsername: userDiscordProfiles.discordUsername,
            connectedAt: userDiscordProfiles.connectedAt,
          })
          .from(userDiscordProfiles)
          .where(eq(userDiscordProfiles.userId, user.id))

        return {
          ...user,
          roles: userRolesData.map(r => ({
            id: r.roleId,
            name: r.roleName,
            color: r.roleColor,
          })),
          fioSync: {
            fioUsername: settings?.fioUsername || null,
            lastSyncedAt: lastSync?.lastSyncedAt || null,
          },
          discord: {
            connected: !!discordProfile,
            discordUsername: discordProfile?.discordUsername || null,
            discordId: discordProfile?.discordId || null,
            connectedAt: discordProfile?.connectedAt || null,
          },
        }
      })
    )

    return usersWithDetails
  }

  /**
   * Approve a user - replace 'unverified' role with specified role (defaults to 'trade-partner')
   */
  @Post('users/{userId}/approve')
  public async approveUser(
    @Path() userId: number,
    @Body() body: { roleId?: string }
  ): Promise<AdminUser> {
    const targetRoleId = body.roleId || 'trade-partner'

    // Verify user exists
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId))

    if (!user) {
      this.setStatus(404)
      throw NotFound('User not found')
    }

    // Verify target role exists
    const [targetRole] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.id, targetRoleId))

    if (!targetRole) {
      this.setStatus(400)
      throw BadRequest(`Role '${targetRoleId}' not found`)
    }

    // Check if user has 'unverified' role
    const [unverifiedRoleAssignment] = await db
      .select({ id: userRoles.id })
      .from(userRoles)
      .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, 'unverified')))

    if (!unverifiedRoleAssignment) {
      this.setStatus(400)
      throw BadRequest('User is not in the pending approval queue')
    }

    // Remove 'unverified' role and add the target role
    await db
      .delete(userRoles)
      .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, 'unverified')))

    await db.insert(userRoles).values({
      userId,
      roleId: targetRoleId,
    })

    // Invalidate role cache
    invalidateCachedRoles(userId)

    // Return updated user
    return this.getUser(userId)
  }

  /**
   * Get a specific user by ID
   */
  @Get('users/{userId}')
  public async getUser(@Path() userId: number): Promise<AdminUser> {
    const [user] = await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        displayName: users.displayName,
        isActive: users.isActive,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, userId))

    if (!user) {
      this.setStatus(404)
      throw NotFound('User not found')
    }

    // Get user roles
    const userRolesData = await db
      .select({
        roleId: roles.id,
        roleName: roles.name,
        roleColor: roles.color,
      })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, userId))

    // Get FIO sync info
    const [settings] = await db
      .select({ fioUsername: userSettings.fioUsername })
      .from(userSettings)
      .where(eq(userSettings.userId, userId))

    const [lastSync] = await db
      .select({ lastSyncedAt: max(fioUserStorage.lastSyncedAt) })
      .from(fioUserStorage)
      .where(eq(fioUserStorage.userId, userId))

    // Get Discord info
    const [discordProfile] = await db
      .select({
        discordId: userDiscordProfiles.discordId,
        discordUsername: userDiscordProfiles.discordUsername,
        connectedAt: userDiscordProfiles.connectedAt,
      })
      .from(userDiscordProfiles)
      .where(eq(userDiscordProfiles.userId, userId))

    return {
      ...user,
      roles: userRolesData.map(r => ({
        id: r.roleId,
        name: r.roleName,
        color: r.roleColor,
      })),
      fioSync: {
        fioUsername: settings?.fioUsername || null,
        lastSyncedAt: lastSync?.lastSyncedAt || null,
      },
      discord: {
        connected: !!discordProfile,
        discordUsername: discordProfile?.discordUsername || null,
        discordId: discordProfile?.discordId || null,
        connectedAt: discordProfile?.connectedAt || null,
      },
    }
  }

  /**
   * Update a user's status or roles
   */
  @Put('users/{userId}')
  public async updateUser(
    @Request() request: { user: JwtPayload },
    @Path() userId: number,
    @Body() body: UpdateUserRequest
  ): Promise<AdminUser> {
    // Prevent admins from modifying their own account through admin panel
    if (userId === request.user.userId) {
      this.setStatus(400)
      throw BadRequest('Cannot modify your own account through admin panel')
    }

    // Verify user exists
    const [existingUser] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId))

    if (!existingUser) {
      this.setStatus(404)
      throw NotFound('User not found')
    }

    // Update isActive if provided
    if (body.isActive !== undefined) {
      await db
        .update(users)
        .set({
          isActive: body.isActive,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId))
    }

    // Update roles if provided
    if (body.roles !== undefined) {
      // Prevent removing all roles - users must have at least one role
      if (body.roles.length === 0) {
        this.setStatus(400)
        throw BadRequest('Users must have at least one role')
      }

      // Validate that all role IDs exist
      const validRoles = await db.select({ id: roles.id }).from(roles)
      const validRoleIds = validRoles.map(r => r.id)
      const invalidRoles = body.roles.filter(r => !validRoleIds.includes(r))

      if (invalidRoles.length > 0) {
        this.setStatus(400)
        throw BadRequest(`Invalid role IDs: ${invalidRoles.join(', ')}`)
      }

      // Delete existing roles
      await db.delete(userRoles).where(eq(userRoles.userId, userId))

      // Insert new roles
      if (body.roles.length > 0) {
        await db.insert(userRoles).values(
          body.roles.map(roleId => ({
            userId,
            roleId,
          }))
        )
      }

      // Invalidate role cache so next request gets fresh roles
      invalidateCachedRoles(userId)
    }

    // Return updated user
    return this.getUser(userId)
  }

  /**
   * List all available roles
   */
  @Get('roles')
  public async listRoles(): Promise<Role[]> {
    const roleList = await db
      .select({ id: roles.id, name: roles.name, color: roles.color })
      .from(roles)

    return roleList
  }

  /**
   * Update a role's name or color
   */
  @Put('roles/{roleId}')
  public async updateRole(@Path() roleId: string, @Body() body: UpdateRoleRequest): Promise<Role> {
    // Verify role exists
    const [existingRole] = await db
      .select({ id: roles.id, name: roles.name, color: roles.color })
      .from(roles)
      .where(eq(roles.id, roleId))

    if (!existingRole) {
      this.setStatus(404)
      throw NotFound('Role not found')
    }

    // Build update object
    const updateData: { name?: string; color?: string; updatedAt: Date } = {
      updatedAt: new Date(),
    }
    if (body.name !== undefined) updateData.name = body.name
    if (body.color !== undefined) updateData.color = body.color

    // Update role
    await db.update(roles).set(updateData).where(eq(roles.id, roleId))

    // Return updated role
    const [updatedRole] = await db
      .select({ id: roles.id, name: roles.name, color: roles.color })
      .from(roles)
      .where(eq(roles.id, roleId))

    return updatedRole
  }

  /**
   * Generate a password reset link for a user.
   * The password is NOT changed until the user uses the link.
   */
  @Post('users/{userId}/reset-password')
  public async generatePasswordResetLink(
    @Path() userId: number
  ): Promise<PasswordResetLinkResponse> {
    // Verify user exists
    const [user] = await db
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(eq(users.id, userId))

    if (!user) {
      this.setStatus(404)
      throw NotFound('User not found')
    }

    // Generate reset token
    const token = crypto.randomBytes(32).toString('hex')
    const expirationHours = parseInt(process.env.PASSWORD_RESET_EXPIRATION_HOURS || '24')
    const expiresAt = new Date(Date.now() + expirationHours * 60 * 60 * 1000)

    // Store reset token
    await db.insert(passwordResetTokens).values({
      userId: user.id,
      token,
      expiresAt,
      used: false,
    })

    return {
      token,
      expiresAt,
      username: user.username,
    }
  }

  /**
   * Trigger FIO inventory sync for a user (admin action for testing)
   */
  @Post('users/{userId}/sync-fio')
  public async syncUserFio(@Path() userId: number): Promise<{
    success: boolean
    inserted: number
    errors: string[]
    username: string
  }> {
    // Get user and their FIO credentials
    const [user] = await db
      .select({
        id: users.id,
        username: users.username,
      })
      .from(users)
      .where(eq(users.id, userId))

    if (!user) {
      this.setStatus(404)
      throw NotFound('User not found')
    }

    const [settings] = await db
      .select({
        fioUsername: userSettings.fioUsername,
        fioApiKey: userSettings.fioApiKey,
      })
      .from(userSettings)
      .where(eq(userSettings.userId, userId))

    if (!settings?.fioUsername || !settings?.fioApiKey) {
      this.setStatus(400)
      throw BadRequest('User does not have FIO credentials configured')
    }

    // Perform sync
    const result = await syncUserInventory(userId, settings.fioApiKey, settings.fioUsername)

    return {
      success: result.success,
      inserted: result.inserted,
      errors: result.errors,
      username: user.username,
    }
  }

  /**
   * Delete a user and all their data (admin action)
   */
  @Delete('users/{userId}')
  public async deleteUser(
    @Request() request: { user: JwtPayload },
    @Path() userId: number
  ): Promise<{ success: boolean; username: string }> {
    // Prevent admins from deleting their own account
    if (userId === request.user.userId) {
      this.setStatus(400)
      throw BadRequest('Cannot delete your own account')
    }

    // Verify user exists
    const [user] = await db
      .select({
        id: users.id,
        username: users.username,
      })
      .from(users)
      .where(eq(users.id, userId))

    if (!user) {
      this.setStatus(404)
      throw NotFound('User not found')
    }

    // Delete the user - cascade will handle all related data:
    // - userSettings
    // - userRoles
    // - passwordResetTokens
    // - fioUserStorage (and fioInventory through it)
    // - sellOrders
    // - buyOrders
    // - userDiscordProfiles
    // - settings.changedByUserId will be set to null
    await db.delete(users).where(eq(users.id, userId))

    // Invalidate any cached roles for this user
    invalidateCachedRoles(userId)

    return {
      success: true,
      username: user.username,
    }
  }

  /**
   * Disconnect a user's Discord account (admin action)
   */
  @Delete('users/{userId}/discord')
  public async disconnectUserDiscord(
    @Path() userId: number
  ): Promise<{ success: boolean; username: string }> {
    // Verify user exists
    const [user] = await db
      .select({
        id: users.id,
        username: users.username,
      })
      .from(users)
      .where(eq(users.id, userId))

    if (!user) {
      this.setStatus(404)
      throw NotFound('User not found')
    }

    // Check if user has Discord connected
    const [discordProfile] = await db
      .select({ id: userDiscordProfiles.id })
      .from(userDiscordProfiles)
      .where(eq(userDiscordProfiles.userId, userId))

    if (!discordProfile) {
      this.setStatus(400)
      throw BadRequest('User does not have Discord connected')
    }

    // Delete the Discord profile
    await db.delete(userDiscordProfiles).where(eq(userDiscordProfiles.userId, userId))

    return {
      success: true,
      username: user.username,
    }
  }

  // ==================== ROLE MANAGEMENT ====================

  /**
   * Create a new role
   */
  @Post('roles')
  public async createRole(@Body() body: CreateRoleRequest): Promise<Role> {
    // Check if role ID already exists
    const [existing] = await db.select({ id: roles.id }).from(roles).where(eq(roles.id, body.id))

    if (existing) {
      this.setStatus(409)
      throw Conflict(`Role with ID '${body.id}' already exists`)
    }

    // Create role
    await db.insert(roles).values({
      id: body.id,
      name: body.name,
      color: body.color,
    })

    return { id: body.id, name: body.name, color: body.color }
  }

  /**
   * Delete a role (only if no users are assigned to it)
   */
  @Delete('roles/{roleId}')
  public async deleteRole(@Path() roleId: string): Promise<{ success: boolean }> {
    // Verify role exists
    const [existing] = await db.select({ id: roles.id }).from(roles).where(eq(roles.id, roleId))

    if (!existing) {
      this.setStatus(404)
      throw NotFound('Role not found')
    }

    // Check if any users have this role
    const [userCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(userRoles)
      .where(eq(userRoles.roleId, roleId))

    if (userCount && userCount.count > 0) {
      this.setStatus(400)
      throw BadRequest(`Cannot delete role: ${userCount.count} user(s) are assigned to this role`)
    }

    // Delete role permissions first (cascade should handle this but being explicit)
    await db.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId))

    // Delete the role
    await db.delete(roles).where(eq(roles.id, roleId))

    // Invalidate permission cache
    invalidatePermissionCache()

    return { success: true }
  }

  // ==================== PERMISSION MANAGEMENT ====================

  /**
   * List all permissions
   */
  @Get('permissions')
  public async listPermissions(): Promise<Permission[]> {
    const permissionList = await db
      .select({
        id: permissions.id,
        name: permissions.name,
        description: permissions.description,
      })
      .from(permissions)
      .orderBy(permissions.id)

    return permissionList
  }

  /**
   * List all role-permission mappings with details
   */
  @Get('role-permissions')
  public async listRolePermissions(): Promise<RolePermissionWithDetails[]> {
    const mappings = await db
      .select({
        id: rolePermissions.id,
        roleId: rolePermissions.roleId,
        roleName: roles.name,
        roleColor: roles.color,
        permissionId: rolePermissions.permissionId,
        permissionName: permissions.name,
        allowed: rolePermissions.allowed,
      })
      .from(rolePermissions)
      .innerJoin(roles, eq(rolePermissions.roleId, roles.id))
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .orderBy(roles.id, permissions.id)

    return mappings
  }

  /**
   * Set a role permission (create or update)
   */
  @Post('role-permissions')
  public async setRolePermission(@Body() body: SetRolePermissionRequest): Promise<RolePermission> {
    // Verify role exists
    const [role] = await db.select({ id: roles.id }).from(roles).where(eq(roles.id, body.roleId))

    if (!role) {
      this.setStatus(404)
      throw NotFound(`Role '${body.roleId}' not found`)
    }

    // Verify permission exists
    const [permission] = await db
      .select({ id: permissions.id })
      .from(permissions)
      .where(eq(permissions.id, body.permissionId))

    if (!permission) {
      this.setStatus(404)
      throw NotFound(`Permission '${body.permissionId}' not found`)
    }

    // Check if mapping already exists
    const [existing] = await db
      .select({ id: rolePermissions.id })
      .from(rolePermissions)
      .where(
        and(
          eq(rolePermissions.roleId, body.roleId),
          eq(rolePermissions.permissionId, body.permissionId)
        )
      )

    if (existing) {
      // Update existing
      await db
        .update(rolePermissions)
        .set({ allowed: body.allowed, updatedAt: new Date() })
        .where(eq(rolePermissions.id, existing.id))

      // Invalidate cache
      invalidatePermissionCache()

      return {
        id: existing.id,
        roleId: body.roleId,
        permissionId: body.permissionId,
        allowed: body.allowed,
      }
    }

    // Create new
    const [newMapping] = await db
      .insert(rolePermissions)
      .values({
        roleId: body.roleId,
        permissionId: body.permissionId,
        allowed: body.allowed,
      })
      .returning()

    // Invalidate cache
    invalidatePermissionCache()

    return {
      id: newMapping.id,
      roleId: newMapping.roleId,
      permissionId: newMapping.permissionId,
      allowed: newMapping.allowed,
    }
  }

  /**
   * Delete a role permission mapping
   */
  @Delete('role-permissions/{id}')
  public async deleteRolePermission(@Path() id: number): Promise<{ success: boolean }> {
    // Verify mapping exists
    const [existing] = await db
      .select({ id: rolePermissions.id })
      .from(rolePermissions)
      .where(eq(rolePermissions.id, id))

    if (!existing) {
      this.setStatus(404)
      throw NotFound('Role permission mapping not found')
    }

    // Delete
    await db.delete(rolePermissions).where(eq(rolePermissions.id, id))

    // Invalidate cache
    invalidatePermissionCache()

    return { success: true }
  }
}
