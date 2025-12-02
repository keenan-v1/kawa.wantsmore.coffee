import { Body, Controller, Get, Put, Post, Path, Route, Security, Tags, Request, Query } from 'tsoa'
import type { Role } from '@kawakawa/types'
import { db, users, userRoles, roles, passwordResetTokens } from '../db/index.js'
import { eq, ilike, or, sql, desc } from 'drizzle-orm'
import type { JwtPayload } from '../utils/jwt.js'
import { NotFound, BadRequest } from '../utils/errors.js'
import { invalidateCachedRoles } from '../utils/roleCache.js'
import crypto from 'crypto'

interface AdminUser {
  id: number
  username: string
  email: string | null
  displayName: string
  isActive: boolean
  roles: Role[]
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

    // Get roles for each user
    const usersWithRoles: AdminUser[] = await Promise.all(
      userList.map(async (user) => {
        const userRolesData = await db
          .select({
            roleId: roles.id,
            roleName: roles.name,
          })
          .from(userRoles)
          .innerJoin(roles, eq(userRoles.roleId, roles.id))
          .where(eq(userRoles.userId, user.id))

        return {
          ...user,
          roles: userRolesData.map((r) => ({ id: r.roleId, name: r.roleName })),
        }
      })
    )

    return {
      users: usersWithRoles,
      total,
      page,
      pageSize,
    }
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
      })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, userId))

    return {
      ...user,
      roles: userRolesData.map((r) => ({ id: r.roleId, name: r.roleName })),
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
    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))

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
      const validRoleIds = validRoles.map((r) => r.id)
      const invalidRoles = body.roles.filter((r) => !validRoleIds.includes(r))

      if (invalidRoles.length > 0) {
        this.setStatus(400)
        throw BadRequest(`Invalid role IDs: ${invalidRoles.join(', ')}`)
      }

      // Delete existing roles
      await db.delete(userRoles).where(eq(userRoles.userId, userId))

      // Insert new roles
      if (body.roles.length > 0) {
        await db.insert(userRoles).values(
          body.roles.map((roleId) => ({
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

    const roleList = await db.select({ id: roles.id, name: roles.name }).from(roles)

    return roleList
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
}
