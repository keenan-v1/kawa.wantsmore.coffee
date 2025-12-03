import { Body, Controller, Get, Post, Query, Route, Tags, SuccessResponse, Response } from 'tsoa'
import { eq, and } from 'drizzle-orm'
import type { Role } from '@kawakawa/types'
import { db, users, userSettings, userRoles, roles, passwordResetTokens } from '../db/index.js'
import { hashPassword, verifyPassword } from '../utils/password.js'
import { generateToken } from '../utils/jwt.js'
import { Unauthorized, Forbidden, BadRequest, NotFound } from '../utils/errors.js'
import { getPermissions } from '../utils/permissionService.js'
import crypto from 'crypto'

interface LoginRequest {
  username: string
  password: string
}

interface RegisterRequest {
  username: string
  email?: string
  password: string
  displayName: string
}

interface RequestPasswordResetRequest {
  usernameOrEmail: string
}

interface ResetPasswordRequest {
  token: string
  newPassword: string
}

interface AuthResponse {
  token: string
  user: {
    id: number
    username: string
    displayName: string
    email?: string
    roles: Role[]
    permissions: string[] // Permission IDs granted to this user
  }
}

interface SuccessMessage {
  message: string
}

interface ValidateTokenResponse {
  valid: boolean
  username?: string
  expiresAt?: Date
}

@Route('auth')
@Tags('Authentication')
export class AuthController extends Controller {
  @Post('login')
  @SuccessResponse('200', 'Login successful')
  @Response(401, 'Invalid credentials')
  @Response(403, 'Account is inactive')
  public async login(@Body() body: LoginRequest): Promise<AuthResponse> {
    // Find user by username
    const [user] = await db.select().from(users).where(eq(users.username, body.username)).limit(1)

    if (!user) {
      throw Unauthorized('Invalid username or password')
    }

    // Verify password
    const isValid = await verifyPassword(body.password, user.passwordHash)
    if (!isValid) {
      throw Unauthorized('Invalid username or password')
    }

    // Check if account is active
    if (!user.isActive) {
      throw Forbidden('Account is inactive. Please contact an administrator.')
    }

    // Get user roles with names and colors
    const userRolesData = await db
      .select({
        roleId: roles.id,
        roleName: roles.name,
        roleColor: roles.color,
      })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, user.id))

    const roleIds = userRolesData.map(r => r.roleId)
    const roleObjects: Role[] = userRolesData.map(r => ({
      id: r.roleId,
      name: r.roleName,
      color: r.roleColor,
    }))

    // Safety check: users must have at least one role
    if (roleIds.length === 0) {
      throw Forbidden('Account has no roles assigned. Please contact an administrator.')
    }

    // Get permissions for these roles
    const permissionsMap = await getPermissions(roleIds)
    const permissionIds = Array.from(permissionsMap.entries())
      .filter(([, allowed]) => allowed)
      .map(([id]) => id)

    // Generate JWT token (still uses role IDs for compact payload)
    const token = generateToken({
      userId: user.id,
      username: user.username,
      roles: roleIds,
    })

    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        email: user.email || undefined,
        roles: roleObjects,
        permissions: permissionIds,
      },
    }
  }

  @Post('register')
  @SuccessResponse('201', 'Registration successful')
  @Response(400, 'Username already exists')
  public async register(@Body() body: RegisterRequest): Promise<AuthResponse> {
    // Check if username already exists
    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.username, body.username))
      .limit(1)

    if (existing) {
      throw BadRequest('Username already exists')
    }

    // Hash password
    const passwordHash = await hashPassword(body.password)

    // Create user
    const [newUser] = await db
      .insert(users)
      .values({
        username: body.username,
        email: body.email,
        displayName: body.displayName,
        passwordHash,
        isActive: true,
      })
      .returning()

    // Create default user settings
    await db.insert(userSettings).values({
      userId: newUser.id,
    })

    // Assign default 'unverified' role - must be approved before gaining access
    await db.insert(userRoles).values({
      userId: newUser.id,
      roleId: 'unverified',
    })

    // Get the unverified role for the response
    const [unverifiedRole] = await db
      .select({ id: roles.id, name: roles.name, color: roles.color })
      .from(roles)
      .where(eq(roles.id, 'unverified'))

    // Get permissions for unverified role (will be empty, but consistent)
    const permissionsMap = await getPermissions(['unverified'])
    const permissionIds = Array.from(permissionsMap.entries())
      .filter(([, allowed]) => allowed)
      .map(([id]) => id)

    // Generate JWT token
    const token = generateToken({
      userId: newUser.id,
      username: newUser.username,
      roles: ['unverified'],
    })

    this.setStatus(201)
    return {
      token,
      user: {
        id: newUser.id,
        username: newUser.username,
        displayName: newUser.displayName,
        email: newUser.email || undefined,
        roles: [{ id: unverifiedRole.id, name: unverifiedRole.name, color: unverifiedRole.color }],
        permissions: permissionIds,
      },
    }
  }

  @Post('request-password-reset')
  @SuccessResponse('200', 'Password reset email sent')
  @Response(404, 'User not found')
  public async requestPasswordReset(
    @Body() body: RequestPasswordResetRequest
  ): Promise<SuccessMessage> {
    // Find user by username or email
    const [user] = await db
      .select()
      .from(users)
      .where(
        body.usernameOrEmail.includes('@')
          ? eq(users.email, body.usernameOrEmail)
          : eq(users.username, body.usernameOrEmail)
      )
      .limit(1)

    if (!user) {
      this.setStatus(404)
      throw new Error('User not found')
    }

    if (!user.email) {
      this.setStatus(400)
      throw new Error('This user has no email address set. Please contact an administrator.')
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

    // TODO: Send email with reset link (integrate email service like SendGrid, AWS SES)
    // For now, administrator must generate reset link via admin panel

    return {
      message: 'Password reset instructions have been sent to your email address.',
    }
  }

  @Post('reset-password')
  @SuccessResponse('200', 'Password reset successful')
  @Response(400, 'Invalid or expired token')
  public async resetPassword(@Body() body: ResetPasswordRequest): Promise<SuccessMessage> {
    // Find reset token
    const [resetToken] = await db
      .select()
      .from(passwordResetTokens)
      .where(and(eq(passwordResetTokens.token, body.token), eq(passwordResetTokens.used, false)))
      .limit(1)

    if (!resetToken) {
      this.setStatus(400)
      throw new Error('Invalid or expired reset token')
    }

    // Check if token has expired
    if (new Date() > resetToken.expiresAt) {
      this.setStatus(400)
      throw new Error('Reset token has expired')
    }

    // Hash new password
    const passwordHash = await hashPassword(body.newPassword)

    // Update user password
    await db
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, resetToken.userId))

    // Mark token as used
    await db
      .update(passwordResetTokens)
      .set({ used: true })
      .where(eq(passwordResetTokens.id, resetToken.id))

    return {
      message: 'Password has been reset successfully. You can now log in with your new password.',
    }
  }

  @Get('validate-reset-token')
  @SuccessResponse('200', 'Token validation result')
  public async validateResetToken(@Query() token: string): Promise<ValidateTokenResponse> {
    if (!token) {
      return { valid: false }
    }

    // Find reset token
    const [resetToken] = await db
      .select({
        id: passwordResetTokens.id,
        userId: passwordResetTokens.userId,
        expiresAt: passwordResetTokens.expiresAt,
        used: passwordResetTokens.used,
      })
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.token, token))
      .limit(1)

    if (!resetToken) {
      return { valid: false }
    }

    // Check if already used
    if (resetToken.used) {
      return { valid: false }
    }

    // Check if expired
    if (new Date() > resetToken.expiresAt) {
      return { valid: false }
    }

    // Get username for display
    const [user] = await db
      .select({ username: users.username })
      .from(users)
      .where(eq(users.id, resetToken.userId))
      .limit(1)

    return {
      valid: true,
      username: user?.username,
      expiresAt: resetToken.expiresAt,
    }
  }
}
